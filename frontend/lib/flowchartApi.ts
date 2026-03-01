import { DiagramGraph, ChatMessage, IntentType, StreamEvent, ClarifyQuestion } from '@/types/flowchart';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function* sseStream(url: string, body: unknown): AsyncGenerator<StreamEvent> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`Stream request failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ') && line.length > 6) {
          yield JSON.parse(line.slice(6)) as StreamEvent;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export const flowchartAPI = {
  async generateDiagram(
    prompt: string,
    chatHistory: Pick<ChatMessage, 'role' | 'content'>[]
  ): Promise<DiagramGraph> {
    const res = await fetch(`${BASE_URL}/flowchart/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, chatHistory }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to generate diagram');
    }
    const data = await res.json();
    return data.graph;
  },

  async editDiagram(
    currentGraph: DiagramGraph,
    instruction: string,
    chatHistory: Pick<ChatMessage, 'role' | 'content'>[]
  ): Promise<DiagramGraph> {
    const res = await fetch(`${BASE_URL}/flowchart/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentGraph, instruction, chatHistory }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to edit diagram');
    }
    const data = await res.json();
    return data.graph;
  },

  async getClarifyingQuestions(
    prompt: string,
    chatHistory: Pick<ChatMessage, 'role' | 'content'>[]
  ): Promise<ClarifyQuestion[]> {
    try {
      const res = await fetch(`${BASE_URL}/flowchart/clarify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, chatHistory }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.questions) ? data.questions : [];
    } catch {
      return []; // always graceful — caller skips clarification if empty
    }
  },

  async classifyIntent(message: string): Promise<IntentType> {
    const res = await fetch(`${BASE_URL}/flowchart/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) return 'new_diagram';
    const data = await res.json();
    return data.intent;
  },

  async *streamGenerate(
    prompt: string,
    chatHistory: Pick<ChatMessage, 'role' | 'content'>[]
  ): AsyncGenerator<StreamEvent> {
    yield* sseStream(`${BASE_URL}/flowchart/generate/stream`, { prompt, chatHistory });
  },

  async *streamEdit(
    currentGraph: DiagramGraph,
    instruction: string,
    chatHistory: Pick<ChatMessage, 'role' | 'content'>[]
  ): AsyncGenerator<StreamEvent> {
    yield* sseStream(`${BASE_URL}/flowchart/edit/stream`, { currentGraph, instruction, chatHistory });
  },

  async uploadDocument(file: File): Promise<{ extractedText: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE_URL}/flowchart/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to process file');
    }
    return res.json();
  },
};
