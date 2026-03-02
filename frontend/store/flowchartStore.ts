import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DiagramGraph, DiagramNode, DiagramEdge, ChatMessage } from '@/types/flowchart';
import { FlowchartSession, VersionSnapshot } from '@/types/flowchartSession';

const MAX_HISTORY = 50;
const MAX_SESSIONS = 20;
const MAX_VERSIONS = 10;

export interface StreamingGraph {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function makeSession(overrides?: Partial<FlowchartSession>): FlowchartSession {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    title: 'New Chat',
    createdAt: now,
    updatedAt: now,
    chatMessages: [],
    currentGraph: null,
    historyStack: [],
    redoStack: [],
    versionHistory: [],
    ...overrides,
  };
}

/** Extract the flat "active session view" from a session — kept in sync with the store. */
function sessionView(s: FlowchartSession) {
  return {
    currentGraph: s.currentGraph,
    chatMessages: s.chatMessages,
    historyStack: s.historyStack,
    redoStack: s.redoStack,
    versionHistory: s.versionHistory,
  };
}

/** Mutate the active session immutably and also update the flat mirrors. */
function applyToActive(
  sessions: FlowchartSession[],
  activeId: string,
  updater: (s: FlowchartSession) => FlowchartSession
) {
  const updated = sessions.map((s) => (s.id === activeId ? updater(s) : s));
  const active = updated.find((s) => s.id === activeId)!;
  return { sessions: updated, ...sessionView(active) };
}

interface FlowchartStore {
  // ── Persisted ─────────────────────────────────────────────────────────────
  sessions: FlowchartSession[];
  activeSessionId: string;

  // ── Flat mirrors of active session (synced on every mutation) ─────────────
  currentGraph: DiagramGraph | null;
  chatMessages: ChatMessage[];
  historyStack: DiagramGraph[];
  redoStack: DiagramGraph[];
  versionHistory: VersionSnapshot[];

  // ── Transient (not persisted) ──────────────────────────────────────────────
  streamingGraph: StreamingGraph | null;
  isGenerating: boolean;
  error: string | null;

  // ── Session CRUD ───────────────────────────────────────────────────────────
  createSession: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  autoNameSession: (firstMessage: string) => void;

  // ── Graph actions ──────────────────────────────────────────────────────────
  setGraph: (graph: DiagramGraph, label?: string) => void;
  setStreamingGraph: (graph: StreamingGraph | null) => void;
  restoreVersion: (snapshot: VersionSnapshot) => void;
  undo: () => void;
  redo: () => void;

  // ── Chat actions ───────────────────────────────────────────────────────────
  addMessage: (msg: ChatMessage) => void;
  updateLastMessage: (content: string) => void;
  finalizeLastMessage: (content: string, thinkingText: string) => void;

  // ── UI state ───────────────────────────────────────────────────────────────
  setGenerating: (val: boolean) => void;
  setError: (err: string | null) => void;
  clearSession: () => void;
}

export const useFlowchartStore = create<FlowchartStore>()(
  persist(
    (set, get) => {
      const initialSession = makeSession();

      return {
        // ── Initial state ────────────────────────────────────────────────────
        sessions: [initialSession],
        activeSessionId: initialSession.id,
        ...sessionView(initialSession),
        streamingGraph: null,
        isGenerating: false,
        error: null,

        // ── Session CRUD ──────────────────────────────────────────────────────
        createSession: () => {
          const newSession = makeSession();
          set((state) => {
            const sessions = [newSession, ...state.sessions].slice(0, MAX_SESSIONS);
            return { sessions, activeSessionId: newSession.id, ...sessionView(newSession) };
          });
        },

        switchSession: (id: string) => {
          const session = get().sessions.find((s) => s.id === id);
          if (!session) return;
          set({ activeSessionId: id, ...sessionView(session) });
        },

        deleteSession: (id: string) => {
          set((state) => {
            const remaining = state.sessions.filter((s) => s.id !== id);
            if (remaining.length === 0) {
              const fresh = makeSession();
              return { sessions: [fresh], activeSessionId: fresh.id, ...sessionView(fresh) };
            }
            const newActiveId =
              state.activeSessionId === id ? remaining[0].id : state.activeSessionId;
            const newActive = remaining.find((s) => s.id === newActiveId)!;
            return {
              sessions: remaining,
              activeSessionId: newActiveId,
              ...(state.activeSessionId === id ? sessionView(newActive) : {}),
            };
          });
        },

        renameSession: (id: string, title: string) => {
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === id
                ? { ...s, title: title.trim() || 'New Chat', updatedAt: new Date().toISOString() }
                : s
            ),
          }));
        },

        autoNameSession: (firstMessage: string) => {
          const { activeSessionId, sessions } = get();
          const active = sessions.find((s) => s.id === activeSessionId);
          if (!active || active.title !== 'New Chat') return;
          get().renameSession(activeSessionId, firstMessage.trim().slice(0, 40));
        },

        // ── Graph actions ──────────────────────────────────────────────────────
        setGraph: (graph: DiagramGraph, label = 'Edited') => {
          set((state) => {
            const active = state.sessions.find((s) => s.id === state.activeSessionId);
            if (!active) return {};

            const prevGraph = active.currentGraph;
            const newVersion = (prevGraph?.metadata?.version ?? 0) + 1;
            const updatedGraph = {
              ...graph,
              metadata: { ...graph.metadata, version: newVersion },
            };

            const newHistory = prevGraph
              ? [...active.historyStack.slice(-(MAX_HISTORY - 1)), prevGraph]
              : active.historyStack;

            const snapshot: VersionSnapshot = {
              version: newVersion,
              graph: updatedGraph,
              timestamp: new Date().toISOString(),
              label: newVersion === 1 ? 'Generated' : label,
            };
            const newVersionHistory = [snapshot, ...active.versionHistory].slice(0, MAX_VERSIONS);

            return {
              ...applyToActive(state.sessions, state.activeSessionId, (s) => ({
                ...s,
                currentGraph: updatedGraph,
                historyStack: newHistory,
                redoStack: [],
                versionHistory: newVersionHistory,
                updatedAt: new Date().toISOString(),
              })),
              streamingGraph: null,
              error: null,
            };
          });
        },

        setStreamingGraph: (graph: StreamingGraph | null) => set({ streamingGraph: graph }),

        restoreVersion: (snapshot: VersionSnapshot) => {
          set((state) => {
            const active = state.sessions.find((s) => s.id === state.activeSessionId);
            if (!active) return {};
            const prevGraph = active.currentGraph;
            const newHistory = prevGraph
              ? [...active.historyStack.slice(-(MAX_HISTORY - 1)), prevGraph]
              : active.historyStack;
            return applyToActive(state.sessions, state.activeSessionId, (s) => ({
              ...s,
              currentGraph: snapshot.graph,
              historyStack: newHistory,
              redoStack: [],
              updatedAt: new Date().toISOString(),
            }));
          });
        },

        undo: () => {
          set((state) => {
            const active = state.sessions.find((s) => s.id === state.activeSessionId);
            if (!active || active.historyStack.length === 0) return {};
            const previous = active.historyStack[active.historyStack.length - 1];
            return applyToActive(state.sessions, state.activeSessionId, (s) => ({
              ...s,
              currentGraph: previous,
              historyStack: s.historyStack.slice(0, -1),
              redoStack: s.currentGraph ? [s.currentGraph, ...s.redoStack] : s.redoStack,
            }));
          });
        },

        redo: () => {
          set((state) => {
            const active = state.sessions.find((s) => s.id === state.activeSessionId);
            if (!active || active.redoStack.length === 0) return {};
            const next = active.redoStack[0];
            return applyToActive(state.sessions, state.activeSessionId, (s) => ({
              ...s,
              currentGraph: next,
              historyStack: s.currentGraph ? [...s.historyStack, s.currentGraph] : s.historyStack,
              redoStack: s.redoStack.slice(1),
            }));
          });
        },

        // ── Chat actions ───────────────────────────────────────────────────────
        addMessage: (msg: ChatMessage) => {
          set((state) =>
            applyToActive(state.sessions, state.activeSessionId, (s) => ({
              ...s,
              chatMessages: [...s.chatMessages, msg],
              updatedAt: new Date().toISOString(),
            }))
          );
        },

        updateLastMessage: (content: string) => {
          set((state) =>
            applyToActive(state.sessions, state.activeSessionId, (s) => {
              const msgs = [...s.chatMessages];
              if (msgs.length > 0)
                msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content, isLoading: false };
              return { ...s, chatMessages: msgs };
            })
          );
        },

        finalizeLastMessage: (content: string, thinkingText: string) => {
          set((state) =>
            applyToActive(state.sessions, state.activeSessionId, (s) => {
              const msgs = [...s.chatMessages];
              if (msgs.length > 0)
                msgs[msgs.length - 1] = {
                  ...msgs[msgs.length - 1],
                  content,
                  isLoading: false,
                  thinkingText: thinkingText || undefined,
                };
              return { ...s, chatMessages: msgs };
            })
          );
        },

        // ── UI state ───────────────────────────────────────────────────────────
        setGenerating: (val: boolean) => set({ isGenerating: val }),
        setError: (err: string | null) => set({ error: err }),

        clearSession: () => {
          set((state) =>
            applyToActive(state.sessions, state.activeSessionId, (s) => ({
              ...s,
              currentGraph: null,
              chatMessages: [],
              historyStack: [],
              redoStack: [],
              versionHistory: [],
              title: 'New Chat',
              updatedAt: new Date().toISOString(),
            }))
          );
          set({ streamingGraph: null, error: null });
        },
      };
    },
    {
      name: 'ey-flowchart-v1',
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
      // On rehydration, restore the flat mirrors from the active session
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const active = state.sessions.find((s) => s.id === state.activeSessionId);
        if (active) Object.assign(state, sessionView(active));
      },
    }
  )
);
