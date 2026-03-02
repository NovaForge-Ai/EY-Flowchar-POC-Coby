'use client';

import { useEffect, useState, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Node as RFNode,
  Edge,
  BackgroundVariant,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Sun, Moon, History, ChevronDown, GitBranch } from 'lucide-react';

import { DiagramGraph, DiagramNode, DiagramEdge, DiagramSection } from '@/types/flowchart';
import { VersionSnapshot } from '@/types/flowchartSession';
import { nodeTypes } from './nodes/CustomNodes';
import ExportControls from './ExportControls';
import { useFlowchartStore } from '@/store/flowchartStore';

interface DiagramCanvasProps {
  graph: DiagramGraph | null;
  streamingGraph?: { nodes: DiagramNode[]; edges: DiagramEdge[] } | null;
}

/** How long (ms) to wait before revealing each successive streaming node. */
const REVEAL_DELAY_MS = 900;

function buildEdgeStyle(lightMode: boolean) {
  return {
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: lightMode ? '#6b7280' : '#6b7280' },
    style: { stroke: lightMode ? '#9ca3af' : '#6b7280' },
    labelStyle: { fill: lightMode ? '#374151' : '#d1d5db', fontSize: 11 },
    labelBgStyle: { fill: lightMode ? '#f3f4f6' : '#1f2937' },
  } as const;
}

// ── Layout helpers ────────────────────────────────────────────────────────────

/** BFS topological layout — used for flat diagrams (no sections) and for floating nodes */
function bfsLayout(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  baseY = 0
): Record<string, { x: number; y: number }> {
  const LAYER_HEIGHT = 200;
  const NODE_WIDTH = 240;

  const inDegree: Record<string, number> = {};
  const adjList: Record<string, string[]> = {};
  for (const node of nodes) { inDegree[node.id] = 0; adjList[node.id] = []; }
  for (const edge of edges) {
    if (inDegree[edge.target] !== undefined) {
      inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
    }
    if (adjList[edge.source]) adjList[edge.source].push(edge.target);
  }

  const layers: string[][] = [];
  const visited = new Set<string>();
  let queue = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
  if (queue.length === 0 && nodes.length > 0) queue = [nodes[0].id];

  while (queue.length > 0) {
    layers.push([...queue]);
    queue.forEach((id) => visited.add(id));
    const next: string[] = [];
    for (const id of queue)
      for (const child of (adjList[id] || []))
        if (!visited.has(child)) next.push(child);
    queue = [...new Set(next)];
  }

  const unvisited = nodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
  if (unvisited.length > 0) layers.push(unvisited);

  const positionMap: Record<string, { x: number; y: number }> = {};
  layers.forEach((layer, li) => {
    const startX = -(layer.length * NODE_WIDTH) / 2;
    layer.forEach((id, i) => {
      positionMap[id] = { x: startX + i * NODE_WIDTH + NODE_WIDTH / 2, y: baseY + li * LAYER_HEIGHT };
    });
  });
  return positionMap;
}

function autoLayout(graph: DiagramGraph): { nodes: RFNode[]; edges: Edge[] } {
  const sections: DiagramSection[] = graph.sections ?? [];

  const rfEdges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: e.type === 'data_flow',
    ...buildEdgeStyle(false),
  }));

  // ── Section layout ───────────────────────────────────────────────────────────
  if (sections.length > 0) {
    const NODE_W = 180;
    const NODE_H = 72;
    const H_GAP = 36;
    const V_GAP = 48;
    const PAD_TOP = 52;    // room for floating label chip
    const PAD_SIDES = 24;
    const PAD_BOTTOM = 24;
    const SECTION_COLS = 3;
    const GAP_X = 64;
    const GAP_Y = 80;
    const SECTIONS_PER_ROW = 3;

    // Bucket nodes into sections
    const buckets = new Map<string, DiagramNode[]>(sections.map((s) => [s.id, []]));
    const floating: DiagramNode[] = [];
    for (const node of graph.nodes) {
      if (node.section && buckets.has(node.section)) {
        buckets.get(node.section)!.push(node);
      } else {
        floating.push(node);
      }
    }

    // Compute size and internal node positions for each section
    interface SectionLayout {
      x: number; y: number;
      width: number; height: number;
      nodePos: Map<string, { x: number; y: number }>;
    }
    const sectionLayouts = new Map<string, SectionLayout>();

    for (const section of sections) {
      const nodes = buckets.get(section.id) ?? [];
      if (nodes.length === 0) {
        sectionLayouts.set(section.id, { x: 0, y: 0, width: 240, height: 120, nodePos: new Map() });
        continue;
      }
      const cols = Math.min(SECTION_COLS, nodes.length);
      const rows = Math.ceil(nodes.length / cols);
      const width = cols * NODE_W + (cols - 1) * H_GAP + PAD_SIDES * 2;
      const height = rows * NODE_H + (rows - 1) * V_GAP + PAD_TOP + PAD_BOTTOM;

      const nodePos = new Map<string, { x: number; y: number }>();
      nodes.forEach((n, i) => {
        nodePos.set(n.id, {
          x: PAD_SIDES + (i % cols) * (NODE_W + H_GAP),
          y: PAD_TOP + Math.floor(i / cols) * (NODE_H + V_GAP),
        });
      });
      sectionLayouts.set(section.id, { x: 0, y: 0, width, height, nodePos });
    }

    // Place sections in rows of SECTIONS_PER_ROW
    let curX = 0, curY = 0, rowH = 0;
    sections.forEach((section, idx) => {
      if (idx % SECTIONS_PER_ROW === 0 && idx > 0) {
        curY += rowH + GAP_Y;
        curX = 0;
        rowH = 0;
      }
      const sl = sectionLayouts.get(section.id)!;
      sl.x = curX;
      sl.y = curY;
      curX += sl.width + GAP_X;
      rowH = Math.max(rowH, sl.height);
    });

    const totalSectionsH = curY + rowH;

    // Build RF nodes: section containers first (must precede their children)
    const rfNodes: RFNode[] = [];

    for (const section of sections) {
      const sl = sectionLayouts.get(section.id)!;
      rfNodes.push({
        id: section.id,
        type: 'section',
        position: { x: sl.x, y: sl.y },
        style: { width: sl.width, height: sl.height },
        zIndex: -1,
        data: { label: section.label, description: section.description, color: section.color ?? 'indigo' },
      } as RFNode);

      for (const node of (buckets.get(section.id) ?? [])) {
        rfNodes.push({
          id: node.id,
          type: node.type,
          parentNode: section.id,
          extent: 'parent' as const,
          position: sl.nodePos.get(node.id) ?? { x: PAD_SIDES, y: PAD_TOP },
          data: { label: node.label },
          style: node.style,
        });
      }
    }

    // Floating nodes below all sections using BFS
    if (floating.length > 0) {
      const floatBaseY = totalSectionsH + GAP_Y;
      const posMap = bfsLayout(floating, graph.edges, floatBaseY);
      for (const node of floating) {
        rfNodes.push({
          id: node.id,
          type: node.type,
          position: posMap[node.id] ?? { x: 0, y: floatBaseY },
          data: { label: node.label },
          style: node.style,
        });
      }
    }

    return { nodes: rfNodes, edges: rfEdges };
  }

  // ── Flat BFS layout (no sections) ───────────────────────────────────────────
  const positionMap = bfsLayout(graph.nodes, graph.edges);
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position || positionMap[n.id] || { x: 0, y: 0 },
      data: { label: n.label },
      style: n.style,
    })),
    edges: rfEdges,
  };
}

function streamingLayout(
  visibleNodes: DiagramNode[],
  allEdges: DiagramEdge[]
): { nodes: RFNode[]; edges: Edge[] } {
  const idSet = new Set(visibleNodes.map((n) => n.id));
  return {
    nodes: visibleNodes.map((n, i) => ({
      id: n.id,
      type: n.type,
      position: { x: 0, y: i * 160 },
      data: { label: n.label },
      style: n.style,
    })),
    edges: allEdges
      .filter((e) => idSet.has(e.source) && idSet.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: true,
        ...buildEdgeStyle(false),
        style: { stroke: '#3b82f6', strokeDasharray: '5 3' },
      })),
  };
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Version Dropdown ──────────────────────────────────────────────────────────

function VersionDropdown({
  versions,
  currentVersion,
  onRestore,
}: {
  versions: VersionSnapshot[];
  currentVersion: number;
  onRestore: (s: VersionSnapshot) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (versions.length === 0) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
        title="Version history"
      >
        <History size={11} />
        v{currentVersion}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-gray-700">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Version History</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {versions.map((snap) => {
              const isCurrent = snap.version === currentVersion;
              return (
                <div
                  key={snap.version}
                  className={`flex items-center justify-between px-3 py-2 ${isCurrent ? 'bg-blue-600/10' : 'hover:bg-gray-700/60'} transition-colors`}
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                      <span className={`text-xs font-medium ${isCurrent ? 'text-blue-300' : 'text-gray-200'}`}>
                        v{snap.version} · {snap.label}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 ml-3">{formatTimestamp(snap.timestamp)}</span>
                  </div>
                  {!isCurrent && (
                    <button
                      onClick={() => { onRestore(snap); setOpen(false); }}
                      className="text-[10px] px-2 py-0.5 rounded bg-gray-700 hover:bg-blue-600 text-gray-300 hover:text-white transition-colors shrink-0"
                    >
                      Restore
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DiagramCanvas({ graph, streamingGraph }: DiagramCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [lightMode, setLightMode] = useState(true);
  const { fitView } = useReactFlow();

  const { versionHistory, restoreVersion } = useFlowchartStore();

  // ── Slow-reveal timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!streamingGraph || streamingGraph.nodes.length === 0) {
      setRevealedCount(0);
      return;
    }
    if (revealedCount >= streamingGraph.nodes.length) return;
    const t = setTimeout(() => setRevealedCount((c) => c + 1), REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [revealedCount, streamingGraph?.nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply layout to React Flow ──────────────────────────────────────────────
  useEffect(() => {
    if (graph) {
      setRevealedCount(0);
      const { nodes: n, edges: e } = autoLayout(graph);
      setNodes(n);
      setEdges(e);
    } else if (streamingGraph && revealedCount > 0) {
      const visible = streamingGraph.nodes.slice(0, revealedCount);
      const { nodes: n, edges: e } = streamingLayout(visible, streamingGraph.edges);
      setNodes(n);
      setEdges(e);
    } else if (!graph && !streamingGraph) {
      setNodes([]);
      setEdges([]);
    }
  }, [graph, streamingGraph, revealedCount, setNodes, setEdges]);

  // ── Auto-fit whenever node count changes ────────────────────────────────────
  useEffect(() => {
    if (nodes.length === 0) return;
    const isStreaming = !graph && !!streamingGraph;
    const t = setTimeout(
      () => fitView({ duration: isStreaming ? 300 : 700, padding: 0.25 }),
      40
    );
    return () => clearTimeout(t);
  }, [nodes.length, fitView, graph, streamingGraph]);

  const isStreaming = !graph && !!streamingGraph && streamingGraph.nodes.length > 0;

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!graph && !isStreaming) {
    return (
      <div className={`flex-1 flex items-center justify-center ${lightMode ? 'bg-gray-50' : 'bg-gray-950'}`}>
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 mx-auto">
            <GitBranch size={28} className="text-indigo-400" />
          </div>
          <div className="space-y-1.5">
            <p className={`text-base font-semibold ${lightMode ? 'text-gray-600' : 'text-gray-300'}`}>
              Your canvas is ready
            </p>
            <p className={`text-sm max-w-xs mx-auto leading-relaxed ${lightMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Describe a process, upload a document, or pick a template in the chat — your diagram will appear here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const title = graph?.title ?? 'Building diagram…';
  const version = graph?.metadata.version;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className={`flex items-center justify-between px-3 py-2 ${lightMode ? 'bg-white border-gray-200' : 'bg-gray-800 border-gray-700'} border-b shrink-0`}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`text-sm font-medium truncate max-w-[180px] ${lightMode ? 'text-gray-800' : 'text-gray-200'}`} title={title}>
            {title}
          </span>
          {version !== undefined && versionHistory.length > 0 && (
            <VersionDropdown
              versions={versionHistory}
              currentVersion={version}
              onRestore={restoreVersion}
            />
          )}
          {isStreaming && (
            <span className="text-xs text-blue-400 animate-pulse shrink-0">
              {revealedCount}/{streamingGraph!.nodes.length} nodes…
            </span>
          )}
          {graph && !isStreaming && (
            <span className={`text-[10px] shrink-0 ${lightMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {graph.nodes.length} nodes · {graph.edges.length} edges
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setLightMode((m) => !m)}
            className={`p-1.5 rounded transition-colors ${lightMode ? 'hover:bg-gray-100 text-gray-600' : 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'}`}
            title={lightMode ? 'Switch to dark canvas' : 'Switch to light canvas (presentation mode)'}
          >
            {lightMode ? <Moon size={13} /> : <Sun size={13} />}
          </button>
          {graph && <ExportControls graph={graph} lightMode={lightMode} />}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          className={lightMode ? 'bg-gray-50' : 'bg-gray-950'}
          defaultEdgeOptions={{ type: 'smoothstep' }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color={lightMode ? '#d1d5db' : '#374151'}
          />
          <Controls className={lightMode ? '!bg-white !border-gray-200 !shadow-sm' : '!bg-gray-800 !border-gray-700 !shadow-none'} />
          <MiniMap
            className={lightMode ? '!bg-white !border-gray-200' : '!bg-gray-800 !border-gray-700'}
            nodeColor={lightMode ? '#2563eb' : '#3b82f6'}
            maskColor={lightMode ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.6)'}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
