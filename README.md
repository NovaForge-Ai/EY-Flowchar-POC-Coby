# Flowchart Agent

An AI-powered flowchart generator. Describe a process in plain language, answer a few clarifying questions, and get a clean, interactive diagram — no diagram syntax required.

## Features

- **Natural language input**: Describe any process and the agent generates a flowchart
- **Clarifying questions**: The agent asks targeted MCQ questions before generating to get the diagram right
- **Live streaming**: Watch nodes and edges appear in real-time as the agent reasons
- **Interactive canvas**: Pan, zoom, and inspect nodes on a React Flow canvas
- **Session history**: Browse and restore previous diagrams from the session drawer
- **Undo / Redo**: `Cmd+Z` / `Cmd+Shift+Z` to step through diagram history
- **Export**: Download the diagram as PNG or copy the underlying JSON

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS, React Flow
- **Backend**: Express.js, TypeScript
- **LLM**: NVIDIA NIM (configurable via `LLM_API_KEY`)
- **State**: Zustand

## Getting Started

### Prerequisites

- Node.js 18+

### Installation

```bash
# Frontend
cd frontend && npm install

# Backend
cd backend && npm install
```

### Configuration

Copy `backend/.env.example` to `backend/.env` and set your key:

```
LLM_API_KEY=your_nvidia_nim_api_key
```

### Running

```bash
# Terminal 1 — backend (http://localhost:3001)
cd backend && npm run dev

# Terminal 2 — frontend (http://localhost:3000)
cd frontend && npm run dev
```

## Project Structure

```
ey-jumpstart/
├── frontend/
│   ├── app/                  # Next.js App Router
│   ├── components/
│   │   └── flowchart/        # Chat panel, canvas, streaming, session drawer
│   ├── store/                # Zustand store (flowchart state)
│   └── types/                # TypeScript types
└── backend/
    └── src/
        ├── routes/           # /api/flowchart, /api/clarify
        └── services/         # LLM streaming logic
```

## Usage

1. Open `http://localhost:3000`
2. Type a process description in the chat (e.g. *"user login flow with MFA"*)
3. Answer the clarifying questions
4. The diagram streams in on the right — pan and zoom to explore
5. Iterate by sending follow-up messages or start fresh with a new session

## License

ISC
