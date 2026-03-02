'use client';

import { useEffect, useRef, useState } from 'react';
import { Brain, Hexagon, ChevronDown, ChevronRight } from 'lucide-react';

export interface StreamingState {
  phase: 'thinking' | 'building';
  thinkingText: string;
  nodeCount: number;
  isEdit: boolean;
}

interface StreamingMessageProps {
  state: StreamingState;
}

const THINKING_LABELS = [
  'Analyzing your request…',
  'Understanding the process flow…',
  'Identifying decision points…',
  'Planning the diagram structure…',
  'Mapping relationships and paths…',
];

const THINKING_LABELS_EDIT = [
  'Reading your edit instruction…',
  'Locating the affected nodes…',
  'Planning the minimal change…',
  'Preserving existing structure…',
];

const BUILDING_LABELS = [
  'Mapping process nodes…',
  'Connecting decision paths…',
  'Structuring the workflow…',
  'Organizing node hierarchy…',
  'Linking edges and flows…',
  'Finalizing diagram schema…',
];

const BUILDING_LABELS_EDIT = [
  'Applying the surgical edit…',
  'Updating affected nodes…',
  'Recalculating connections…',
  'Preserving node IDs…',
  'Finalizing updated diagram…',
];

// Absolutely unnecessary facts. Delivered with full confidence.
const FUN_FACTS = [
  "Fun fact: The average consulting deck has 47 slides. Your flowchart has zero. You're already winning.",
  'Fun fact: "Let\'s circle back" is consultant for "I need coffee before I can answer this."',
  "Fun fact: Gantt charts were invented in 1910 — they've caused calendar anxiety ever since.",
  'Fun fact: The word "synergy" peaked in 2003. We\'re still recovering.',
  'Fun fact: 73% of consulting statistics are made up. Including this one.',
  "Fun fact: The sticky note was invented by accident — much like most enterprise workflows.",
  'Fun fact: BPMN 2.0 has 116 official symbols. You need maybe 6. Wise choice.',
  'Fun fact: The average Big4 kickoff says "process" 4.7 times per minute. Someone counted.',
  "Fun fact: A flowchart once saved a Fortune 500 company $4M. Probably. We can't verify this.",
  'Fun fact: "Quick sync" is never quick. Your diagram, however, will be.',
];

/** Typewriter cadence — keep it slow so it feels deliberate */
const TYPEWRITER_CHARS_PER_TICK = 6;
const TYPEWRITER_INTERVAL_MS = 40;

function useRotatingLabel(labels: string[], intervalMs = 2200): string {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % labels.length), intervalMs);
    return () => clearInterval(t);
  }, [labels, intervalMs]);
  return labels[idx];
}

export default function StreamingMessage({ state }: StreamingMessageProps) {
  const { phase, thinkingText, nodeCount, isEdit } = state;
  const [reasoningOpen, setReasoningOpen] = useState(true);
  const [displayedChars, setDisplayedChars] = useState(0);
  const reasoningRef = useRef<HTMLDivElement>(null);

  const thinkingLabel = useRotatingLabel(isEdit ? THINKING_LABELS_EDIT : THINKING_LABELS);
  const buildingLabel = useRotatingLabel(isEdit ? BUILDING_LABELS_EDIT : BUILDING_LABELS);
  const funFact = useRotatingLabel(FUN_FACTS, 4500);

  // Typewriter effect — even if we have the full text, reveal it slowly
  useEffect(() => {
    if (displayedChars >= thinkingText.length) return;
    const t = setTimeout(
      () => setDisplayedChars((c) => Math.min(c + TYPEWRITER_CHARS_PER_TICK, thinkingText.length)),
      TYPEWRITER_INTERVAL_MS
    );
    return () => clearTimeout(t);
  }, [displayedChars, thinkingText]);

  // Auto-scroll as typewriter advances
  useEffect(() => {
    if (reasoningRef.current) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
    }
  }, [displayedChars]);

  const visibleThinkingText = thinkingText.slice(0, displayedChars);

  return (
    <div className="space-y-2 max-w-[85%]">
      {/* Thinking block */}
      {(phase === 'thinking' || thinkingText) && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 overflow-hidden">
          <button
            onClick={() => setReasoningOpen((o) => !o)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-violet-100/60 transition-colors"
          >
            <Brain
              size={13}
              className={`text-violet-500 shrink-0 ${phase === 'thinking' ? 'animate-pulse' : ''}`}
            />
            <span className="text-xs font-medium text-violet-600 flex-1 truncate">
              {phase === 'thinking'
                ? thinkingLabel
                : isEdit ? 'Edit reasoning' : 'Diagram reasoning'}
            </span>
            {reasoningOpen
              ? <ChevronDown size={12} className="text-violet-400 shrink-0" />
              : <ChevronRight size={12} className="text-violet-400 shrink-0" />}
          </button>

          {reasoningOpen && visibleThinkingText && (
            <div ref={reasoningRef} className="px-3 pb-3 max-h-[140px] overflow-y-auto">
              <p className="text-[11px] text-violet-600/80 leading-relaxed whitespace-pre-wrap font-mono">
                {visibleThinkingText}
                {phase === 'thinking' && displayedChars >= thinkingText.length && (
                  <span className="inline-block w-1.5 h-3 bg-violet-500 ml-0.5 animate-pulse align-middle" />
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Building block */}
      {phase === 'building' && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 space-y-2">
          <div className="flex items-start gap-2.5">
            <Hexagon
              size={14}
              className="text-indigo-500 shrink-0 mt-0.5"
              style={{ animation: 'spin 3s linear infinite' }}
            />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-indigo-700">
                {isEdit ? 'Updating your diagram' : 'Building your flowchart'}
              </p>
              <p className="text-[11px] text-indigo-500">{buildingLabel}</p>
              {nodeCount > 0 && (
                <p className="text-[11px] text-indigo-400">
                  {nodeCount} element{nodeCount !== 1 ? 's' : ''} detected so far…
                </p>
              )}
            </div>
          </div>
          <p className="text-[10px] text-gray-400 italic border-t border-indigo-100 pt-1.5 leading-relaxed">
            {funFact}
          </p>
        </div>
      )}
    </div>
  );
}
