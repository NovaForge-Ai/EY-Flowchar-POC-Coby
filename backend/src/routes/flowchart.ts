import { Router, Request, Response } from 'express';
import multer from 'multer';
import { generateDiagram, editDiagram, classifyIntent, getClarifyingQuestions, streamGenerateDiagram, streamEditDiagram } from '../services/flowchartService';
import { extractText } from '../services/documentParser';
import { ChatMessage } from '../models/Flowchart';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// POST /api/flowchart/generate
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { prompt, chatHistory = [] }: { prompt: string; chatHistory: ChatMessage[] } = req.body;

    if (!prompt?.trim()) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const graph = await generateDiagram(prompt, chatHistory);
    res.json({ graph });
  } catch (err: unknown) {
    console.error('Generate error:', err);
    res.status(500).json({ error: 'Failed to generate diagram', details: String(err) });
  }
});

// POST /api/flowchart/edit
router.post('/edit', async (req: Request, res: Response) => {
  try {
    const { currentGraph, instruction, chatHistory = [] } = req.body;

    if (!currentGraph) {
      return res.status(400).json({ error: 'currentGraph is required' });
    }
    if (!instruction?.trim()) {
      return res.status(400).json({ error: 'instruction is required' });
    }

    const graph = await editDiagram(currentGraph, instruction, chatHistory);
    res.json({ graph });
  } catch (err: unknown) {
    console.error('Edit error:', err);
    res.status(500).json({ error: 'Failed to edit diagram', details: String(err) });
  }
});

// POST /api/flowchart/clarify
router.post('/clarify', async (req: Request, res: Response) => {
  try {
    const { prompt, chatHistory = [] }: { prompt: string; chatHistory: ChatMessage[] } = req.body;
    if (!prompt?.trim()) {
      return res.status(400).json({ error: 'prompt is required' });
    }
    const questions = await getClarifyingQuestions(prompt, chatHistory);
    res.json({ questions });
  } catch (err: unknown) {
    console.error('Clarify error:', err);
    res.status(500).json({ questions: [] }); // graceful fallback
  }
});

// POST /api/flowchart/intent
router.post('/intent', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }
    const intent = await classifyIntent(message);
    res.json({ intent });
  } catch (err: unknown) {
    console.error('Intent error:', err);
    res.status(500).json({ error: 'Failed to classify intent', details: String(err) });
  }
});

// POST /api/flowchart/generate/stream  (SSE)
router.post('/generate/stream', async (req: Request, res: Response) => {
  const { prompt, chatHistory = [] } = req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    for await (const event of streamGenerateDiagram(prompt, chatHistory)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: String(err) })}\n\n`);
  } finally {
    res.end();
  }
});

// POST /api/flowchart/edit/stream  (SSE)
router.post('/edit/stream', async (req: Request, res: Response) => {
  const { currentGraph, instruction, chatHistory = [] } = req.body;
  if (!currentGraph) return res.status(400).json({ error: 'currentGraph is required' });
  if (!instruction?.trim()) return res.status(400).json({ error: 'instruction is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    for await (const event of streamEditDiagram(currentGraph, instruction, chatHistory)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: String(err) })}\n\n`);
  } finally {
    res.end();
  }
});

// POST /api/flowchart/upload
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const text = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);

    if (!text) {
      return res.status(422).json({ error: 'Could not extract text from the file' });
    }

    res.json({ extractedText: text, filename: req.file.originalname });
  } catch (err: unknown) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to process file', details: String(err) });
  }
});

export default router;
