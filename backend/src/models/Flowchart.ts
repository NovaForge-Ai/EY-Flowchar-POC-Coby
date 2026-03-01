export type DiagramType =
  | 'process_flow'
  | 'decision_tree'
  | 'swimlane'
  | 'dfd'
  | 'entity_relationship'
  | 'network'
  | 'timeline';

export type NodeType =
  | 'process'
  | 'decision'
  | 'start'
  | 'end'
  | 'io'
  | 'database'
  | 'external'
  | 'swimlane_header';

export type EdgeType = 'default' | 'conditional' | 'data_flow';

export interface DiagramNode {
  id: string;
  label: string;
  type: NodeType;
  style?: Record<string, string>;
  metadata?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: EdgeType;
}

export interface DiagramGraph {
  id: string;
  title: string;
  type: DiagramType;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  metadata: {
    createdAt: string;
    version: number;
    description?: string;
  };
}

export type IntentType = 'new_diagram' | 'edit' | 'export_request' | 'clarification';

export type StreamEvent =
  | { type: 'thinking'; text: string }
  | { type: 'generating'; text: string }
  | { type: 'complete'; graph: DiagramGraph }
  | { type: 'error'; message: string };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClarifyQuestion {
  id: string;
  question: string;
  options: string[];
}
