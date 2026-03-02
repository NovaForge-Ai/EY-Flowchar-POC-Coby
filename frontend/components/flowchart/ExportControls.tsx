'use client';

import { useState } from 'react';
import { saveAs } from 'file-saver';
import { Download, Clipboard, Check } from 'lucide-react';
import { DiagramGraph, DiagramNode, DiagramEdge } from '@/types/flowchart';

interface ExportControlsProps {
  graph: DiagramGraph | null;
  lightMode?: boolean;
}

function diagramToMermaid(graph: DiagramGraph): string {
  const lines: string[] = [];

  if (graph.type === 'decision_tree' || graph.type === 'process_flow') {
    lines.push('flowchart TD');
  } else {
    lines.push('flowchart LR');
  }

  for (const node of graph.nodes) {
    const label = node.label.replace(/"/g, "'");
    if (node.type === 'decision') {
      lines.push(`  ${node.id}{{"${label}"}}`);
    } else if (node.type === 'start' || node.type === 'end') {
      lines.push(`  ${node.id}(("${label}"))`);
    } else if (node.type === 'database') {
      lines.push(`  ${node.id}[("${label}")]`);
    } else {
      lines.push(`  ${node.id}["${label}"]`);
    }
  }

  for (const edge of graph.edges) {
    const lbl = edge.label ? `|"${edge.label}"|` : '';
    lines.push(`  ${edge.source} -->${lbl} ${edge.target}`);
  }

  return lines.join('\n');
}

async function exportAsPNG(title: string, light: boolean) {
  const { toPng } = await import('html-to-image');
  const el = document.querySelector('.react-flow') as HTMLElement;
  if (!el) return;
  const dataUrl = await toPng(el, {
    backgroundColor: light ? '#ffffff' : '#030712',
    pixelRatio: 2,
  });
  saveAs(dataUrl, `${title}${light ? '-light' : ''}.png`);
}

async function exportAsSVG(title: string) {
  const el = document.querySelector('.react-flow') as HTMLElement;
  if (!el) return;
  const rfSvg = el.querySelector('svg');
  if (rfSvg) {
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(rfSvg);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    saveAs(blob, `${title}.svg`);
  }
}

// ── VSDX Export ───────────────────────────────────────────────────────────────

/** BFS topological layout — mirrors DiagramCanvas autoLayout */
function computeVSDXLayout(graph: DiagramGraph): Record<string, { x: number; y: number }> {
  const LAYER_H = 200;
  const NODE_W = 240;

  const inDegree: Record<string, number> = {};
  const adjList: Record<string, string[]> = {};
  for (const node of graph.nodes) { inDegree[node.id] = 0; adjList[node.id] = []; }
  for (const edge of graph.edges) {
    inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
    adjList[edge.source].push(edge.target);
  }

  const layers: string[][] = [];
  const visited = new Set<string>();
  let queue = graph.nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
  if (queue.length === 0 && graph.nodes.length > 0) queue = [graph.nodes[0].id];

  while (queue.length > 0) {
    layers.push([...queue]);
    queue.forEach((id) => visited.add(id));
    const next: string[] = [];
    for (const id of queue)
      for (const child of adjList[id] || [])
        if (!visited.has(child)) next.push(child);
    queue = [...new Set(next)];
  }

  const unvisited = graph.nodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
  if (unvisited.length > 0) layers.push(unvisited);

  const positions: Record<string, { x: number; y: number }> = {};
  layers.forEach((layer, li) => {
    const startX = -(layer.length * NODE_W) / 2;
    layer.forEach((id, i) => {
      positions[id] = { x: startX + i * NODE_W + NODE_W / 2, y: li * LAYER_H };
    });
  });

  return positions;
}

function xmlEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function exportAsVSDX(graph: DiagramGraph, title: string) {
  const JSZip = (await import('jszip')).default;

  // ── Layout & coordinate helpers ─────────────────────────────────────────────
  const positions = computeVSDXLayout(graph);
  const PX_PER_IN = 96;
  const MARGIN_IN = 0.75;

  const nodeDims: Record<string, { w: number; h: number }> = {
    process:         { w: 1.5, h: 0.6  },
    decision:        { w: 1.6, h: 0.8  },
    start:           { w: 1.0, h: 0.5  },
    end:             { w: 1.0, h: 0.5  },
    io:              { w: 1.6, h: 0.6  },
    database:        { w: 1.5, h: 0.6  },
    external:        { w: 1.5, h: 0.6  },
    swimlane_header: { w: 1.5, h: 0.6  },
  };

  const nodeColors: Record<string, { fill: string; line: string; text: string }> = {
    process:         { fill: 'RGB(99,102,241)',   line: 'RGB(79,70,229)',   text: 'RGB(255,255,255)' },
    decision:        { fill: 'RGB(245,158,11)',   line: 'RGB(217,119,6)',   text: 'RGB(17,24,39)'    },
    start:           { fill: 'RGB(52,211,153)',   line: 'RGB(16,185,129)',  text: 'RGB(255,255,255)' },
    end:             { fill: 'RGB(244,63,94)',    line: 'RGB(225,29,72)',   text: 'RGB(255,255,255)' },
    io:              { fill: 'RGB(139,92,246)',   line: 'RGB(109,40,217)',  text: 'RGB(255,255,255)' },
    database:        { fill: 'RGB(14,165,233)',   line: 'RGB(2,132,199)',   text: 'RGB(255,255,255)' },
    external:        { fill: 'RGB(100,116,139)',  line: 'RGB(71,85,105)',   text: 'RGB(255,255,255)' },
    swimlane_header: { fill: 'RGB(99,102,241)',   line: 'RGB(79,70,229)',   text: 'RGB(255,255,255)' },
  };

  const fallbackColors = { fill: 'RGB(99,102,241)', line: 'RGB(79,70,229)', text: 'RGB(255,255,255)' };

  // Compute bounding box → page size
  const allX = Object.values(positions).map((p) => p.x);
  const allY = Object.values(positions).map((p) => p.y);
  const minX = Math.min(...allX, 0);
  const minY = Math.min(...allY, 0);
  const maxX = Math.max(...allX, 0);
  const maxY = Math.max(...allY, 0);

  const pageW = (maxX - minX) / PX_PER_IN + 2.0 + MARGIN_IN * 2;
  const pageH = (maxY - minY) / PX_PER_IN + 1.0 + MARGIN_IN * 2;

  // px → Visio inches; Y is flipped (Visio origin = bottom-left)
  const toVX = (px: number) => (px - minX) / PX_PER_IN + MARGIN_IN;
  const toVY = (px: number) => pageH - ((px - minY) / PX_PER_IN + MARGIN_IN);

  // Integer shape IDs: nodes 1…N, edges N+1…
  const nodeIdMap: Record<string, number> = {};
  graph.nodes.forEach((n, i) => { nodeIdMap[n.id] = i + 1; });
  const edgeBase = graph.nodes.length + 1;

  // ── Geometry helpers (relative coords 0–1) ─────────────────────────────────
  const rectGeom = () => `
        <Section N="Geometry" IX="0">
          <Row T="RelMoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>
          <Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="0"/></Row>
          <Row T="RelLineTo" IX="3"><Cell N="X" V="1"/><Cell N="Y" V="1"/></Row>
          <Row T="RelLineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row>
          <Row T="RelLineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>
        </Section>`;

  const diamondGeom = () => `
        <Section N="Geometry" IX="0">
          <Row T="RelMoveTo" IX="1"><Cell N="X" V="0.5"/><Cell N="Y" V="0"/></Row>
          <Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="0.5"/></Row>
          <Row T="RelLineTo" IX="3"><Cell N="X" V="0.5"/><Cell N="Y" V="1"/></Row>
          <Row T="RelLineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="0.5"/></Row>
          <Row T="RelLineTo" IX="5"><Cell N="X" V="0.5"/><Cell N="Y" V="0"/></Row>
        </Section>`;

  // Ellipse via built-in Ellipse row: center (0.5,0.5), right (1,0.5), bottom (0.5,0)
  const ellipseGeom = () => `
        <Section N="Geometry" IX="0">
          <Row T="Ellipse" IX="1">
            <Cell N="X" V="0.5"/>
            <Cell N="Y" V="0.5"/>
            <Cell N="A" V="1"/>
            <Cell N="B" V="0.5"/>
            <Cell N="C" V="0.5"/>
            <Cell N="D" V="0"/>
          </Row>
        </Section>`;

  const parallelogramGeom = () => `
        <Section N="Geometry" IX="0">
          <Row T="RelMoveTo" IX="1"><Cell N="X" V="0.1"/><Cell N="Y" V="0"/></Row>
          <Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="0"/></Row>
          <Row T="RelLineTo" IX="3"><Cell N="X" V="0.9"/><Cell N="Y" V="1"/></Row>
          <Row T="RelLineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row>
          <Row T="RelLineTo" IX="5"><Cell N="X" V="0.1"/><Cell N="Y" V="0"/></Row>
        </Section>`;

  const lineGeom = () => `
        <Section N="Geometry" IX="0">
          <Row T="RelMoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>
          <Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="1"/></Row>
        </Section>`;

  // ── Shape builders ──────────────────────────────────────────────────────────
  const buildNodeShape = (node: DiagramNode) => {
    const pos = positions[node.id] || { x: 0, y: 0 };
    const type = node.type || 'process';
    const dims = nodeDims[type] ?? nodeDims.process;
    const colors = nodeColors[type] ?? fallbackColors;
    const id = nodeIdMap[node.id];
    const cx = toVX(pos.x).toFixed(4);
    const cy = toVY(pos.y).toFixed(4);

    let geom: string;
    switch (type) {
      case 'decision': geom = diamondGeom(); break;
      case 'start':
      case 'end':      geom = ellipseGeom(); break;
      case 'io':       geom = parallelogramGeom(); break;
      default:         geom = rectGeom(); break;
    }

    return `
      <Shape ID="${id}" Type="Shape">
        <XForm>
          <PinX>${cx}</PinX>
          <PinY>${cy}</PinY>
          <Width>${dims.w}</Width>
          <Height>${dims.h}</Height>
          <LocPinX F="Width*0.5">${(dims.w * 0.5).toFixed(4)}</LocPinX>
          <LocPinY F="Height*0.5">${(dims.h * 0.5).toFixed(4)}</LocPinY>
        </XForm>
        <Fill>
          <FillForegnd>${colors.fill}</FillForegnd>
          <FillBkgnd>${colors.fill}</FillBkgnd>
          <FillPattern>1</FillPattern>
        </Fill>
        <Line>
          <LineColor>${colors.line}</LineColor>
          <LineWeight>0.01389</LineWeight>
          <LinePattern>1</LinePattern>
        </Line>
        <Char IX="0">
          <Color>${colors.text}</Color>
          <Size>0.1111</Size>
          <Style>1</Style>
        </Char>
        <Para IX="0"><HorzAlign>1</HorzAlign></Para>
        <TextBlock><VerticalAlign>1</VerticalAlign></TextBlock>
        ${geom}
        <Text>${xmlEsc(node.label)}</Text>
      </Shape>`;
  };

  const buildEdgeShape = (edge: DiagramEdge, idx: number) => {
    const srcPos = positions[edge.source];
    const tgtPos = positions[edge.target];
    if (!srcPos || !tgtPos) return '';
    const id = edgeBase + idx;

    return `
      <Shape ID="${id}" Type="Shape">
        <XForm1D>
          <BeginX>${toVX(srcPos.x).toFixed(4)}</BeginX>
          <BeginY>${toVY(srcPos.y).toFixed(4)}</BeginY>
          <EndX>${toVX(tgtPos.x).toFixed(4)}</EndX>
          <EndY>${toVY(tgtPos.y).toFixed(4)}</EndY>
        </XForm1D>
        <Line>
          <BeginArrow>0</BeginArrow>
          <EndArrow>1</EndArrow>
          <LineColor>RGB(107,114,128)</LineColor>
          <LineWeight>0.01389</LineWeight>
        </Line>
        ${lineGeom()}
        ${edge.label ? `<Text>${xmlEsc(edge.label)}</Text>` : ''}
      </Shape>`;
  };

  const buildConnect = (edge: DiagramEdge, idx: number) => {
    const srcId = nodeIdMap[edge.source];
    const tgtId = nodeIdMap[edge.target];
    if (!srcId || !tgtId) return '';
    const edgeId = edgeBase + idx;
    return `
      <Connect FromSheet="${edgeId}" FromCell="BeginX" FromPart="9" ToSheet="${srcId}" ToCell="PinX" ToPart="3"/>
      <Connect FromSheet="${edgeId}" FromCell="EndX" FromPart="12" ToSheet="${tgtId}" ToCell="PinX" ToPart="3"/>`;
  };

  // ── Assemble XML files ──────────────────────────────────────────────────────
  const safeTitle = xmlEsc(title);

  const contentTypes = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>
  <Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>
</Types>`;

  const dotRels = `<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>
</Relationships>`;

  const documentXml = `<?xml version="1.0" encoding="utf-8"?>
<VisioDocument xmlns="http://schemas.microsoft.com/office/visio/2012/main"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <DocumentProperties>
    <Title>${safeTitle}</Title>
    <Creator>EY Jumpstart</Creator>
  </DocumentProperties>
  <StyleSheets/>
  <Pages>
    <Page ID="0" Name="Page-1">
      <Rel r:id="rId1"/>
    </Page>
  </Pages>
</VisioDocument>`;

  const documentRels = `<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="pages/page1.xml"/>
</Relationships>`;

  const page1Xml = `<?xml version="1.0" encoding="utf-8"?>
<PageContents xmlns="http://schemas.microsoft.com/office/visio/2012/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
              xml:space="preserve">
  <PageSheet>
    <Section N="PageProperties">
      <Row T="PageProperties">
        <Cell N="PageWidth" V="${pageW.toFixed(4)}"/>
        <Cell N="PageHeight" V="${pageH.toFixed(4)}"/>
        <Cell N="PageScale" V="1"/>
        <Cell N="DrawingScale" V="1"/>
      </Row>
    </Section>
  </PageSheet>
  <Shapes>
    ${graph.nodes.map(buildNodeShape).join('')}
    ${graph.edges.map((e, i) => buildEdgeShape(e, i)).filter(Boolean).join('')}
  </Shapes>
  <Connects>
    ${graph.edges.map((e, i) => buildConnect(e, i)).filter(Boolean).join('')}
  </Connects>
</PageContents>`;

  // ── Bundle into ZIP ─────────────────────────────────────────────────────────
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', dotRels);
  zip.file('visio/document.xml', documentXml);
  zip.file('visio/_rels/document.xml.rels', documentRels);
  zip.file('visio/pages/page1.xml', page1Xml);

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${title}.vsdx`);
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ExportControls({ graph, lightMode = false }: ExportControlsProps) {
  const [copied, setCopied] = useState(false);
  const title = graph?.title || 'flowchart';

  const exportJSON = () => {
    if (!graph) return;
    const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
    saveAs(blob, `${title}.json`);
  };

  const exportMermaid = () => {
    if (!graph) return;
    const mmd = diagramToMermaid(graph);
    const blob = new Blob([mmd], { type: 'text/plain' });
    saveAs(blob, `${title}.mmd`);
  };

  const copyMermaid = async () => {
    if (!graph) return;
    const text = diagramToMermaid(graph);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const btnClass = lightMode
    ? 'px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
    : 'px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

  const disabled = !graph;

  return (
    <div className="flex items-center gap-1">
      <span className={`text-xs mr-1 flex items-center gap-1 ${lightMode ? 'text-gray-500' : 'text-gray-400'}`}>
        <Download size={12} /> Export:
      </span>
      <button onClick={() => exportAsPNG(title, false)} disabled={disabled} className={btnClass}>PNG</button>
      <button onClick={() => exportAsPNG(title, true)} disabled={disabled} className={btnClass}>PNG (Light)</button>
      <button onClick={() => exportAsSVG(title)} disabled={disabled} className={btnClass}>SVG</button>
      <button onClick={() => graph && exportAsVSDX(graph, title)} disabled={disabled} className={btnClass} title="Export as Microsoft Visio (.vsdx)">Visio</button>
      <button onClick={exportJSON} disabled={disabled} className={btnClass}>JSON</button>
      <button onClick={exportMermaid} disabled={disabled} className={btnClass}>Mermaid</button>
      <button
        onClick={copyMermaid}
        disabled={disabled}
        className={`${btnClass} flex items-center gap-1`}
        title="Copy Mermaid to clipboard"
      >
        {copied ? <Check size={11} className="text-green-400" /> : <Clipboard size={11} />}
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
