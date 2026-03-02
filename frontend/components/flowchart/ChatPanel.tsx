'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, Undo2, Redo2, Trash2, Loader2, ChevronDown, ChevronRight, Brain, LayoutList, Pencil, Check, BrainCircuit, GitBranch, Shield, Users, RefreshCw, Package, AlertTriangle } from 'lucide-react';
import { useFlowchartStore } from '@/store/flowchartStore';
import { flowchartAPI } from '@/lib/flowchartApi';
import { parsePartialGraph } from '@/lib/partialGraphParser';
import { ChatMessage, ClarifyQuestion } from '@/types/flowchart';
import StreamingMessage, { StreamingState } from './StreamingMessage';
import ClarifyingQuestions from './ClarifyingQuestions';
import SessionDrawer from './SessionDrawer';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

const TEMPLATES = [
  { label: 'IT Incident Response', icon: AlertTriangle, prompt: 'Draw an IT incident response and escalation workflow from detection to resolution, including severity tiers and on-call escalation' },
  { label: 'Client Onboarding',    icon: Users,         prompt: 'Create a client onboarding process for a consulting engagement from contract signing through project kickoff' },
  { label: 'Project Approval',     icon: GitBranch,     prompt: 'Draw a project approval and governance workflow with steering committee checkpoints and sign-off gates' },
  { label: 'Risk Assessment',      icon: Shield,        prompt: 'Create a risk assessment and classification decision tree for enterprise risk management with scoring criteria' },
  { label: 'Change Management',    icon: RefreshCw,     prompt: 'Draw a change management process following ADKAR methodology with stakeholder communication touchpoints' },
  { label: 'Vendor Evaluation',    icon: Package,       prompt: 'Create a vendor evaluation and selection process with RFP, scoring, shortlisting, and approval gates' },
];

/** Collapsible reasoning block shown on completed assistant messages. */
function ThinkingLog({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 overflow-hidden mb-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-violet-100/60 transition-colors"
      >
        <Brain size={12} className="text-violet-500 shrink-0" />
        <span className="text-[11px] font-semibold text-violet-600 flex-1">Diagram reasoning</span>
        {open
          ? <ChevronDown size={11} className="text-violet-400 shrink-0" />
          : <ChevronRight size={11} className="text-violet-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-3 max-h-[200px] overflow-y-auto">
          <p className="text-[11px] text-violet-600/70 leading-relaxed whitespace-pre-wrap font-mono">{text}</p>
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
  const [pendingDocText, setPendingDocText] = useState<string>('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [processingStep, setProcessingStep] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const {
    chatMessages,
    currentGraph,
    isGenerating,
    historyStack,
    redoStack,
    sessions,
    activeSessionId,
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
    autoNameSession,
    renameSession,
  } = useFlowchartStore();

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const sessionTitle = activeSession?.title ?? 'New Chat';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, streamState, processingStep]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select();
  }, [editingTitle]);

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
            setGraph(event.graph, isEdit ? 'Edited' : 'Generated');
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
      const answerSummary = questions
        .map((q) => `• ${q.question}: **${answers[q.id]}**`)
        .join('\n');
      updateLastMessage(answerSummary);
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isLoading: true,
      });
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

      autoNameSession(text);

      if (pendingDocText) {
        const combined = `User intent: ${text}\n\nDocument content:\n${pendingDocText.slice(0, 4000)}`;
        setPendingDocText('');
        addMessage({ id: generateId(), role: 'assistant', content: '', timestamp: new Date().toISOString(), isLoading: true });
        await runStream(false, combined);
        return;
      }

      if (currentGraph) {
        setProcessingStep('Reading your message…');
        const intent = await flowchartAPI.classifyIntent(text);
        setProcessingStep(null);
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

      setProcessingStep('Thinking about what to ask you…');
      setIsClarifying(true);
      const questions = await flowchartAPI.getClarifyingQuestions(text, llmHistory);
      setProcessingStep(null);

      if (questions.length === 0) {
        setIsClarifying(false);
        addMessage({ id: generateId(), role: 'assistant', content: '', timestamp: new Date().toISOString(), isLoading: true });
        await runStream(false, text);
        return;
      }

      addMessage({
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        clarifyQuestions: questions,
      });
    },
    [isGenerating, isClarifying, pendingDocText, currentGraph, addMessage, llmHistory, runStream, autoNameSession]
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
    addMessage({ id: generateId(), role: 'user', content: `📎 ${file.name}`, timestamp: new Date().toISOString() });
    setGenerating(true);
    try {
      const { extractedText } = await flowchartAPI.uploadDocument(file);
      setPendingDocText(extractedText);
      textareaRef.current?.focus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process file';
      addMessage({ id: generateId(), role: 'assistant', content: `Error: ${msg}`, timestamp: new Date().toISOString() });
      setError(msg);
    } finally {
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

  const commitTitleEdit = () => {
    const trimmed = titleDraft.trim();
    if (trimmed) renameSession(activeSessionId, trimmed);
    setEditingTitle(false);
  };

  const pendingClarifyMsg = chatMessages.findLast((m) => m.clarifyQuestions && m.clarifyQuestions.length > 0);
  const originalPromptForClarify = (() => {
    if (!pendingClarifyMsg) return '';
    const idx = chatMessages.indexOf(pendingClarifyMsg);
    if (idx > 0 && chatMessages[idx - 1].role === 'user') return chatMessages[idx - 1].content;
    return '';
  })();

  return (
    <div
      className="relative flex flex-col h-full bg-white"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      {/* Session drawer overlay */}
      <SessionDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-white shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            title="Chat history"
          >
            <LayoutList size={14} />
          </button>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitleEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitleEdit();
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              className="flex-1 min-w-0 bg-gray-50 text-gray-800 text-sm font-semibold rounded-lg px-2 py-0.5 border border-indigo-400 focus:outline-none"
            />
          ) : (
            <button
              className="flex-1 min-w-0 text-left text-sm font-semibold text-gray-700 truncate hover:text-gray-900 transition-colors"
              onClick={() => { setTitleDraft(sessionTitle); setEditingTitle(true); }}
              title="Click to rename"
            >
              {sessionTitle}
            </button>
          )}
          {editingTitle && (
            <button onClick={commitTitleEdit} className="p-1 text-green-500 hover:text-green-600 shrink-0">
              <Check size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={undo} disabled={historyStack.length === 0} title="Undo"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <Undo2 size={13} />
          </button>
          <button onClick={redo} disabled={redoStack.length === 0} title="Redo"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <Redo2 size={13} />
          </button>
          <button onClick={clearSession} title="Clear chat"
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 min-h-0 bg-slate-50/60">
        {chatMessages.length === 0 && (
          <div className="text-sm mt-4 space-y-5 px-1">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 shadow-sm">
                <BrainCircuit size={22} className="text-indigo-500" />
              </div>
              <div>
                <p className="font-bold text-gray-800 text-sm tracking-tight">Your thinking, made visual</p>
                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                  Describe any process and I'll turn it into<br />a clear, professional flowchart instantly.
                </p>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mb-2 px-0.5">Quick start</p>
              <div className="grid grid-cols-2 gap-1.5">
                {TEMPLATES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.label}
                      onClick={() => sendMessage(t.prompt)}
                      disabled={isGenerating}
                      className="flex items-start gap-2 px-2.5 py-2.5 rounded-xl border border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm transition-all text-left group shadow-[0_1px_3px_rgba(0,0,0,0.04)] disabled:opacity-40"
                    >
                      <Icon size={11} className="text-gray-400 group-hover:text-indigo-500 transition-colors mt-0.5 shrink-0" />
                      <span className="text-[11px] text-gray-500 group-hover:text-gray-700 leading-snug transition-colors font-medium">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {chatMessages.map((msg: ChatMessage, i: number) => {
          const isLastAndLoading = msg.isLoading && i === chatMessages.length - 1;
          const isActiveClarify = !!msg.clarifyQuestions?.length && isClarifying;

          return (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
                <div className="max-w-[88%] space-y-0">
                  {msg.thinkingText && <ThinkingLog text={msg.thinkingText} />}
                  <div className="rounded-2xl rounded-tl-sm px-3 py-2 text-xs leading-relaxed bg-white border border-gray-200 text-gray-700 shadow-[0_1px_4px_rgba(0,0,0,0.06)] whitespace-pre-line">
                    {msg.isLoading
                      ? <span className="flex items-center gap-2 text-gray-400"><Loader2 size={11} className="animate-spin" />Thinking…</span>
                      : msg.content || null}
                  </div>
                </div>
              ) : (
                <div className="max-w-[88%] rounded-2xl rounded-tr-sm px-3 py-2 text-xs leading-relaxed bg-indigo-600 text-white shadow-sm">
                  {msg.content}
                </div>
              )}
            </div>
          );
        })}
        {/* Processing step indicator — shown between user message and streaming/questions */}
        {processingStep && (
          <div className="flex justify-start pl-0.5">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gray-100 text-gray-400 text-[11px]">
              <Loader2 size={10} className="animate-spin shrink-0" />
              {processingStep}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Drop zone overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-indigo-50/80 border-2 border-dashed border-indigo-400 flex items-center justify-center z-10 pointer-events-none">
          <p className="text-indigo-600 font-semibold text-sm">Drop PDF, DOCX, or TXT to generate flowchart</p>
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-3 border-t border-gray-100 bg-white shrink-0">
        {pendingDocText && (
          <div className="flex items-center gap-1.5 mb-2 px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200">
            <span className="text-amber-500 text-[10px]">📎</span>
            <span className="text-[10px] text-amber-600 flex-1 font-medium">Document ready — describe what you need</span>
            <button onClick={() => setPendingDocText('')} className="text-gray-400 hover:text-gray-600">
              <Pencil size={9} />
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="p-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            title="Upload document (PDF, DOCX, TXT)">
            <Paperclip size={14} />
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
          <textarea ref={textareaRef} value={input} onChange={autoResize} onKeyDown={handleKeyDown}
            placeholder={
              pendingDocText
                ? 'What would you like to do with this document?'
                : currentGraph
                ? 'Describe an edit…'
                : 'Describe a process or system…'
            }
            rows={1} disabled={isGenerating || isClarifying}
            className="flex-1 resize-none bg-gray-50 text-gray-800 placeholder-gray-400 rounded-xl px-3 py-2 text-xs border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-300/50 focus:border-indigo-300 disabled:opacity-50 min-h-[34px] max-h-[160px] transition-colors" />
          <button type="submit" disabled={isGenerating || isClarifying || !input.trim()}
            className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm shrink-0">
            {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </form>
        <p className="text-[10px] text-gray-300 mt-1.5 pl-0.5">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
