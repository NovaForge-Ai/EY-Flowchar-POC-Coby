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
  // answers: questionId → selected string (option text or custom input)
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // which questions have the "other" text field open
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
      // Closing custom input — clear the custom answer for this question
      const newAnswers = { ...answers };
      if (customText[qId]) {
        newAnswers[qId] = customText[qId];
      } else {
        delete newAnswers[qId];
      }
      setAnswers(newAnswers);
    } else {
      // Opening custom input — deselect any chip option
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
        <Sparkles size={13} className="text-amber-400 shrink-0" />
        <span className="text-xs font-semibold text-amber-300">
          A few quick questions before I draw
        </span>
        <span className="text-xs text-gray-500 ml-auto">
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
            className="rounded-xl border border-gray-700 bg-gray-800/60 px-3 py-3 space-y-2"
          >
            {/* Question text */}
            <p className="text-xs font-medium text-gray-200 leading-snug">
              <span className="text-gray-500 mr-1.5">Q{qi + 1}.</span>
              {q.question}
            </p>

            {/* Option chips */}
            <div className="flex flex-wrap gap-1.5">
              {q.options.map((opt) => {
                const isSelected = selected === opt && !isCustomOpen;
                return (
                  <button
                    key={opt}
                    onClick={() => selectOption(q.id, opt)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                      isSelected
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-700/60 border-gray-600 text-gray-300 hover:border-blue-500 hover:text-gray-100'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}

              {/* "Other" toggle */}
              <button
                onClick={() => toggleCustom(q.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all flex items-center gap-1 ${
                  isCustomOpen
                    ? 'bg-violet-600 border-violet-500 text-white'
                    : 'bg-gray-700/60 border-gray-600 text-gray-400 hover:border-violet-500 hover:text-gray-200'
                }`}
              >
                <Pencil size={9} />
                Other
              </button>
            </div>

            {/* Custom text input */}
            {isCustomOpen && (
              <input
                autoFocus
                type="text"
                value={customText[q.id] || ''}
                onChange={(e) => handleCustomChange(q.id, e.target.value)}
                placeholder="Describe what you have in mind…"
                className="w-full bg-gray-900 text-gray-200 placeholder-gray-500 text-xs rounded-lg px-3 py-1.5 border border-gray-600 focus:outline-none focus:border-violet-500"
              />
            )}
          </div>
        );
      })}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 px-0.5">
        <button
          onClick={onSkip}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Skip & generate now
        </button>
        <button
          onClick={handleSubmit}
          disabled={!allAnswered}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Generate diagram
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}
