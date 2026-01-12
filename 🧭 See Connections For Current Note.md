# JS

```js
// ==UserScript==
// @name         Show Semantic Similarity Results (runjsf version, ESC close, links don't close, right offset)
// @namespace    Obsidian.Scripts
// @version      1.5
// @description  Displays semantic similarity results, handles updates, closes on ESC, remains open on link clicks, positioned slightly right.
// @author       YourName
// @match        app://obsidian.md/*
// @grant        none
// ==/UserScript==

// --- Configuration (Global Scope) ---
const PANEL_ID = 'semantic-similarity-results-panel';
const LIST_ID = `${PANEL_ID}-list`;
const HEADER_ID = `${PANEL_ID}-header`;
let similarityPanelEscListener = null; // Reference for ESC listener removal

// --- Panel Management Functions (Global Scope) ---

/**
 * Removes the similarity panel from the DOM and cleans up the ESC key listener.
 */
function removeSimilarityPanel() {
    const existingPanel = document.getElementById(PANEL_ID);
    if (existingPanel) {
        existingPanel.remove();
    }
    if (similarityPanelEscListener) {
        document.removeEventListener('keydown', similarityPanelEscListener);
        similarityPanelEscListener = null;
    }
}

/**
 * Creates the panel shell, adds close button logic, positions slightly right, and sets up the ESC key listener.
 * @returns {object|null} An object containing references to container, header, and resultsList elements, or null if creation fails.
 */
function createPanelShell() {
    try {
        const container = document.createElement('div');
        container.id = PANEL_ID;
        // Styling
        Object.assign(container.style, {
            position: 'fixed', top: '5%', left: '50%', // Keep left edge starting point at center
            padding: '20px',
            backgroundColor: 'var(--background-primary)', borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)', zIndex: '9999',
            maxHeight: '100vh', overflowY: 'auto', color: 'var(--text-normal)',
            maxWidth: 'min(600px, 90vw)', fontFamily: 'var(--font-interface, sans-serif)',
            fontSize: 'var(--font-ui-normal, 15px)',
            transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
            opacity: '0',
            // --- MODIFIED TRANSFORM for slight right offset ---
            // Initial state for animation (slightly up and offset right)
            transform: 'translateX(calc(-50% + 5vw)) translateY(-10px)',
        });

        // Header
        const header = document.createElement('h3');
        header.id = HEADER_ID;
        header.textContent = 'Semantic Similarity';
        Object.assign(header.style, { marginTop: '0', marginBottom: '15px', color: 'var(--text-muted)', fontWeight: '600' });
        container.appendChild(header);

        // Close button
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.setAttribute('aria-label', 'Close Similarity Panel');
        Object.assign(closeButton.style, {
            position: 'absolute', top: '10px', right: '10px',
            background: 'none', border: 'none', fontSize: '20px',
            color: 'var(--text-muted)', cursor: 'pointer', padding: '0 5px', lineHeight: '1'
        });
        closeButton.addEventListener('click', () => {
            container.style.opacity = '0';
            // --- MODIFIED TRANSFORM for exit animation ---
            container.style.transform = 'translateX(calc(-50% + 5vw)) translateY(-10px)';
            setTimeout(removeSimilarityPanel, 300); // Remove after animation
        });
        container.appendChild(closeButton);

        // Results list container
        const resultsList = document.createElement('div');
        resultsList.id = LIST_ID;
        Object.assign(resultsList.style, { display: 'flex', flexDirection: 'column', gap: '8px' });
        container.appendChild(resultsList);

        document.body.appendChild(container);

        // Animate entry
        requestAnimationFrame(() => {
            container.style.opacity = '1';
             // --- MODIFIED TRANSFORM for final animation state ---
            container.style.transform = 'translateX(calc(10% + 5vw)) translateY(0)';
        });

        // --- ADD ESCAPE LISTENER ---
        if (similarityPanelEscListener) {
            document.removeEventListener('keydown', similarityPanelEscListener);
            similarityPanelEscListener = null;
        }
        similarityPanelEscListener = function(event) {
            if (document.getElementById(PANEL_ID) && event.key === "Escape") {
                const panel = document.getElementById(PANEL_ID);
                const btn = panel?.querySelector('button[aria-label="Close Similarity Panel"]');
                if(btn) { btn.click(); } else { removeSimilarityPanel(); }
            }
        };
        document.addEventListener('keydown', similarityPanelEscListener);

        return { container, header, resultsList };

    } catch (error) {
        console.error("Error creating similarity panel shell:", error);
        removeSimilarityPanel(); // Attempt cleanup
        return null;
    }
}

// --- Result Rendering Logic (Global Scope - No changes needed here) ---
function renderResults(resultString, targetListElement, headerElement) {
    if (!targetListElement || !headerElement) {
        console.error("Render target elements not provided.");
        return;
    }
    targetListElement.innerHTML = '';
    let headerText = 'Semantic Similarity';
    let resultsFound = false;

    try {
        const lines = resultString.split('\n').filter(line => line.trim());

        if (lines.length > 0 && !lines[0].includes(':')) {
            headerText = lines[0].trim(); lines.shift();
        } else if (lines.length > 0 && lines[0].includes(':')) {
            headerText = 'Similar Files';
        } else {
            if (resultString.trim() === "No similar files found.") {
                headerText = 'Similarity Results'; targetListElement.innerHTML = '<div style="padding: 10px; color: var(--text-faint);">No similar files found.</div>';
            } else if (resultString.startsWith("Error:")) {
                headerText = 'Error'; targetListElement.innerHTML = `<div style="padding: 10px; color: var(--text-error);">${resultString.replace("Error:", "").trim()}</div>`;
            } else if (resultString.startsWith("No cached embedding")) {
                headerText = 'Similarity Status'; targetListElement.innerHTML = `<div style="padding: 10px; color: var(--text-faint);">${resultString}</div>`;
            } else {
                headerText = 'Similarity Results'; targetListElement.innerHTML = '<div style="padding: 10px; color: var(--text-faint);">No results to display.</div>';
            }
        }

        headerElement.textContent = headerText;
        const statusMarker = headerElement.querySelector('.status-marker');
        if (statusMarker) statusMarker.remove();

        lines.forEach(line => {
            if (line.includes(':')) {
                const parts = line.split(':'); const filename = parts[0].trim();
                const scoreStr = parts.slice(1).join(':').trim(); const scoreValue = parseFloat(scoreStr);
                if (isNaN(scoreValue)) return;
                resultsFound = true;

                const resultItem = document.createElement('div');
                Object.assign(resultItem.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', backgroundColor: 'var(--background-secondary)', borderRadius: '4px', cursor: 'pointer', transition: 'background-color 0.15s ease-in-out' });
                resultItem.addEventListener('mouseover', () => { resultItem.style.backgroundColor = 'var(--background-modifier-hover)'; });
                resultItem.addEventListener('mouseout', () => { resultItem.style.backgroundColor = 'var(--background-secondary)'; });

                const filenameSpan = document.createElement('span'); filenameSpan.textContent = filename;
                Object.assign(filenameSpan.style, { marginRight: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });

                const scoreContainer = document.createElement('div'); Object.assign(scoreContainer.style, { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: '0' });
                const scoreBar = document.createElement('div'); Object.assign(scoreBar.style, { width: '80px', height: '6px', backgroundColor: 'var(--background-modifier-border)', borderRadius: '3px', overflow: 'hidden' });
                const scoreIndicator = document.createElement('div'); Object.assign(scoreIndicator.style, { width: `${Math.max(0, Math.min(100, scoreValue * 100))}%`, height: '100%', backgroundColor: 'var(--interactive-accent)', borderRadius: '3px'});
                const scoreText = document.createElement('span'); scoreText.textContent = scoreValue.toFixed(3); Object.assign(scoreText.style, { fontSize: '0.85em', color: 'var(--text-muted)', minWidth: '35px', textAlign: 'right' });

                scoreBar.appendChild(scoreIndicator); scoreContainer.appendChild(scoreBar); scoreContainer.appendChild(scoreText);
                resultItem.appendChild(filenameSpan); resultItem.appendChild(scoreContainer);

                resultItem.addEventListener('click', () => {
                    try {
                        if (window.app?.workspace?.openLinkText) {
                            window.app.workspace.openLinkText(filename, '', false);
                            // *** PANEL REMAINS OPEN ***
                        } else { console.error("Obsidian app context missing."); alert(`Cannot open file: Obsidian context missing.\nFile: ${filename}`); }
                    } catch(linkError) { console.error(`Error opening link for ${filename}:`, linkError); alert(`Error opening link for ${filename}:\n${linkError.message}`); }
                });
                targetListElement.appendChild(resultItem);
            }
        });

        if (!resultsFound && targetListElement.innerHTML === '') {
            targetListElement.innerHTML = '<div style="padding: 10px; color: var(--text-faint);">No similar files found matching criteria.</div>';
        }
    } catch (renderError) {
        console.error("Error rendering similarity results:", renderError);
        targetListElement.innerHTML = `<div style="padding: 10px; color: var(--text-error);">Error displaying results: ${renderError.message}</div>`;
        headerElement.textContent = 'Display Error';
    }
}

 // --- Global Update Handlers (Attached to window directly - No changes needed here) ---
 window.updateSimilarityResults = (newResultString) => {
     const panel = document.getElementById(PANEL_ID); if (!panel) return;
     const listElement = panel.querySelector(`#${LIST_ID}`); const headerElement = panel.querySelector(`#${HEADER_ID}`);
     if (!listElement || !headerElement) { console.error("Could not find list/header in existing panel during update."); return; }
     renderResults(newResultString, listElement, headerElement);
     const statusMarker = document.createElement('span'); statusMarker.textContent = ' (Updated)'; statusMarker.className = 'status-marker';
     Object.assign(statusMarker.style, { fontSize: '0.8em', color: 'var(--text-faint)' });
     const existingMarker = headerElement.querySelector('.status-marker'); if(existingMarker) existingMarker.remove();
     headerElement.appendChild(statusMarker); setTimeout(() => { statusMarker.remove(); }, 2500);
 };

 window.handleSimilarityUpdateError = (errorMessage) => {
      const panel = document.getElementById(PANEL_ID); if (!panel) return;
      const listElement = panel.querySelector(`#${LIST_ID}`); const headerElement = panel.querySelector(`#${HEADER_ID}`);
       if (!listElement || !headerElement) return;
       const errorDiv = document.createElement('div'); errorDiv.textContent = `Update failed: ${errorMessage}`; errorDiv.className = 'update-error-message';
        Object.assign(errorDiv.style, { padding: '10px', color: 'var(--text-error)', fontWeight: 'bold', border: '1px solid var(--text-error)', borderRadius: '4px', margin: '5px 0' });
       const previousError = listElement.querySelector('.update-error-message'); if (previousError) previousError.remove();
       listElement.prepend(errorDiv); headerElement.textContent = 'Update Error';
 };

// --- Initial Execution (Global Scope) ---
try {
    removeSimilarityPanel(); // Clean slate

    let initialEmbeddingResult = window.embeddingResult;

    if (typeof initialEmbeddingResult === 'string' && initialEmbeddingResult.trim() !== '') {
        const panelElements = createPanelShell(); // Creates panel, adds ESC listener
        if (panelElements) {
            renderResults(initialEmbeddingResult, panelElements.resultsList, panelElements.header);
        } else { console.error("Failed to create panel shell."); }
    } else {
         console.warn("No valid initial embedding result found. Panel not shown.");
    }
} catch (scriptError) {
    console.error("Error during initial execution of similarity script:", scriptError);
    try { new Notice(`Similarity script error: ${scriptError.message}`, 5000); } catch (e) { alert(`Similarity script error: ${scriptError.message}`); }
    removeSimilarityPanel(); // Ensure cleanup
}
```

# Python

```python
# Filename: 🧭 See Connections For Current Note.md
import os
import json
import datetime
import time
import embedding_similarity
import obsidian
import fileUtils
import iohelper
import traceback # Import traceback for detailed errors

# --- Helper Functions (Mostly Unchanged, print lines commented) ---

def ensure_json_exists(json_path):
    """Create JSON file if it doesn't exist or is invalid"""
    if not os.path.exists(json_path):
        # print("embeddings.json not found. Creating.")
        with open(json_path, 'w', encoding="utf-8") as f:
            json.dump({}, f, indent=2)
        return True # Created

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            if not content:
                 raise json.JSONDecodeError("File is empty", "", 0)
            f.seek(0)
            json.load(f) # Try loading
    except (json.JSONDecodeError, FileNotFoundError):
         # print("embeddings.json was empty or invalid, re-initializing.")
         with open(json_path, 'w', encoding="utf-8") as f:
            json.dump({}, f, indent=2)
         return True # Re-initialized
    return False # Existed and was valid

def load_embeddings(json_path):
    """Loads embeddings, handling potential errors."""
    ensure_json_exists(json_path)
    try:
        with open(json_path, 'r', encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, dict):
                # print("Warning: embeddings.json content is not a dictionary. Re-initializing.")
                ensure_json_exists(json_path) # Re-initialize
                return {}
            return data
    except json.JSONDecodeError:
         iohelper.notice("Error reading embeddings.json. It might be corrupted. Re-initializing.")
         ensure_json_exists(json_path) # Re-initialize
         return {}
    except Exception as e:
         iohelper.notice(f"Unexpected error loading embeddings.json: {str(e)}")
         return {}

def format_results(similarities, limit=12, header="Most similar files:\n\n"):
    """Formats similarity list into a display string."""
    if not similarities:
        if "Calculating..." in header or "Error:" in header or "No cached" in header:
             return header
        return header + "No similar files found.\n"

    similarities.sort(key=lambda x: x[1], reverse=True)
    message = header
    display_count = min(limit, len(similarities))

    for path, score in similarities[:display_count]:
        filename = os.path.splitext(os.path.basename(path))[0]
        if isinstance(score, (int, float)):
             message += f"{filename}: {score:.3f}\n"
        else:
             message += f"{filename}: N/A\n"
    return message

def calculate_similarities(current_embedding, all_embeddings_data, exclude_path):
    """Calculates cosine similarities between current_embedding and others."""
    similarities = []
    if not current_embedding:
        return similarities

    for path, data in all_embeddings_data.items():
        if path == exclude_path: continue
        if not path.endswith('.md'): continue

        other_embedding = None
        if isinstance(data, dict) and "embedding" in data:
            other_embedding = data["embedding"]
        elif isinstance(data, list): # Backward compatibility
            other_embedding = data

        if other_embedding:
            try:
                score = embedding_similarity.cosine_similarity(current_embedding, other_embedding)
                similarities.append((path, score))
            except Exception as e:
                # Keep this error print as it indicates a specific calculation failure
                print(f"Error calculating similarity for {path}: {str(e)}")
                continue
        # else: print(f"Skipping {path}: Invalid/missing embedding data.") # Keep commented

    return similarities

# --- Core Logic Functions (Modified Interaction, print lines commented) ---

def get_initial_display_data(note_path, vault_path):
    """Gets initial results (cached or placeholder) for immediate display."""
    json_path = os.path.join(vault_path, "embeddings.json")
    json_data = load_embeddings(json_path)
    relative_path = os.path.relpath(note_path, vault_path)

    cached_embedding = None
    cached_data = json_data.get(relative_path)

    header = "Most similar files:\n\n"

    if isinstance(cached_data, dict) and "embedding" in cached_data:
        cached_embedding = cached_data["embedding"]
    elif isinstance(cached_data, list):
        cached_embedding = cached_data
        header = "Found old format embedding. Updating...\n\n"
    elif os.path.exists(note_path):
        header = "No cached embedding found. Calculating...\n\n"
    else:
         header = "Error: Current note file not found during cache check.\n"

    similarities = calculate_similarities(cached_embedding, json_data, relative_path)
    return format_results(similarities, header=header)


def check_update_and_notify_js(note_path, vault_path):
    """Checks for updates, updates JSON, and sends new results to JS *if* needed."""
    try:
        json_path = os.path.join(vault_path, "embeddings.json")
        json_data = load_embeddings(json_path)
        relative_path = os.path.relpath(note_path, vault_path)
        note_title = os.path.splitext(os.path.basename(note_path))[0]

        needs_update = False
        cached_timestamp_str = None
        cached_embedding = None
        update_reason = ""

        cached_data = json_data.get(relative_path)
        if isinstance(cached_data, dict) and "embedding" in cached_data:
            cached_timestamp_str = cached_data.get("last_updated")
            cached_embedding = cached_data.get("embedding")
        elif isinstance(cached_data, list):
            needs_update = True
            cached_embedding = cached_data
            update_reason = "old format detected"
        else:
            needs_update = True
            update_reason = "no cache entry found"

        if not needs_update and cached_timestamp_str:
            try:
                file_mtime_unix = os.path.getmtime(note_path)
                cached_dt = datetime.datetime.fromisoformat(cached_timestamp_str)
                cached_timestamp_unix = cached_dt.timestamp()
                if file_mtime_unix > cached_timestamp_unix + 1:
                    needs_update = True
                    update_reason = "file modified"
            except ValueError:
                needs_update = True
                update_reason = "invalid timestamp format"
            except FileNotFoundError:
                 # Keep this error pathway
                 print(f"Error: File {note_path} not found during update check.")
                 return # Cannot update if file is gone
            except Exception as e:
                 # Keep this error pathway
                 print(f"Error comparing timestamps for {relative_path}: {str(e)}. Assuming update needed.")
                 needs_update = True
                 update_reason = "timestamp check error"
        elif not needs_update and not cached_timestamp_str:
             needs_update = True
             update_reason = "missing timestamp"


        if needs_update:
            # print(f"Update triggered for {relative_path}. Reason: {update_reason}") # Commented out
            try:
                current_file_content = fileUtils.get_file_content(note_title+".md")
                if not current_file_content or not current_file_content.strip():
                    # print(f"Warning: {note_title} is empty. Skipping embedding update.") # Commented out
                    return

                new_embedding = embedding_similarity.get_embedding(current_file_content)
                if not new_embedding:
                     # print(f"Could not generate embedding for {note_title}. Skipping update.") # Commented out
                     return

                embeddings_changed = True
                if cached_embedding and new_embedding and cached_embedding == new_embedding:
                     embeddings_changed = False
                     # print(f"Embedding for {relative_path} recalculated but hasn't changed.") # Commented out

                update_timestamp = datetime.datetime.fromtimestamp(os.path.getmtime(note_path)).isoformat()
                json_data[relative_path] = {
                    "embedding": new_embedding,
                    "last_updated": update_timestamp
                }

                try:
                    with open(json_path, 'w', encoding="utf-8") as f:
                        json.dump(json_data, f, indent=2)
                    # print(f"Successfully updated embedding for {relative_path} in embeddings.json") # Commented out
                except Exception as e:
                    iohelper.notice(f"Error saving updated embeddings.json: {str(e)}") # Keep notice

                if embeddings_changed:
                     # print(f"Recalculating similarities for {relative_path} after update.") # Commented out
                     json_data_reloaded = load_embeddings(json_path)
                     new_similarities = calculate_similarities(new_embedding, json_data_reloaded, relative_path)
                     new_results_str = format_results(new_similarities, header="Updated similar files:\n\n")

                     escaped_update_results = new_results_str.replace('\\', '\\\\').replace('`', '\\`').replace('$', '\\$')
                     js_code = f"if (window.updateSimilarityResults) window.updateSimilarityResults(`{escaped_update_results}`); else console.warn('updateSimilarityResults function not found in JS');"
                     obsidian.runjs(js_code)
                     # print("Sent update notification to JS.") # Commented out
                # else: # Commented out block
                     # print("Embedding checked, no significant change detected.")

            except Exception as e:
                # Keep this detailed error reporting
                print(f"Error during embedding update process for {note_title}:")
                print(traceback.format_exc())
                iohelper.notice(f"Error during background update for {note_title}: {str(e)}")
                error_msg = f"Error during background update: {str(e)}"
                escaped_error = error_msg.replace('\\', '\\\\').replace('`', '\\`').replace('$', '\\$')
                js_code = f"if (window.handleSimilarityUpdateError) window.handleSimilarityUpdateError(`{escaped_error}`); else console.warn('handleSimilarityUpdateError not found');"
                obsidian.runjs(js_code)

        # else: # Commented out block
            # print(f"Embedding for {relative_path} is up-to-date. No background update needed.")

    except Exception as e:
        # Keep this detailed error reporting
        print(f"Major error in check_update_and_notify_js:")
        print(traceback.format_exc())
        iohelper.notice(f"Error checking/updating embedding: {str(e)}")


def maintenance(vault_path):
    """Removes entries for non-existent files from embeddings.json."""
    json_path = os.path.join(vault_path, "embeddings.json")
    json_data = load_embeddings(json_path)

    if not isinstance(json_data, dict):
         # print("Maintenance skipped: embeddings.json content is not a valid dictionary.") # Commented out
         return

    missing_files = []
    for path in list(json_data.keys()):
        full_path = os.path.join(vault_path, path)
        if not os.path.exists(full_path) or "nova_letter" in str(full_path):
            missing_files.append(path)

    removed_count = 0
    if missing_files:
        # print(f"Maintenance: Found {len(missing_files)} missing files referenced in embeddings.json.") # Commented out
        for path in missing_files:
            if path in json_data:
                 del json_data[path]
                 removed_count += 1

        if removed_count > 0:
            try:
                with open(json_path, 'w', encoding="utf-8") as f:
                    json.dump(json_data, f, indent=2)
                iohelper.notice(f"Maintenance: Removed {removed_count} missing file entries from embeddings.json") # Keep notice
            except Exception as e:
                 iohelper.notice(f"Maintenance Error: Could not save updated embeddings.json after removing missing files: {str(e)}") # Keep notice
        # else: print("Maintenance: No files needed removal after final check.") # Commented out
    # else: print("Maintenance: No missing file entries found.") # Commented out


# --- Main Execution (print lines commented) ---

if __name__ == "__main__":
# print("--- Starting See Connections Script ---") # Commented out
    final_result_for_js = "Error: Script did not complete." # Default error
    vault_path = obsidian.obs_vault
    note_path = os.environ.get('MD_FILE')

    if not vault_path:
        final_result_for_js = "Error: Obsidian vault path not found."
        iohelper.notice(final_result_for_js) # Keep notice
    elif not note_path:
        final_result_for_js = "Error: Current note path not found."
        iohelper.notice(final_result_for_js) # Keep notice
    elif not os.path.exists(note_path):
         final_result_for_js = f"Error: Current note file not found at {note_path}."
         iohelper.notice(final_result_for_js) # Keep notice
    else:
        try:
            # 1. Get initial results
            # print(f"Getting initial data for: {note_path}") # Commented out
            initial_results = get_initial_display_data(note_path, vault_path)
            final_result_for_js = initial_results

            # --- Trigger JS Display ---
            # print("Sending initial data to JS and triggering display...") # Commented out
            escaped_result = final_result_for_js.replace('\\', '\\\\').replace('`', '\\`').replace('$', '\\$')
            obsidian.runjs(f"window.embeddingResult = `{escaped_result}`;")
            obsidian.runjsf()
            # print("JS display triggered.") # Commented out

            # 2. Perform update check
            # print("Starting background check for embedding updates...") # Commented out
            check_update_and_notify_js(note_path, vault_path)
            # print("Background check finished.") # Commented out

            # 3. Run maintenance
            # print("Running maintenance...") # Commented out
            maintenance(vault_path)
            # print("Maintenance finished.") # Commented out

        except Exception as e:
            # Keep this detailed error reporting
            print("--- ERROR DURING SCRIPT EXECUTION ---")
            print(traceback.format_exc())
            error_message = f"Error during script execution:\n{str(e)}"
            iohelper.notice(f"See Connections script error: {str(e)}") # Keep notice
            escaped_error = error_message.replace('\\', '\\\\').replace('`', '\\`').replace('$', '\\$')
            js_code = f"if (window.handleSimilarityUpdateError) window.handleSimilarityUpdateError(`{escaped_error}`); else console.warn('handleSimilarityUpdateError not found');"
            obsidian.runjs(js_code)

# print("--- See Connections Script Finished ---") # Commented out
```
