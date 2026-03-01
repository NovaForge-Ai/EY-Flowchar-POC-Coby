import OpenAI from 'openai';
import { DiagramGraph, ChatMessage, IntentType, StreamEvent, ClarifyQuestion } from '../models/Flowchart';

/**
 * Robustly extract a JSON object from model output that may contain:
 * - <think>...</think> reasoning blocks
 * - markdown code fences (```json ... ```)
 * - leading/trailing prose
 *
 * Strategy: strip known wrappers, then use a balanced-brace scanner to find
 * the outermost { } block — making it resilient to any extra surrounding text.
 */
function extractJSON(raw: string): string {
  // 1. Strip reasoning blocks
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 2. Strip markdown fences (anywhere in the string)
  s = s.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');

  // 3. Find the outermost balanced { } using a scanner
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (s[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        return s.slice(start, i + 1);
      }
    }
  }

  // Fallback: return trimmed string and let JSON.parse surface the error
  return s.trim();
}

function getClient() {
  return new OpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_PROVIDER_URL,
  });
}

const MODEL = 'minimaxai/minimax-m2.5';

const GENERATION_SYSTEM_PROMPT = `You are a flowchart generation assistant. When given a description, return ONLY a valid JSON object matching this exact schema — no markdown, no explanation, no code fences.

Schema:
{
  "id": "unique-string-id",
  "title": "Diagram title",
  "type": "process_flow|decision_tree|swimlane|dfd|entity_relationship|network|timeline",
  "nodes": [
    { "id": "n1", "label": "Short label (max 8 words)", "type": "process|decision|start|end|io|database|external|swimlane_header" }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "label": "optional", "type": "default|conditional|data_flow" }
  ],
  "metadata": { "createdAt": "ISO timestamp", "version": 1, "description": "optional" }
}

Rules:
- Choose the most appropriate diagram type based on the description
- Use concise node labels (max 8 words)
- Every node and edge must have a unique string ID (n1, n2... e1, e2...)
- Start nodes have type "start", end nodes have type "end", decision points have type "decision"
- Return ONLY the JSON object, nothing else`;

const EDIT_SYSTEM_PROMPT = `You are editing an existing flowchart based on a user instruction. Return ONLY the updated DiagramGraph JSON — no markdown, no explanation, no code fences.

Rules:
- Apply minimal changes — only modify what the user explicitly asked for
- Preserve ALL existing node IDs exactly as-is
- Increment the version number in metadata by 1
- Update metadata.createdAt to current ISO timestamp
- Return ONLY the complete updated JSON object`;

const INTENT_SYSTEM_PROMPT = `Classify the user's message intent for a flowchart application. Reply with ONLY one of these exact words: new_diagram, edit, export_request, clarification

- new_diagram: user wants to create a new flowchart from scratch
- edit: user wants to modify/change something in an existing flowchart
- export_request: user wants to export or download the diagram
- clarification: user is asking a question or providing more context`;

const CLARIFY_SYSTEM_PROMPT = `You are a flowchart design assistant. Given a user's request to create a flowchart, generate exactly 3 targeted clarifying questions to remove ambiguity before drawing.

Return ONLY a valid JSON object — no markdown, no explanation, no code fences:
{
  "questions": [
    {
      "id": "q1",
      "question": "Specific question about their domain?",
      "options": ["Option A", "Option B", "Option C", "Option D"]
    }
  ]
}

Rules:
- Questions must be SPECIFIC to the user's domain and context — never generic
- Each question must have exactly 3–4 short options (max 6 words each)
- Cover the 3 most impactful unknowns: scope/paths, detail level, key stakeholders or edge cases
- Do NOT ask about anything clearly stated in the prompt
- Return ONLY the JSON object, nothing else`;

// ── Shared streaming core ────────────────────────────────────────────────────

async function* streamCompletion(
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): AsyncGenerator<StreamEvent> {
  const stream = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: 16384,
    messages,
    stream: true,
  });

  let accumulated = '';
  let lastEmitted = 0;
  type State = 'pre_think' | 'in_think' | 'post_think';
  let state: State = 'pre_think';

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (!delta) continue;
    accumulated += delta;

    // State machine: route chunks to thinking vs generating events
    let loop = true;
    while (loop) {
      loop = false;
      if (state === 'pre_think') {
        const start = accumulated.indexOf('<think>');
        if (start === -1) {
          const text = accumulated.slice(lastEmitted);
          if (text) yield { type: 'generating', text };
          lastEmitted = accumulated.length;
        } else {
          lastEmitted = start + '<think>'.length;
          state = 'in_think';
          loop = true;
        }
      } else if (state === 'in_think') {
        const end = accumulated.indexOf('</think>', lastEmitted);
        if (end === -1) {
          const text = accumulated.slice(lastEmitted);
          if (text) yield { type: 'thinking', text };
          lastEmitted = accumulated.length;
        } else {
          const text = accumulated.slice(lastEmitted, end);
          if (text) yield { type: 'thinking', text };
          lastEmitted = end + '</think>'.length;
          state = 'post_think';
          loop = true;
        }
      } else {
        const text = accumulated.slice(lastEmitted);
        if (text) yield { type: 'generating', text };
        lastEmitted = accumulated.length;
      }
    }
  }

  try {
    const graph: DiagramGraph = JSON.parse(extractJSON(accumulated));
    yield { type: 'complete', graph };
  } catch {
    yield { type: 'error', message: 'Model response was not valid JSON. Try rephrasing your request.' };
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function getClarifyingQuestions(
  prompt: string,
  chatHistory: ChatMessage[]
): Promise<ClarifyQuestion[]> {
  const response = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: CLARIFY_SYSTEM_PROMPT },
      ...chatHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: prompt },
    ],
  });

  const raw = (response.choices[0].message.content || '').trim();
  try {
    const parsed = JSON.parse(extractJSON(raw));
    return Array.isArray(parsed.questions) ? parsed.questions : [];
  } catch {
    return []; // graceful fallback — caller skips clarification if empty
  }
}

export async function classifyIntent(message: string): Promise<IntentType> {
  const response = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: 20,
    messages: [
      { role: 'system', content: INTENT_SYSTEM_PROMPT },
      { role: 'user', content: message },
    ],
  });

  const text = (response.choices[0].message.content || '').trim().toLowerCase();
  const valid: IntentType[] = ['new_diagram', 'edit', 'export_request', 'clarification'];
  return valid.includes(text as IntentType) ? (text as IntentType) : 'new_diagram';
}

export async function generateDiagram(
  prompt: string,
  chatHistory: ChatMessage[]
): Promise<DiagramGraph> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: GENERATION_SYSTEM_PROMPT },
    ...chatHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: prompt },
  ];

  const response = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: 16384,
    messages,
  });

  const raw = (response.choices[0].message.content || '').trim();
  return JSON.parse(extractJSON(raw));
}

export async function editDiagram(
  currentGraph: DiagramGraph,
  instruction: string,
  chatHistory: ChatMessage[]
): Promise<DiagramGraph> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: EDIT_SYSTEM_PROMPT },
    ...chatHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    {
      role: 'user',
      content: `Current flowchart JSON:\n${JSON.stringify(currentGraph, null, 2)}\n\nEdit instruction: ${instruction}`,
    },
  ];

  const response = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: 16384,
    messages,
  });

  const raw = (response.choices[0].message.content || '').trim();
  return JSON.parse(extractJSON(raw));
}

export function streamGenerateDiagram(
  prompt: string,
  chatHistory: ChatMessage[]
): AsyncGenerator<StreamEvent> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: GENERATION_SYSTEM_PROMPT },
    ...chatHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: prompt },
  ];
  return streamCompletion(messages);
}

export function streamEditDiagram(
  currentGraph: DiagramGraph,
  instruction: string,
  chatHistory: ChatMessage[]
): AsyncGenerator<StreamEvent> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: EDIT_SYSTEM_PROMPT },
    ...chatHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    {
      role: 'user',
      content: `Current flowchart JSON:\n${JSON.stringify(currentGraph, null, 2)}\n\nEdit instruction: ${instruction}`,
    },
  ];
  return streamCompletion(messages);
}
