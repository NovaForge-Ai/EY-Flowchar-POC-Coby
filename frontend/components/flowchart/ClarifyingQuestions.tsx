'use client';

import { useState } from 'react';
import { Sparkles, Pencil, ArrowRight } from 'lucide-react';
import { ClarifyQuestion } from '@/types/flowchart';

interface ClarifyingQuestionsProps {
  questions: ClarifyQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
  onSkip: () => void;
}

export default function ClarifyingQuestions({ questions, onSubmit, onSkip }: ClarifyingQuestionsProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customOpen, setCustomOpen] = useState<Record<string, boolean>>({});
  const [customText, setCustomText] = useState<Record<string, string>>({});

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length;

  function selectOption(qId: string, option: string) {
    setCustomOpen((prev) => ({ ...prev, [qId]: false }));
    setAnswers((prev) => ({ ...prev, [qId]: option }));
  }

  function toggleCustom(qId: string) {
    const opening = !customOpen[qId];
    setCustomOpen((prev) => ({ ...prev, [qId]: opening }));
    if (!opening) {
      const newAnswers = { ...answers };
      if (customText[qId]) {
        newAnswers[qId] = customText[qId];
      } else {
        delete newAnswers[qId];
      }
      setAnswers(newAnswers);
    } else {
      const newAnswers = { ...answers };
      delete newAnswers[qId];
      setAnswers(newAnswers);
    }
  }

  function handleCustomChange(qId: string, val: string) {
    setCustomText((prev) => ({ ...prev, [qId]: val }));
    if (val.trim()) {
      setAnswers((prev) => ({ ...prev, [qId]: val.trim() }));
    } else {
      setAnswers((prev) => {
        const next = { ...prev };
        delete next[qId];
        return next;
      });
    }
  }

  function handleSubmit() {
    if (!allAnswered) return;
    onSubmit(answers);
  }

  return (
    <div className="max-w-[85%] space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <Sparkles size={13} className="text-indigo-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-700">
          A few quick questions before I draw
        </span>
        <span className="text-xs text-gray-400 ml-auto">
          {answeredCount}/{questions.length}
        </span>
      </div>

      {/* Question cards */}
      {questions.map((q, qi) => {
        const selected = answers[q.id];
        const isCustomOpen = customOpen[q.id];

        return (
          <div
            key={q.id}
            className="rounded-xl border border-gray-200 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] px-3 py-3 space-y-2"
          >
            <p className="text-xs font-medium text-gray-700 leading-snug">
              <span className="text-gray-400 mr-1.5">Q{qi + 1}.</span>
              {q.question}
            </p>

            <div className="flex flex-wrap gap-1.5">
              {q.options.map((opt) => {
                const isSelected = selected === opt && !isCustomOpen;
                return (
                  <button
                    key={opt}
                    onClick={() => selectOption(q.id, opt)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}

              <button
                onClick={() => toggleCustom(q.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all flex items-center gap-1 ${
                  isCustomOpen
                    ? 'bg-violet-100 border-violet-400 text-violet-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50'
                }`}
              >
                <Pencil size={9} />
                Other
              </button>
            </div>

            {isCustomOpen && (
              <input
                autoFocus
                type="text"
                value={customText[q.id] || ''}
                onChange={(e) => handleCustomChange(q.id, e.target.value)}
                placeholder="Describe what you have in mind…"
                className="w-full bg-gray-50 text-gray-800 placeholder-gray-400 text-xs rounded-lg px-3 py-1.5 border border-gray-200 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
              />
            )}
          </div>
        );
      })}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 px-0.5">
        <button
          onClick={onSkip}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Skip & generate now
        </button>
        <button
          onClick={handleSubmit}
          disabled={!allAnswered}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          Generate diagram
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}
