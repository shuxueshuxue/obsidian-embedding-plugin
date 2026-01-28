# Embedding (Obsidian plugin)

Semantic, keyboard-first navigation for your vault. This plugin builds embeddings for your notes and opens a floating pop-out panel so you can jump through related ideas without touching the sidebar.

## What it feels like
- Open the pop-out and stay on the keyboard.
- `a` always opens the original note.
- `b`/`c`/`d`… open ranked similar notes.
- `z` recomputes using the currently open note as the new “original”.
- Hotkeys are captured while the panel is open, so focus changes do not break navigation.

## Features
- Floating similarity panel (ESC closes it)
- Single-letter navigation with deterministic hotkeys
- Batch embedding updates for all notes
- Optional auto-update on startup (same logic as manual update)
- Configurable model, dimensions, and API base URL

## Commands
- `See connections for current note`
- `Update all embeddings`

## Settings
- API key
- API base URL
- Model
- Dimensions
- Max input chars
- Similarity limit
- Batch size
- Auto update on startup
- MCP server enabled + port
- Cherry Studio JSON (copy helper)

## MCP server (optional)
The plugin can expose semantic search over a local MCP JSON-RPC server, so external AI chat apps can query your vault and “learn you better”.

- Endpoint: `http://127.0.0.1:<port>/mcp`
- Tools: `semantic_search_text`, `semantic_search_note`, `fetch_note`
- Search tools return note paths plus content (full < 3k chars, 1k snippet if longer)
- Cherry Studio: open MCP settings → JSON import, then paste the config from the plugin settings
- Missing notes are reported as `missingPaths` and pruned from `embeddings.json`

The MCP server is **local-only** (127.0.0.1) and can be disabled in settings.

## Installation (manual)
1) Copy this folder to `YOUR_VAULT/.obsidian/plugins/embedding/`
2) `npm install`
3) `npm run build`
4) Enable the plugin in Obsidian

## Usage
1) Configure your API key in settings.
2) Run `Update all embeddings` once to generate `embeddings.json`.
3) Run `See connections for current note` to open the pop-out panel.

## Data
- Embeddings are stored in `embeddings.json` at the vault root.
- The file is created automatically if missing.
