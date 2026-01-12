# Embedding (Obsidian plugin)

Semantic similarity search for notes using embeddings. Shows a floating popout panel for the current note, and stores embeddings in `embeddings.json` at the vault root.

## Features
- Popout similarity panel (ESC to close, clicking links keeps the panel open)
- Update embeddings for all notes in batches
- Optional auto-update on startup (same logic as manual update)
- Configurable model, dimensions, and API base URL

## Commands
- `See Connections For Current Note`
- `Update All Embeddings`

## Settings
- API key
- API base URL
- Model
- Dimensions
- Max input chars
- Similarity limit
- Batch size
- Auto update on startup

## Installation (manual)
1) Copy this folder to `YOUR_VAULT/.obsidian/plugins/embedding/`
2) `npm install`
3) `npm run build`
4) Enable the plugin in Obsidian

## Usage
- Run `See Connections For Current Note` to show the popout panel.
- Run `Update All Embeddings` to populate/update `embeddings.json`.

## Data
- Embeddings are stored in `embeddings.json` at the vault root.
- The file is created automatically if missing.

## Troubleshooting
- If startup updates do nothing, ensure you built `main.js` and the API key is set.
- If API calls fail, check the base URL and model name.
