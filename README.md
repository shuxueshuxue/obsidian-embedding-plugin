# Embedding (Obsidian plugin)

Blazingly fast vault navigation: a floating similarity panel with single-letter hotkeys (`a`/`b`/`c`/... + `z`) lets you jump through related notes without touching the sidebar.

## Core idea
Open the popout, keep your hands on the keyboard, and fly through the vault:
- `a` always opens the original note
- `b`/`c`/`d`... open the ranked similar notes
- `z` recomputes with the currently opened note as the new original

The hotkeys are captured globally while the panel is open, so focus changes do not break navigation.

## Features
- Popout similarity panel with single-letter navigation (ESC to close)
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
- Use `a` for the original note, `b`/`c`/`d`... for results, and `z` to refresh using the current note.

## Data
- Embeddings are stored in `embeddings.json` at the vault root.
- The file is created automatically if missing.

## Troubleshooting
- If startup updates do nothing, ensure you built `main.js` and the API key is set.
- If API calls fail, check the base URL and model name.
