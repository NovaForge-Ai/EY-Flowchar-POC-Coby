import { DiagramGraph, ChatMessage } from './flowchart';

export interface VersionSnapshot {
  version: number;
  graph: DiagramGraph;
  timestamp: string;
  label: string; // e.g. "Generated", "Edited"
}

export interface FlowchartSession {
  id: string;
  title: string;        // auto-set from first user message (max 40 chars), editable
  createdAt: string;
  updatedAt: string;
  chatMessages: ChatMessage[];
  currentGraph: DiagramGraph | null;
  historyStack: DiagramGraph[];   // undo stack (max 50)
  redoStack: DiagramGraph[];
  versionHistory: VersionSnapshot[];  // diagram version snapshots (max 10)
}
