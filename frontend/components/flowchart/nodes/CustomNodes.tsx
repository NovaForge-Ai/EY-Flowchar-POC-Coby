'use client';

import { Handle, Position, NodeProps } from 'reactflow';

interface NodeData {
  label: string;
}

interface SectionNodeData {
  label: string;
  description?: string;
  color?: string;
}

const SECTION_PALETTE: Record<string, { bg: string; border: string; chipBg: string; text: string }> = {
  indigo:  { bg: 'rgba(99,102,241,0.06)',  border: '#818cf8', chipBg: 'rgba(99,102,241,0.14)',  text: '#4338ca' },
  teal:    { bg: 'rgba(20,184,166,0.06)',   border: '#2dd4bf', chipBg: 'rgba(20,184,166,0.14)',   text: '#0f766e' },
  amber:   { bg: 'rgba(245,158,11,0.06)',   border: '#fbbf24', chipBg: 'rgba(245,158,11,0.14)',   text: '#92400e' },
  rose:    { bg: 'rgba(244,63,94,0.06)',    border: '#fb7185', chipBg: 'rgba(244,63,94,0.14)',    text: '#9f1239' },
  green:   { bg: 'rgba(34,197,94,0.06)',    border: '#4ade80', chipBg: 'rgba(34,197,94,0.14)',    text: '#166534' },
  sky:     { bg: 'rgba(14,165,233,0.06)',   border: '#38bdf8', chipBg: 'rgba(14,165,233,0.14)',   text: '#075985' },
  violet:  { bg: 'rgba(139,92,246,0.06)',   border: '#a78bfa', chipBg: 'rgba(139,92,246,0.14)',   text: '#5b21b6' },
  orange:  { bg: 'rgba(249,115,22,0.06)',   border: '#fb923c', chipBg: 'rgba(249,115,22,0.14)',   text: '#9a3412' },
};

const labelClass = 'text-[11px] font-semibold tracking-wide leading-tight';

export function ProcessNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div className={`px-4 py-2.5 min-w-[140px] text-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg border transition-all ${selected ? 'border-indigo-300 ring-2 ring-indigo-400/40 ring-offset-1 ring-offset-gray-900' : 'border-indigo-400/40'}`}>
      <Handle type="target" position={Position.Top} className="!bg-indigo-300 !border-indigo-200" />
      <span className={labelClass}>{data.label}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-300 !border-indigo-200" />
    </div>
  );
}

export function DecisionNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 160, height: 80 }}>
      <Handle type="target" position={Position.Top} className="!bg-amber-400 !border-amber-300" />
      <div
        className={`absolute inset-0 bg-gradient-to-br from-amber-400 to-amber-500 shadow-lg border transition-all ${selected ? 'border-amber-200 ring-2 ring-amber-400/40 ring-offset-1 ring-offset-gray-900' : 'border-amber-400/50'}`}
        style={{ transform: 'rotate(45deg)', borderRadius: 8 }}
      />
      <div className="relative z-10 flex items-center justify-center w-full h-full px-4">
        <span className={`${labelClass} text-gray-900 text-center`}>{data.label}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-400 !border-amber-300" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-amber-400 !border-amber-300" />
    </div>
  );
}

export function StartNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div
      className={`px-5 py-2.5 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg border transition-all ${selected ? 'border-emerald-200 ring-2 ring-emerald-400/40 ring-offset-1 ring-offset-gray-900' : 'border-emerald-400/40'}`}
      style={{ minWidth: 60 }}
    >
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-300 !border-emerald-200" />
      <span className={`${labelClass} block text-center`}>{data.label}</span>
    </div>
  );
}

export function EndNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div
      className={`px-5 py-2.5 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-lg border-[3px] transition-all ${selected ? 'border-rose-200 ring-2 ring-rose-400/40 ring-offset-1 ring-offset-gray-900' : 'border-rose-400/60'}`}
      style={{ minWidth: 60 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-rose-300 !border-rose-200" />
      <span className={`${labelClass} block text-center`}>{data.label}</span>
    </div>
  );
}

export function IONode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div className="relative" style={{ width: 152, height: 54 }}>
      <Handle type="target" position={Position.Top} className="!bg-violet-300 !border-violet-200" />
      <div
        className={`absolute inset-0 bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg border transition-all ${selected ? 'border-violet-300 ring-2 ring-violet-400/40 ring-offset-1 ring-offset-gray-900' : 'border-violet-400/40'}`}
        style={{ clipPath: 'polygon(10% 0%, 100% 0%, 90% 100%, 0% 100%)' }}
      />
      <span className={`absolute inset-0 flex items-center justify-center ${labelClass} text-white px-6`}>
        {data.label}
      </span>
      <Handle type="source" position={Position.Bottom} className="!bg-violet-300 !border-violet-200" />
    </div>
  );
}

export function DatabaseNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div
      className={`px-4 py-2.5 min-w-[140px] text-center bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-lg border transition-all ${selected ? 'border-sky-300 ring-2 ring-sky-400/40 ring-offset-1 ring-offset-gray-900' : 'border-sky-400/40'}`}
      style={{ borderRadius: '50% / 14px' }}
    >
      <Handle type="target" position={Position.Top} className="!bg-sky-300 !border-sky-200" />
      <span className={labelClass}>{data.label}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-sky-300 !border-sky-200" />
    </div>
  );
}

export function ExternalNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div className={`px-4 py-2.5 min-w-[140px] text-center rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-lg border transition-all ${selected ? 'border-slate-300 ring-2 ring-slate-400/40 ring-offset-1 ring-offset-gray-900' : 'border-slate-400/40'}`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-300 !border-slate-200" />
      <span className={labelClass}>{data.label}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-300 !border-slate-200" />
    </div>
  );
}

export function SectionNode({ data, selected }: NodeProps<SectionNodeData>) {
  const p = SECTION_PALETTE[data.color ?? 'indigo'] ?? SECTION_PALETTE.indigo;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: p.bg,
        border: `2px dashed ${p.border}`,
        borderRadius: 16,
        boxSizing: 'border-box',
        opacity: selected ? 1 : 0.88,
        transition: 'opacity 0.15s',
      }}
    >
      {/* Floating label chip above top-left corner */}
      <div
        style={{
          position: 'absolute',
          top: -16,
          left: 14,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          backgroundColor: p.chipBg,
          border: `1.5px solid ${p.border}`,
          borderRadius: 20,
          padding: '3px 10px 3px 8px',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: p.text, letterSpacing: '0.025em' }}>
          {data.label}
        </span>
        {data.description && (
          <span style={{ fontSize: 10, color: p.text, opacity: 0.65 }}>
            · {data.description}
          </span>
        )}
      </div>
    </div>
  );
}

export const nodeTypes = {
  process: ProcessNode,
  decision: DecisionNode,
  start: StartNode,
  end: EndNode,
  io: IONode,
  database: DatabaseNode,
  external: ExternalNode,
  swimlane_header: ProcessNode,
  section: SectionNode,
};
