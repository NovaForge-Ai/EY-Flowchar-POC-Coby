'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, Undo2, Redo2, Trash2, Loader2, ChevronDown, ChevronRight, Brain } from 'lucide-react';
import { useFlowchartStore } from '@/store/flowchartStore';
import { flowchartAPI } from '@/lib/flowchartApi';
import { parsePartialGraph } from '@/lib/partialGraphParser';
import { ChatMessage, ClarifyQuestion } from '@/types/flowchart';
import StreamingMessage, { StreamingState } from './StreamingMessage';
import ClarifyingQuestions from './ClarifyingQuestions';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Collapsible reasoning block shown on completed assistant messages. */
function ThinkingLog({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-violet-800/50 bg-violet-950/40 overflow-hidden mb-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-violet-900/20 transition-colors"
      >
        <Brain size={12} className="text-violet-400 shrink-0" />
        <span className="text-[11px] font-medium text-violet-300 flex-1">Diagram reasoning</span>
        {open
          ? <ChevronDown size={11} className="text-violet-500 shrink-0" />
          : <ChevronRight size={11} className="text-violet-500 shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-3 max-h-[200px] overflow-y-auto">
          <p className="text-[11px] text-violet-300/70 leading-relaxed whitespace-pre-wrap font-mono">{text}</p>
        </div>
      )}
    </div>
  );
}

export default function ChatPanel() {
  const [input, setInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [streamState, setStreamState] = useState<StreamingState | null>(null);
  const [isClarifying, setIsClarifying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    chatMessages,
    currentGraph,
    isGenerating,
    historyStack,
    redoStack,
    addMessage,
    updateLastMessage,
    finalizeLastMessage,
    setGraph,
    setGenerating,
    setError,
    setStreamingGraph,
    undo,
    redo,
    clearSession,
  } = useFlowchartStore();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, streamState]);

  const llmHistory = chatMessages
    .filter((m) => !m.isLoading && !m.clarifyQuestions)
    .map((m) => ({ role: m.role, content: m.content }));

  // ── Core streaming runner ─────────────────────────────────────────────────
  const runStream = useCallback(
    async (isEdit: boolean, prompt: string) => {
      setGenerating(true);
      setError(null);
      setStreamState({ phase: 'thinking', thinkingText: '', nodeCount: 0, isEdit });

      let thinkingText = '';
      let nodeCount = 0;
      let jsonBuffer = '';

      try {
        const stream = isEdit && currentGraph
          ? flowchartAPI.streamEdit(currentGraph, prompt, llmHistory)
          : flowchartAPI.streamGenerate(prompt, llmHistory);

        for await (const event of stream) {
          if (event.type === 'thinking') {
            thinkingText += event.text;
            setStreamState({ phase: 'thinking', thinkingText, nodeCount, isEdit });
          } else if (event.type === 'generating') {
            jsonBuffer += event.text;
            nodeCount = (jsonBuffer.match(/"id"\s*:/g) || []).length;
            setStreamState({ phase: 'building', thinkingText, nodeCount, isEdit });
            const partial = parsePartialGraph(jsonBuffer);
            if (partial.nodes.length > 0) setStreamingGraph(partial);
          } else if (event.type === 'complete') {
            setGraph(event.graph);
            finalizeLastMessage(
              `${isEdit ? 'Updated' : 'Generated'} "${event.graph.title}" — ${event.graph.nodes.length} nodes, ${event.graph.edges.length} edges.`,
              thinkingText
            );
            setStreamState(null);
          } else if (event.type === 'error') {
            finalizeLastMessage(`Error: ${event.message}`, thinkingText);
            setError(event.message);
            setStreamState(null);
            setStreamingGraph(null);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong';
        finalizeLastMessage(`Error: ${msg}`, thinkingText);
        setError(msg);
        setStreamState(null);
        setStreamingGraph(null);
      } finally {
        setGenerating(false);
      }
    },
    [currentGraph, llmHistory, setGraph, setGenerating, setError, finalizeLastMessage, setStreamingGraph]
  );

  // ── Clarification handlers ─────────────────────────────────────────────────
  const handleClarifySubmit = useCallback(
    async (originalPrompt: string, answers: Record<string, string>, questions: ClarifyQuestion[]) => {
      setIsClarifying(false);

      // Replace the clarify message with a summary of answers
      const answerSummary = questions
        .map((q) => `• ${q.question}: **${answers[q.id]}**`)
        .join('\n');
      updateLastMessage(answerSummary);

      // Add the assistant loading bubble
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isLoading: true,
      });

      // Build enriched prompt
      const enriched = [
        originalPrompt,
        '',
        'Additional context from user:',
        ...questions.map((q) => `- ${q.question}: ${answers[q.id]}`),
      ].join('\n');

      await runStream(false, enriched);
    },
    [addMessage, updateLastMessage, runStream]
  );

  // ── Main send ──────────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isGenerating || isClarifying) return;

      addMessage({
        id: generateId(),
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      });

      // For edits, skip clarification
      if (currentGraph) {
        const intent = await flowchartAPI.classifyIntent(text);
        if (intent === 'export_request') {
          addMessage({
            id: generateId(),
            role: 'assistant',
            content: 'Use the export buttons in the diagram toolbar to download your diagram.',
            timestamp: new Date().toISOString(),
          });
          return;
        }
        if (intent === 'edit') {
          addMessage({ id: generateId(), role: 'assistant', content: '', timestamp: new Date().toISOString(), isLoading: true });
          await runStream(true, text);
          return;
        }
      }

      // New diagram → ask clarifying questions first
      setIsClarifying(true);
      const questions = await flowchartAPI.getClarifyingQuestions(text, llmHistory);

      if (questions.length === 0) {
        // Model returned nothing — fall back to direct generation
        setIsClarifying(false);
        addMessage({ id: generateId(), role: 'assistant', content: '', timestamp: new Date().toISOString(), isLoading: true });
        await runStream(false, text);
        return;
      }

      // Add clarify card as assistant message
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        clarifyQuestions: questions,
      });
    },
    [isGenerating, isClarifying, currentGraph, addMessage, llmHistory, runStream]
  );

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    addMessage({ id: generateId(), role: 'user', content: `Uploaded: ${file.name}`, timestamp: new Date().toISOString() });
    addMessage({ id: generateId(), role: 'assistant', content: '', timestamp: new Date().toISOString(), isLoading: true });
    setGenerating(true);
    setStreamState({ phase: 'thinking', thinkingText: '', nodeCount: 0, isEdit: false });
    try {
      const { extractedText, filename } = await flowchartAPI.uploadDocument(file);
      const prompt = `Generate a flowchart from this document (${filename}):\n\n${extractedText.slice(0, 4000)}`;
      await runStream(false, prompt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process file';
      updateLastMessage(`Error: ${msg}`);
      setError(msg);
      setStreamState(null);
      setGenerating(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  };

  // Find the pending clarify message (if any) — needed to pass original prompt on submit
  const pendingClarifyMsg = chatMessages.findLast((m) => m.clarifyQuestions && m.clarifyQuestions.length > 0);
  // The user message just before the clarify card holds the original prompt
  const originalPromptForClarify = (() => {
    if (!pendingClarifyMsg) return '';
    const idx = chatMessages.indexOf(pendingClarifyMsg);
    if (idx > 0 && chatMessages[idx - 1].role === 'user') return chatMessages[idx - 1].content;
    return '';
  })();

  return (
    <div
      className="flex flex-col h-full bg-gray-900 border-r border-gray-700"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
        <h2 className="text-sm font-semibold text-gray-200">Flowchart Agent</h2>
        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={historyStack.length === 0} title="Undo (⌘Z)"
            className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <Undo2 size={14} />
          </button>
          <button onClick={redo} disabled={redoStack.length === 0} title="Redo (⌘⇧Z)"
            className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <Redo2 size={14} />
          </button>
          <button onClick={clearSession} title="Clear session"
            className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {chatMessages.length === 0 && (
          <div className="text-center text-gray-500 text-sm mt-12 space-y-3">
            <p className="text-3xl">💬</p>
            <p className="font-medium text-gray-400">Describe a process to get started</p>
            <p className="text-xs text-blue-400 cursor-pointer hover:text-blue-300"
              onClick={() => sendMessage('Draw a user login and authentication flow')}>
              Try: "Draw a user login and authentication flow"
            </p>
          </div>
        )}

        {chatMessages.map((msg: ChatMessage, i: number) => {
          const isLastAndLoading = msg.isLoading && i === chatMessages.length - 1;
          const isActiveClarify = !!msg.clarifyQuestions?.length && isClarifying;

          return (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {/* Active clarifying questions card */}
              {isActiveClarify && msg.clarifyQuestions ? (
                <ClarifyingQuestions
                  questions={msg.clarifyQuestions}
                  onSubmit={(answers) => handleClarifySubmit(originalPromptForClarify, answers, msg.clarifyQuestions!)}
                  onSkip={() => {
                    setIsClarifying(false);
                    updateLastMessage('Skipped — generating directly…');
                    addMessage({ id: generateId(), role: 'assistant', content: '', timestamp: new Date().toISOString(), isLoading: true });
                    runStream(false, originalPromptForClarify);
                  }}
                />
              ) : isLastAndLoading && streamState ? (
                <StreamingMessage state={streamState} />
              ) : msg.role === 'assistant' ? (
                <div className="max-w-[85%] space-y-0">
                  {msg.thinkingText && <ThinkingLog text={msg.thinkingText} />}
                  <div className="rounded-lg px-3 py-2 text-sm leading-relaxed bg-gray-800 text-gray-200 whitespace-pre-line">
                    {msg.isLoading
                      ? <span className="flex items-center gap-2 text-gray-400"><Loader2 size={12} className="animate-spin" />Generating…</span>
                      : msg.content || null}
                  </div>
                </div>
              ) : (
                <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed bg-blue-600 text-white">
                  {msg.content}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Drop zone overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-900/60 border-2 border-dashed border-blue-400 flex items-center justify-center z-10 rounded pointer-events-none">
          <p className="text-blue-300 font-medium">Drop PDF, DOCX, or TXT to generate flowchart</p>
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-3 border-t border-gray-700 shrink-0">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-gray-200 transition-colors shrink-0"
            title="Upload document (PDF, DOCX, TXT)">
            <Paperclip size={16} />
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
          <textarea ref={textareaRef} value={input} onChange={autoResize} onKeyDown={handleKeyDown}
            placeholder={currentGraph ? 'Describe an edit or create a new diagram…' : 'Describe a process or system…'}
            rows={1} disabled={isGenerating || isClarifying}
            className="flex-1 resize-none bg-gray-800 text-gray-200 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 min-h-[36px] max-h-[160px]" />
          <button type="submit" disabled={isGenerating || isClarifying || !input.trim()}
            className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
        <p className="text-xs text-gray-600 mt-1.5 pl-1">Enter to send · Shift+Enter for new line · Drag & drop files</p>
      </div>
    </div>
  );
}
