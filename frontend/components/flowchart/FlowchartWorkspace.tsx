'use client';

import { useEffect, useCallback } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { useFlowchartStore } from '@/store/flowchartStore';
import ChatPanel from './ChatPanel';
import DiagramCanvas from './DiagramCanvas';

export default function FlowchartWorkspace() {
  const { currentGraph, streamingGraph, undo, redo, historyStack, redoStack } = useFlowchartStore();

  // Keyboard shortcuts: Cmd+Z / Cmd+Shift+Z
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'z' && !e.shiftKey && historyStack.length > 0) {
        e.preventDefault();
        undo();
      }
      if ((e.key === 'z' && e.shiftKey || e.key === 'y') && redoStack.length > 0) {
        e.preventDefault();
        redo();
      }
    },
    [undo, redo, historyStack.length, redoStack.length]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Left pane — Chat */}
      <div className="w-[380px] shrink-0 flex flex-col relative shadow-[1px_0_0_0_#e2e8f0]">
        <ChatPanel />
      </div>

      {/* Divider */}
      <div className="w-px bg-gray-200 shrink-0" />

      {/* Right pane — Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        <ReactFlowProvider>
          <DiagramCanvas graph={currentGraph} streamingGraph={streamingGraph} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
