# Construct

A modern Tauri v2 desktop application built with React 18, TypeScript, and Tailwind CSS.

## Features

- **Tauri v2** - Rust-powered desktop app shell
- **React 18 + Vite** - Fast development and HMR
- **TypeScript** - Type-safe code throughout
- **Tailwind CSS** - Utility-first styling with custom Catppuccin-inspired theme
- **Monaco Editor** - Full-featured code editor loaded from CDN
- **Zustand** - Lightweight state management
- **React Router** - Client-side routing
- **Lucide React** - Beautiful icon set
- **Persistent Memory System** - SQLite + ChromaDB for agent memory

## Project Structure

```
construct/
├── src/
│   ├── main/              # Tauri Rust backend
│   │   ├── src/
│   │   │   ├── main.rs    # Entry point
│   │   │   ├── lib.rs     # App logic & commands
│   │   │   ├── db.rs      # SQLite memory layer
│   │   │   └── commands/
│   │   │       ├── mod.rs
│   │   │       └── memory.rs  # Tauri memory commands
│   │   ├── Cargo.toml
│   │   ├── capabilities/
│   │   │   └── default.json   # Tauri v2 permissions
│   │   └── tauri.conf.json
│   ├── renderer/          # React frontend
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Editor.tsx
│   │   │   ├── Panel.tsx       # Bottom panel (Terminal/Problems/Chat/Memory)
│   │   │   ├── MemoryPanel.tsx # Memory system UI
│   │   │   └── StatusBar.tsx
│   │   ├── hooks/
│   │   ├── stores/
│   │   │   └── useAppStore.ts
│   │   ├── types/
│   │   │   ├── index.ts
│   │   │   └── memory.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   └── shared/            # Shared types between main/renderer
├── agent-backend/         # Python ChromaDB semantic memory
│   ├── memory/
│   │   ├── __init__.py
│   │   └── semantic.py    # ChromaDB + sentence-transformers
│   ├── app.py             # FastAPI memory service
│   └── requirements.txt
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── .env.example
└── index.html
```

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (latest stable)
- [Tauri CLI](https://tauri.app/start/prerequisites/) prerequisites
- [Python 3.10+](https://python.org/) (for ChromaDB memory backend)

### Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install Python dependencies (for memory backend)
cd agent-backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Development

```bash
# Terminal 1: Start the Python memory service
cd agent-backend
python -m uvicorn app:app --reload --port 8000

# Terminal 2: Start the Tauri app
npm run tauri:dev
```

### Build

```bash
# Build for production
npm run tauri:build
```

The built application will be in `src/main/target/release/bundle/`.

## Monaco Editor Configuration

Monaco Editor is configured to load from CDN via `@monaco-editor/react`'s loader config:

```typescript
loader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs",
  },
});
```

This avoids bundling Monaco with your app, reducing bundle size significantly.

## Memory System (Phase 2)

Construct features a dual-layer persistent memory system:

### Layer 1: SQLite (Rust/Tauri)

Stores structured data locally in `~/.local/share/construct/construct.db`:

| Table | Purpose |
|-------|---------|
| `conversations` | All user/agent message history |
| `code_events` | File changes, diffs, summaries |
| `user_preferences` | Learned preferences with confidence scores |
| `project_state` | Current project snapshot (branch, commit, context) |

### Tauri Commands

| Command | Description |
|---------|-------------|
| `record_conversation` | Store a conversation message |
| `recall_context` | Search conversations + code events by text |
| `store_preference` | Save/update a user preference |
| `get_preferences` | Retrieve all preferences (by confidence) |
| `get_project_state` | Get project snapshot |
| `update_project_state` | Save project snapshot |
| `get_recent_conversations` | List recent messages |
| `get_recent_code_events` | List recent code changes |

### Layer 2: ChromaDB (Python)

Provides semantic vector search via sentence-transformers:

| Collection | Content |
|------------|---------|
| `conversation_embeddings` | Vectorized conversation messages |
| `code_embeddings` | Vectorized code events and diffs |

**Key functions:**
- `store_embedding()` - Embed and store text
- `query_similar()` - Semantic similarity search
- `hybrid_search()` - Combines vector + SQLite FTS results

### Memory Panel UI

The bottom panel includes a **Memory** tab with:
- **Conversations** - Chat history with role badges (You/AI/System)
- **Code Events** - File changes with type badges (CREATE/MODIFY/DELETE/REFACTOR)
- **Preferences** - Learned preferences with confidence bars
- **Search** - Semantic memory search with relevance scoring

## Custom Theme

The app uses a Catppuccin-inspired dark theme with custom colors defined in `tailwind.config.js`. The editor also has a custom Monaco theme called `"construct-dark"` defined in `src/renderer/hooks/useMonaco.ts`.

## Configuration

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

Key environment variables:
- `DB_PATH` - SQLite database location
- `CHROMA_PATH` - ChromaDB persistent storage directory
- `EMBEDDING_MODEL` - Sentence-transformers model name
- `MEMORY_API_PORT` - Python memory service port

## License

MIT
