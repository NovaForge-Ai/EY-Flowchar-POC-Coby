'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, X, MessageSquare } from 'lucide-react';
import { useFlowchartStore } from '@/store/flowchartStore';
import { FlowchartSession } from '@/types/flowchartSession';

interface SessionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SessionRow({
  session,
  isActive,
  onSwitch,
  onDelete,
  onRename,
}: {
  session: FlowchartSession;
  isActive: boolean;
  onSwitch: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== session.title) onRename(trimmed);
    setEditing(false);
  };

  const nodeCount = session.currentGraph?.nodes.length ?? 0;

  return (
    <div
      className={`group flex items-start gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        isActive ? 'bg-blue-600/20 border border-blue-500/30' : 'hover:bg-gray-800/60 border border-transparent'
      }`}
      onClick={() => !editing && onSwitch()}
    >
      <MessageSquare
        size={13}
        className={`mt-0.5 shrink-0 ${isActive ? 'text-blue-400' : 'text-gray-500'}`}
      />
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setDraft(session.title); setEditing(false); }
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-gray-900 text-gray-100 text-xs rounded px-1.5 py-0.5 border border-blue-500 focus:outline-none"
          />
        ) : (
          <p
            className={`text-xs truncate leading-snug ${isActive ? 'text-white font-medium' : 'text-gray-300'}`}
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
            title="Double-click to rename"
          >
            {session.title}
          </p>
        )}
        <p className="text-[10px] text-gray-500 mt-0.5">
          {nodeCount > 0 ? `${nodeCount} nodes · ` : ''}{relativeTime(session.updatedAt)}
        </p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="shrink-0 mt-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-red-400 text-gray-500 transition-all"
        title="Delete session"
      >
        <X size={11} />
      </button>
    </div>
  );
}

export default function SessionDrawer({ isOpen, onClose }: SessionDrawerProps) {
  const { sessions, activeSessionId, createSession, switchSession, deleteSession, renameSession } =
    useFlowchartStore();

  if (!isOpen) return null;

  const handleNew = () => {
    createSession();
    onClose();
  };

  const handleSwitch = (id: string) => {
    switchSession(id);
    onClose();
  };

  const handleDelete = (id: string) => {
    if (sessions.length === 1) {
      deleteSession(id);
    } else {
      deleteSession(id);
    }
    if (id === activeSessionId && sessions.length === 1) onClose();
  };

  // Sort: active first, then by updatedAt desc
  const sorted = [...sessions].sort((a, b) => {
    if (a.id === activeSessionId) return -1;
    if (b.id === activeSessionId) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return (
    <div className="absolute inset-0 z-20 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
        <h3 className="text-sm font-semibold text-gray-200">Chat History</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            <Plus size={12} />
            New Chat
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 min-h-0">
        {sorted.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            onSwitch={() => handleSwitch(session.id)}
            onDelete={() => handleDelete(session.id)}
            onRename={(title) => renameSession(session.id, title)}
          />
        ))}
      </div>

      <div className="px-3 py-2 border-t border-gray-700 shrink-0">
        <p className="text-[10px] text-gray-600">Sessions stored locally in your browser</p>
      </div>
    </div>
  );
}
