---
nextFile: Notes/word embedding similarity experiemnts.md
---
#tool #NLP

# Words (separated by ';')

interesting;easy;hard

# Result

| Word | interesting | easy | hard |
|---|---|---|---|
| interesting | 1.0000 | 0.5086 | 0.4465 |
| easy | 0.5086 | 1.0000 | 0.4528 |
| hard | 0.4465 | 0.4528 | 1.0000 |

----

```python
# Filename: embedding_similarity.py

import requests
import numpy as np
from typing import List, Optional
import myapikeys # Your API key management
import iohelper  # For the main function example
import json      # For parsing detailed errors
import myendpoints

# --- Configuration ---
API_KEY = myapikeys.openai_supie # Or however you retrieve the key
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 256 # Match the dimension requested

if not API_KEY:
    raise ValueError("OpenAI API Key not found. Please check myapikeys.openai_supie.")

# --- Core Functions ---

def get_embedding(text: str) -> Optional[List[float]]:
    """
    Generates an embedding for a single piece of text using the OpenAI API.
    Returns None on error or for empty input.
    """
    text = text[:1024]
    if not text or not text.strip():
        print("Warning: Received empty text for get_embedding. Returning None.")
        return None

    # url = "https://openai.api.com/v1/embeddings"
    url = myendpoints.openai_aidb_v1 + "/embeddings"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    data = {
        "input": text,
        "model": EMBEDDING_MODEL,
        "dimensions": EMBEDDING_DIMENSIONS
    }

    try:
        response = requests.post(url, headers=headers, json=data, timeout=30)
        response.raise_for_status()
        result = response.json()

        if "data" in result and isinstance(result["data"], list) and len(result["data"]) > 0:
            if "embedding" in result["data"][0] and isinstance(result["data"][0]["embedding"], list):
                 return result["data"][0]["embedding"]
            else:
                 print(f"Error: Unexpected structure in embedding data (single): {result['data'][0]}")
                 return None
        else:
            print(f"Error: Unexpected API response structure (single): {result}")
            return None

    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error {e.response.status_code} during OpenAI API request (single): {e}")
        try:
            error_details = e.response.json()
            print("--- OpenAI Error Details ---")
            print(json.dumps(error_details, indent=2))
            print("--------------------------")
        except json.JSONDecodeError:
            print("--- OpenAI Response Body (non-JSON) ---")
            print(e.response.text)
            print("-------------------------------------")
        return None
    except requests.exceptions.RequestException as e:
        print(f"Network Error during OpenAI API request (single): {e}")
        return None

def get_embeddings_batch(texts: List[str]) -> Optional[List[Optional[List[float]]]]:
    """
    Generates embeddings for a list of texts using a single OpenAI API call.
    Skips empty or whitespace-only strings before calling the API.

    Args:
        texts: A list of strings to embed.

    Returns:
        A list where each element corresponds to the original input text.
        Contains the embedding vector (List[float]) on success, or None if:
          - The input text at that position was empty/whitespace.
          - The API failed to return an embedding for that specific text.
        Returns None if the entire API call fails critically (e.g., network error, auth error).
        Returns an empty list if the input list is empty.
    """
    if not texts:
        return []

    # --- Pre-computation Check: Filter out empty strings ---
    texts_to_send = []
    original_indices_map = {} # Map index in texts_to_send back to original index
    valid_input_count = 0
    for i, text in enumerate(texts):
        text = text[:1024]
        # Ensure it's a string and not empty/whitespace only
        if isinstance(text, str) and text and text.strip():
            texts_to_send.append(text)
            original_indices_map[valid_input_count] = i
            valid_input_count += 1
        # No else needed, we'll fill in None later for skipped ones

    if not texts_to_send:
         print("Warning: All texts in the batch were empty or whitespace. No API call made.")
         # Return a list of Nones matching the original input length
         return [None] * len(texts)

    # --- Make the API Call ---
    # url = "https://api.openai.com/v1/embeddings"
    url = myendpoints.openai_aidb_v1 + "/embeddings"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    data = {
        "input": texts_to_send, # Send only non-empty strings
        "model": EMBEDDING_MODEL,
        "dimensions": EMBEDDING_DIMENSIONS
    }

    try:
        # print(f"Calling API with {len(texts_to_send)} non-empty texts (out of {len(texts)} original).") # Debug
        response = requests.post(url, headers=headers, json=data, timeout=60)
        response.raise_for_status() # Check for HTTP errors

        result = response.json()

        # --- Process Response ---
        if "data" in result and isinstance(result["data"], list):
            # API returns embeddings only for the texts sent
            if len(result["data"]) != len(texts_to_send):
                 print(f"Error: API returned {len(result['data'])} embeddings, but {len(texts_to_send)} texts were sent. Mismatch.")
                 # This indicates a severe API issue, better to signal total failure
                 return None

            # Create the final result list, matching original input length
            final_embeddings = [None] * len(texts)
            api_results = result["data"]

            for api_idx, item in enumerate(api_results):
                original_idx = original_indices_map.get(api_idx)
                if original_idx is None:
                    # Should not happen if map is built correctly
                    print(f"Error: Internal mapping error for API result index {api_idx}.")
                    continue

                # Check structure of individual result
                if isinstance(item, dict) and item.get("index") == api_idx: # API index matches request index
                    if "embedding" in item and isinstance(item["embedding"], list):
                        final_embeddings[original_idx] = item["embedding"]
                    else:
                        print(f"Warning: Missing or invalid embedding in response for input index {original_idx} (API index {api_idx}).")
                        # final_embeddings[original_idx] is already None
                else:
                     print(f"Error: Response item index mismatch or invalid structure at API index {api_idx}: {item}")
                     # final_embeddings[original_idx] is already None

            return final_embeddings # Return list matching original input length
        else:
            print(f"Error: Unexpected API response structure (batch): {result}")
            return None # Total failure if structure is wrong

    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error {e.response.status_code} during OpenAI API request (batch): {e}")
        try:
            error_details = e.response.json()
            print("--- OpenAI Error Details ---")
            print(json.dumps(error_details, indent=2))
            print("--------------------------")
        except json.JSONDecodeError:
            print("--- OpenAI Response Body (non-JSON) ---")
            print(e.response.text)
            print("-------------------------------------")
        return None # Return None on HTTP errors
    except requests.exceptions.RequestException as e:
        print(f"Network Error during OpenAI API request (batch): {e}")
        return None # Return None on other request errors

def cosine_similarity(a: Optional[List[float]], b: Optional[List[float]]) -> float:
    """
    Calculates the cosine similarity between two embedding vectors.
    Handles None inputs gracefully.
    """
    if a is None or b is None:
        return 0.0
    if not isinstance(a, (list, np.ndarray)) or not isinstance(b, (list, np.ndarray)):
        print(f"Warning: Invalid type for cosine similarity: {type(a)}, {type(b)}")
        return 0.0
    # Ensure lists are converted to numpy arrays
    a_np = np.array(a)
    b_np = np.array(b)
    if a_np.shape != b_np.shape:
        print(f"Warning: Vectors have different shapes ({a_np.shape} vs {b_np.shape}). Cannot calculate similarity.")
        return 0.0

    norm_a = np.linalg.norm(a_np)
    norm_b = np.linalg.norm(b_np)
    if norm_a == 0 or norm_b == 0:
        return 0.0

    similarity = np.dot(a_np, b_np) / (norm_a * norm_b)
    # Clip similarity to handle potential floating point inaccuracies slightly outside [-1, 1]
    return float(np.clip(similarity, -1.0, 1.0))


# --- Example Usage / Utility Functions ---
# create_similarity_table and main function remain largely the same as before,
# but ensure they handle potential None values in the embeddings list gracefully.

def create_similarity_table(words: List[str], embeddings: List[Optional[List[float]]]) -> str:
    """
    Creates a markdown table showing pairwise cosine similarities.
    Handles None embeddings by omitting them from the table.
    """
    if not words: return "Input words list is empty."
    if embeddings is None: return "Embeddings list is None." # Check if the whole list failed
    if len(words) != len(embeddings): return f"Error: Mismatch between words ({len(words)}) and embeddings ({len(embeddings)})."

    valid_indices = [i for i, emb in enumerate(embeddings) if emb is not None]
    if not valid_indices: return "No valid embeddings found to create a table."

    valid_words = [words[i] for i in valid_indices]
    valid_embeddings = [embeddings[i] for i in valid_indices] # Filtered list, contains only List[float]

    num_valid = len(valid_words)
    table = "| Word | " + " | ".join(valid_words) + " |\n"
    table += "|" + "---|" * (num_valid + 1) + "\n"

    for i in range(num_valid):
        row = f"| {valid_words[i]} |"
        for j in range(num_valid):
            # Pass only valid embeddings to cosine_similarity
            similarity = cosine_similarity(valid_embeddings[i], valid_embeddings[j])
            row += f" {similarity:.4f} |"
        table += row + "\n"

    return table

def main():
    """ Example main using batch """
    # Assuming iohelper is available or mocked
    iohelper.clearh('Result')
    input_text = iohelper.inputh("Words (separated by ';')").strip()
    if not input_text: iohelper.printh("No input.", "Result"); return

    input_text = input_text.replace("；", ";")
    words = [word.strip() for word in input_text.split(";") if word.strip()]
    if not words: iohelper.printh("No valid words.", "Result"); return

    print(f"Requesting embeddings for: {words}")
    embeddings = get_embeddings_batch(words) # Returns List[Optional[List[float]]] or None

    if embeddings is None:
        iohelper.printh("Failed to get embeddings from API (critical error).", "Result")
        return

    print("Embeddings received (some might be None), creating table...")
    # Pass original words and potentially mixed None/vector list
    similarity_table = create_similarity_table(words, embeddings)
    iohelper.printh(similarity_table, "Result")
    print("Similarity table generated.")


if __name__ == "__main__":
    # Mock iohelper if needed for standalone run
    class MockIoHelper:
        def clearh(self, _): print("--- Result ---")
        def inputh(self, prompt): return input(prompt + ": ")
        def printh(self, text, _): print(text)
    if 'iohelper' not in globals():
         print("Mocking iohelper for standalone run.")
         iohelper = MockIoHelper()
    if not API_KEY:
         print("Error: API Key missing.")
    else:
         main()
```
