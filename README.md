# Copilot Agent

An Electron desktop app for chatting with an AI agent and rendering rich visual responses such as charts, weather cards, terminal output, and Markdown content.

## Tech Stack

- Electron + electron-vite
- React 19 + TypeScript
- Tailwind CSS
- LangChain.js + LangGraph (custom StateGraph in main process)
- Zustand
- ECharts
- SqliteSaver checkpointer for conversation history

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development app:

```bash
npm run dev
```

Build the app:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Architecture

```text
electron/
  main.ts                 # Electron entry + IPC registration
  agent/                  # LangGraph agent engine (tools, graph, stream adapter)
  ipc/                    # IPC handlers (chat, conversations, llm-config, store)
src/
  agent/                  # Renderer bridge + prompts + LLM settings UI helpers
  shared/                 # Shared types, IPC contracts, visual type constants
  components/             # React UI
  services/               # External data APIs used by main-process tools
```

Agent logic runs in the **main process** for security (API keys, command execution, file access). The renderer sends `conversationId` + message via IPC; conversation history is persisted in SQLite via LangGraph checkpointer.

For architecture details and iteration guidelines, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Notes

- `node_modules/`, build outputs, caches, logs, and local environment files are ignored by Git.
- Keep secrets in local `.env` files and do not commit them.
