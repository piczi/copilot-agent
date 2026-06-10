# Copilot Agent

An Electron desktop app for chatting with an AI agent and rendering rich visual responses such as charts, weather cards, terminal output, and Markdown content.

## Tech Stack

- Electron + electron-vite
- React 19 + TypeScript
- Tailwind CSS
- LangChain / LangGraph
- Zustand
- ECharts

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

Preview the production build:

```bash
npm run preview
```

## Project Structure

```text
electron/   Electron main and preload processes
src/        React UI, agent logic, state, services, and shared types
out/        Generated build output, ignored by Git
```

## Notes

- `node_modules/`, build outputs, caches, logs, and local environment files are ignored by Git.
- Keep secrets in local `.env` files and do not commit them.
