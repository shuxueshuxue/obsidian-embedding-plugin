#tool

<!-- shell -->

```python
# Filename: ⚙️ Update All Embeddings Batch.py
import os
import json
import datetime
import time
import embedding_similarity # Assumes this module is available and updated
import obsidian           # Assumes this module provides vault path etc.
import iohelper           # For Obsidian notices

# --- Configuration ---
IGNORE_PREFIXES = ('.', '@', 'nova_letter')
# Process files in chunks
PROCESS_BATCH_SIZE = 32 # Smaller batch size might be safer with API limits/errors
# Save progress every N batches. Set to 1 to save after every batch.
# Set to 0 or None to save only at the end (original behavior).
SAVE_EVERY_N_BATCHES = 5
# Name of the batch function in embedding_similarity module
EMBEDDING_BATCH_FUNCTION = 'get_embeddings_batch'

# --- Helper Functions ---

def ensure_json_exists(json_path):
    """Create JSON file if it doesn't exist or re-initialize if empty/invalid"""
    if not os.path.exists(json_path):
        with open(json_path, 'w', encoding="utf-8") as f:
            json.dump({}, f, indent=2)
        print(f"Created {json_path}")
        return True # Indicates created/re-initialized

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            if not content:
                 raise json.JSONDecodeError("File is empty", "", 0)
            f.seek(0)
            json.load(f)
        return False # Indicates exists and is valid
    except (json.JSONDecodeError, FileNotFoundError):
        print(f"Re-initializing empty or corrupted {json_path}")
        with open(json_path, 'w', encoding="utf-8") as f:
            json.dump({}, f, indent=2)
        return True

def should_ignore(name):
    """Check if a file or directory name should be ignored."""
    return name.startswith(IGNORE_PREFIXES)

def _read_file_content_safe(full_path):
    """Safely read file content, return None on error or if empty/whitespace."""
    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        # Return None if content is empty or only whitespace
        return content if content and content.strip() else None
    except FileNotFoundError:
        print(f"File not found during read: {os.path.basename(full_path)}")
        return None
    except Exception as e:
        print(f"Error reading file {os.path.basename(full_path)}: {e}")
        return None

def save_json_data(json_path, data, batch_num=None):
    """Saves the data to the JSON file with error handling."""
    try:
        with open(json_path, 'w', encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        if batch_num:
             print(f"Progress saved successfully after batch {batch_num}.")
        else:
             print("Final embeddings saved successfully.")
        return True
    except Exception as e:
        error_msg = f"CRITICAL ERROR: Failed to save embeddings to {json_path}: {e}"
        if batch_num:
             error_msg = f"CRITICAL ERROR: Failed to save progress after batch {batch_num} to {json_path}: {e}"
        iohelper.notice(error_msg)
        print(error_msg)
        return False

# --- Main Update Function ---

def update_all_embeddings_batch():
    vault_path = obsidian.obs_vault
    if not vault_path or not os.path.isdir(vault_path):
        iohelper.notice("Error: Obsidian vault path not found or invalid.")
        return

    json_path = os.path.join(vault_path, "embeddings.json")
    ensure_json_exists(json_path) # Ensure it exists before loading

    start_time = time.time()
    files_scanned_count = 0
    embeddings_added_count = 0
    embeddings_updated_count = 0
    files_skipped_up_to_date = 0
    files_read_error_count = 0
    embedding_error_count = 0 # Counts individual embedding failures (API or empty)
    batches_processed = 0

    # Load existing embeddings data
    json_data = {}
    try:
        # Ensure we read the file *after* ensure_json_exists potentially creates it
        with open(json_path, 'r', encoding="utf-8") as f:
             content = f.read().strip()
             if content: # Only try to load if not empty
                 f.seek(0)
                 json_data = json.load(f)
             else: # File was empty
                  json_data = {} # Start fresh
        if not isinstance(json_data, dict):
             print("JSON data is not a dictionary. Re-initializing.")
             json_data = {}
    except (json.JSONDecodeError, FileNotFoundError) as e:
        iohelper.notice(f"Error loading embeddings.json ({e}). Starting fresh.")
        json_data = {}

    # --- Step 1: Identify files needing updates ---
    update_tasks = [] # List of tuples: (relative_path, full_path, reason)
    print("Scanning vault for files needing embedding updates...")

    for root, dirs, files in os.walk(vault_path, topdown=True):
        dirs[:] = [d for d in dirs if not should_ignore(d)]

        for filename in files:
            files_scanned_count += 1
            if not filename.endswith(".md") or should_ignore(filename):
                continue

            full_path = os.path.join(root, filename)
            relative_path = os.path.relpath(full_path, vault_path)

            try:
                file_mtime_ts = os.path.getmtime(full_path)
                file_mtime_dt = datetime.datetime.fromtimestamp(file_mtime_ts)
            except FileNotFoundError:
                # File might have been deleted between os.walk and getmtime
                # print(f"Skipping deleted file: {relative_path}") # Can be noisy
                continue

            json_entry = json_data.get(relative_path)
            needs_embedding = False
            reason = ""

            if json_entry is None:
                needs_embedding = True; reason = "new file"
            elif isinstance(json_entry, list):
                needs_embedding = True; reason = "old format"
            elif isinstance(json_entry, dict):
                last_updated_str = json_entry.get("last_updated")
                embedding_data = json_entry.get("embedding")
                if not last_updated_str or not embedding_data:
                    needs_embedding = True; reason = "timestamp or embedding missing"
                else:
                    try:
                        stored_dt = datetime.datetime.fromisoformat(last_updated_str)
                        if file_mtime_dt > stored_dt:
                            needs_embedding = True; reason = f"file modified ({file_mtime_dt.strftime('%y-%m-%d %H:%M')})"
                    except ValueError:
                        needs_embedding = True; reason = "invalid stored timestamp"
            else:
                needs_embedding = True; reason = "unexpected JSON format"

            if needs_embedding:
                update_tasks.append((relative_path, full_path, reason))
            else:
                 files_skipped_up_to_date += 1

    if not update_tasks:
        iohelper.notice(f"All {files_scanned_count} scanned files seem up-to-date.")
        return

    print(f"Identified {len(update_tasks)} files for embedding update (out of {files_scanned_count} scanned).")

    # --- Step 2 & 3: Process in Batches (Reading & Embedding) ---
    something_changed_in_batch = False # Track if current batch needs saving
    total_batches = (len(update_tasks) + PROCESS_BATCH_SIZE - 1) // PROCESS_BATCH_SIZE
    batch_function = getattr(embedding_similarity, EMBEDDING_BATCH_FUNCTION, None)

    if not callable(batch_function):
         iohelper.notice(f"Error: Batch function '{EMBEDDING_BATCH_FUNCTION}' not found. Cannot proceed.")
         return

    for i in range(0, len(update_tasks), PROCESS_BATCH_SIZE):
        batch_start_time = time.time()
        current_batch_num = (i // PROCESS_BATCH_SIZE) + 1
        batch_tasks = update_tasks[i:min(i + PROCESS_BATCH_SIZE, len(update_tasks))]
        batches_processed += 1
        something_changed_in_batch = False # Reset for each batch

        print(f"\n--- Processing Batch {current_batch_num}/{total_batches} (size: {len(batch_tasks)}) ---")

        # Read content for the current batch
        batch_contents_data = [] # List of (relative_path, content, reason) for valid reads
        valid_tasks_map = {} # Map relative_path back to reason for updates

        for rel_path, full_path, reason in batch_tasks:
            content = _read_file_content_safe(full_path)
            if content is not None: # Content read successfully and is not empty/whitespace
                batch_contents_data.append((rel_path, content))
                valid_tasks_map[rel_path] = reason
            else:
                files_read_error_count += 1 # Count files skipped due to read errors/empty

        if not batch_contents_data:
            print("Skipping empty batch (all files failed reading or were empty).")
            continue

        # Prepare data for batch embedding
        texts_to_embed = [content for _, content in batch_contents_data]
        paths_in_batch = [rel_path for rel_path, _ in batch_contents_data]

        # Perform batch embedding
        print(f"  Calling {EMBEDDING_BATCH_FUNCTION} for {len(texts_to_embed)} texts...")
        # Function now returns List[Optional[List[float]]] or None
        batch_embeddings_result = batch_function(texts_to_embed)

        # Handle embedding results
        if batch_embeddings_result is None:
            print(f"Error: Failed to get embeddings for batch {current_batch_num} (API/Network error). Skipping batch.")
            embedding_error_count += len(texts_to_embed) # Count all as failed
            continue # Move to the next batch
        else:
            print(f"  ... batch embedding call complete ({time.time() - batch_start_time:.2f}s). Processing results...")

        # Result is a list matching texts_to_embed length, contains None for failures/skips
        if len(batch_embeddings_result) != len(texts_to_embed):
             print(f"Error: Internal inconsistency - embedding result length ({len(batch_embeddings_result)}) doesn't match request length ({len(texts_to_embed)}). Skipping batch.")
             embedding_error_count += len(texts_to_embed)
             continue

        # Update JSON data in memory
        current_timestamp = datetime.datetime.now().isoformat()
        for idx, rel_path in enumerate(paths_in_batch):
            embedding = batch_embeddings_result[idx] # This is Optional[List[float]]
            reason = valid_tasks_map[rel_path]

            if embedding: # Check if embedding is valid (not None)
                json_data[rel_path] = {
                    "embedding": embedding,
                    "last_updated": current_timestamp
                }
                something_changed_in_batch = True # Mark that we need to save
                if reason == "new file":
                    embeddings_added_count += 1
                else:
                    embeddings_updated_count += 1
            else:
                 # Embedding failed for this specific file (e.g., skipped empty by func, or API issue for one item)
                 print(f"  - Skipping update for {rel_path} (embedding failed or skipped).")
                 embedding_error_count += 1

        batch_duration = time.time() - batch_start_time
        print(f"  Batch {current_batch_num} processed in {batch_duration:.2f}s.")

        # --- PROGRESSIVE SAVE ---
        if something_changed_in_batch and SAVE_EVERY_N_BATCHES and (batches_processed % SAVE_EVERY_N_BATCHES == 0):
            print(f"\n--- Saving progress after batch {current_batch_num}... ---")
            if save_json_data(json_path, json_data, current_batch_num):
                 something_changed_in_batch = False # Reset flag after successful save
            else:
                 # If saving failed, keep the flag true to try again later? Or stop?
                 # For now, we continue, but the flag remains true.
                 iohelper.notice("ERROR: Failed to save progress. Will retry at end.")

    # --- Final Save (if needed) ---
    print("\n--- Batch processing finished ---")
    if something_changed_in_batch: # If changes happened in the last batches and weren't saved
        print("Saving final updates...")
        save_json_data(json_path, json_data) # Final save attempt
    elif SAVE_EVERY_N_BATCHES and embeddings_added_count + embeddings_updated_count > 0:
        # If we were saving progressively and made any changes overall
         print("No pending changes in the last batch(es). Final save not needed.")
    elif not SAVE_EVERY_N_BATCHES and embeddings_added_count + embeddings_updated_count > 0:
         # If progressive save was off, save everything now if changes were made
         print("Saving all updates...")
         save_json_data(json_path, json_data)


    # --- Final Summary ---
    end_time = time.time()
    duration = end_time - start_time

    summary_message = (
        f"Embedding Update Complete.\n"
        f"Duration: {duration:.2f}s\n"
        f"Files Scanned: {files_scanned_count}\n"
        f"Embeddings Added: {embeddings_added_count}\n"
        f"Embeddings Updated: {embeddings_updated_count}\n"
        f"Skipped (Up-to-date): {files_skipped_up_to_date}\n"
        f"Skipped (Read Err/Empty): {files_read_error_count}\n"
        f"Skipped (Embedding Err): {embedding_error_count}"
    )

    iohelper.notice(summary_message)
    print("\n" + summary_message)

# --- Execution ---
if __name__ == "__main__":
    update_all_embeddings_batch()
```
