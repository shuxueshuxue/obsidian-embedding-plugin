import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";

const http = require("http");

const EMBEDDINGS_FILE = "embeddings.json";
const PANEL_ID = "embedding-similarity-panel";
const LIST_ID = `${PANEL_ID}-list`;
const HEADER_ID = `${PANEL_ID}-header`;

interface EmbeddingEntry {
  embedding: number[];
  last_updated: string;
}

type EmbeddingsCache = Record<string, EmbeddingEntry | number[]>;

type HotkeyAction =
  | { type: "open"; path: string }
  | { type: "refresh" };

interface McpRequest {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface EmbeddingPluginSettings {
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  dimensions: number;
  maxInputChars: number;
  similarityLimit: number;
  batchSize: number;
  autoUpdateOnStartup: boolean;
  mcpEnabled: boolean;
  mcpPort: number;
}

const DEFAULT_SETTINGS: EmbeddingPluginSettings = {
  apiKey: "",
  apiBaseUrl: "https://api.openai.com/v1",
  model: "text-embedding-3-small",
  dimensions: 256,
  maxInputChars: 1024,
  similarityLimit: 12,
  batchSize: 32,
  autoUpdateOnStartup: false,
  mcpEnabled: true,
  mcpPort: 7345,
};

class SimilarityPanel {
  private app: App;
  private container: HTMLDivElement | null = null;
  private escHandler: ((event: KeyboardEvent) => void) | null = null;
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;
  private hotkeys = new Map<string, HotkeyAction>();
  private onAction: (action: HotkeyAction) => void;

  constructor(app: App, onAction: (action: HotkeyAction) => void) {
    this.app = app;
    this.onAction = onAction;
  }

  open(
    headerText: string,
    items: SimilarityItem[],
    message?: string,
    status?: string,
    hotkeys?: Map<string, HotkeyAction>
  ) {
    this.close();
    this.container = this.createPanelShell();
    if (!this.container) {
      return;
    }
    this.hotkeys = hotkeys ?? new Map<string, HotkeyAction>();
    this.render(headerText, items, message, status);
  }

  update(
    headerText: string,
    items: SimilarityItem[],
    message?: string,
    status?: string,
    hotkeys?: Map<string, HotkeyAction>
  ) {
    if (!this.container) {
      return;
    }
    this.hotkeys = hotkeys ?? this.hotkeys;
    this.render(headerText, items, message, status);
  }

  focus() {
    if (this.container) {
      this.container.focus();
    }
  }

  close() {
    if (this.keyHandler) {
      document.removeEventListener("keydown", this.keyHandler, { capture: true });
      this.keyHandler = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    if (this.escHandler) {
      document.removeEventListener("keydown", this.escHandler);
      this.escHandler = null;
    }
  }

  private createPanelShell(): HTMLDivElement | null {
    try {
      const container = document.createElement("div");
      container.id = PANEL_ID;
      container.tabIndex = 0;
      Object.assign(container.style, {
        position: "fixed",
        top: "5%",
        left: "50%",
        padding: "20px",
        backgroundColor: "var(--background-primary)",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        zIndex: "9999",
        maxHeight: "100vh",
        overflowY: "auto",
        color: "var(--text-normal)",
        maxWidth: "min(600px, 90vw)",
        fontFamily: "var(--font-interface, sans-serif)",
        fontSize: "var(--font-ui-normal, 15px)",
        transition: "opacity 0.3s ease-out, transform 0.3s ease-out",
        opacity: "0",
        transform: "translateX(calc(-50% + 5vw)) translateY(-10px)",
      });

      const header = document.createElement("h3");
      header.id = HEADER_ID;
      Object.assign(header.style, {
        marginTop: "0",
        marginBottom: "15px",
        color: "var(--text-muted)",
        fontWeight: "600",
      });
      container.appendChild(header);

      const closeButton = document.createElement("button");
      closeButton.textContent = "x";
      closeButton.setAttribute("aria-label", "Close Similarity Panel");
      Object.assign(closeButton.style, {
        position: "absolute",
        top: "10px",
        right: "10px",
        background: "none",
        border: "none",
        fontSize: "20px",
        color: "var(--text-muted)",
        cursor: "pointer",
        padding: "0 5px",
        lineHeight: "1",
      });
      closeButton.addEventListener("click", () => {
        if (!this.container) {
          return;
        }
        this.container.style.opacity = "0";
        this.container.style.transform = "translateX(calc(-50% + 5vw)) translateY(-10px)";
        window.setTimeout(() => this.close(), 300);
      });
      container.appendChild(closeButton);

      const resultsList = document.createElement("div");
      resultsList.id = LIST_ID;
      Object.assign(resultsList.style, {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      });
      container.appendChild(resultsList);

      document.body.appendChild(container);

      requestAnimationFrame(() => {
        container.style.opacity = "1";
        container.style.transform = "translateX(calc(10% + 5vw)) translateY(0)";
        container.focus();
      });

      // @@@panel-lifecycle - ensure only one ESC handler exists for the floating panel
      this.escHandler = (event: KeyboardEvent) => {
        if (event.key === "Escape" && document.getElementById(PANEL_ID)) {
          this.close();
        }
      };
      document.addEventListener("keydown", this.escHandler);

      // @@@hotkey-capture - capture key events at document level so focus leaks don't break navigation
      this.keyHandler = (event: KeyboardEvent) => {
        if (event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }
        const key = event.key.toLowerCase();
        if (key.length !== 1) {
          return;
        }
        const action = this.hotkeys.get(key);
        if (!action) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.onAction(action);
      };
      document.addEventListener("keydown", this.keyHandler, { capture: true });

      return container;
    } catch (error) {
      console.error("Error creating similarity panel:", error);
      this.close();
      return null;
    }
  }

  private render(headerText: string, items: SimilarityItem[], message?: string, status?: string) {
    if (!this.container) {
      return;
    }
    const header = this.container.querySelector(`#${HEADER_ID}`) as HTMLElement | null;
    const list = this.container.querySelector(`#${LIST_ID}`) as HTMLElement | null;
    if (!header || !list) {
      return;
    }

    header.textContent = headerText;
    if (status) {
      const statusMarker = document.createElement("span");
      statusMarker.textContent = ` ${status}`;
      statusMarker.style.fontSize = "0.8em";
      statusMarker.style.color = "var(--text-faint)";
      header.appendChild(statusMarker);
    }

    list.innerHTML = "";

    if (message) {
      const messageDiv = document.createElement("div");
      messageDiv.textContent = message;
      Object.assign(messageDiv.style, {
        padding: "10px",
        color: message.startsWith("Error") ? "var(--text-error)" : "var(--text-faint)",
      });
      list.appendChild(messageDiv);
      return;
    }

    if (!items.length) {
      const emptyDiv = document.createElement("div");
      emptyDiv.textContent = "No similar files found.";
      Object.assign(emptyDiv.style, {
        padding: "10px",
        color: "var(--text-faint)",
      });
      list.appendChild(emptyDiv);
      return;
    }

    for (const item of items) {
      const resultItem = document.createElement("div");
      Object.assign(resultItem.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 10px",
        backgroundColor: "var(--background-secondary)",
        borderRadius: "4px",
        cursor: "pointer",
        transition: "background-color 0.15s ease-in-out",
      });
      resultItem.addEventListener("mouseover", () => {
        resultItem.style.backgroundColor = "var(--background-modifier-hover)";
      });
      resultItem.addEventListener("mouseout", () => {
        resultItem.style.backgroundColor = "var(--background-secondary)";
      });

      const filenameSpan = document.createElement("span");
      filenameSpan.textContent = item.displayName;
      Object.assign(filenameSpan.style, {
        marginRight: "15px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });

      if (item.hotkey) {
        const keyBadge = document.createElement("span");
        keyBadge.textContent = item.hotkey;
        Object.assign(keyBadge.style, {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: "18px",
          height: "18px",
          marginRight: "8px",
          borderRadius: "4px",
          backgroundColor: "var(--background-modifier-border)",
          color: "var(--text-muted)",
          fontSize: "0.8em",
          textTransform: "uppercase",
        });
        resultItem.appendChild(keyBadge);
      }

      const scoreContainer = document.createElement("div");
      Object.assign(scoreContainer.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexShrink: "0",
      });

      const scoreBar = document.createElement("div");
      Object.assign(scoreBar.style, {
        width: "80px",
        height: "6px",
        backgroundColor: "var(--background-modifier-border)",
        borderRadius: "3px",
        overflow: "hidden",
      });

      const scoreIndicator = document.createElement("div");
      Object.assign(scoreIndicator.style, {
        width: `${Math.max(0, Math.min(100, item.score * 100))}%`,
        height: "100%",
        backgroundColor: "var(--interactive-accent)",
        borderRadius: "3px",
      });

      const scoreText = document.createElement("span");
      scoreText.textContent = item.score.toFixed(3);
      Object.assign(scoreText.style, {
        fontSize: "0.85em",
        color: "var(--text-muted)",
        minWidth: "35px",
        textAlign: "right",
      });

      scoreBar.appendChild(scoreIndicator);
      scoreContainer.appendChild(scoreBar);
      scoreContainer.appendChild(scoreText);
      resultItem.appendChild(filenameSpan);
      resultItem.appendChild(scoreContainer);

      resultItem.addEventListener("click", () => {
        this.app.workspace.openLinkText(item.path, "", false);
        window.setTimeout(() => this.focus(), 0);
      });

      list.appendChild(resultItem);
    }
  }
}

interface SimilarityItem {
  path: string;
  displayName: string;
  score: number;
  hotkey?: string;
}

export default class EmbeddingPlugin extends Plugin {
  settings!: EmbeddingPluginSettings;
  private panel!: SimilarityPanel;
  private startupUpdateStarted = false;
  private mcpServer: any | null = null;

  async onload() {
    console.log("[embedding] onload begin");
    await this.loadSettings();
    console.log("[embedding] settings loaded", this.settings);

    this.panel = new SimilarityPanel(this.app, (action) => {
      if (action.type === "open") {
        this.app.workspace.openLinkText(action.path, "", false);
        window.setTimeout(() => this.panel.focus(), 0);
        return;
      }
      if (action.type === "refresh") {
        this.showConnectionsForCurrentNote();
      }
    });

    this.addCommand({
      id: "show-connections-current-note",
      name: "See Connections For Current Note",
      callback: () => this.showConnectionsForCurrentNote(),
    });

    this.addCommand({
      id: "update-all-embeddings",
      name: "Update All Embeddings",
      callback: () => this.updateAllEmbeddings(),
    });

    this.addSettingTab(new EmbeddingSettingTab(this.app, this));

    this.startMcpServer();
    this.scheduleStartupUpdate();
  }

  onunload() {
    this.panel?.close();
    this.stopMcpServer();
  }

  private scheduleStartupUpdate() {
    if (!this.settings.autoUpdateOnStartup) {
      console.log("[embedding] auto update on startup disabled");
      return;
    }

    const run = async (source: string) => {
      // @@@startup-guard - ensure only one auto update runs across layout/metadata events
      if (this.startupUpdateStarted) {
        return;
      }
      this.startupUpdateStarted = true;
      console.log(`[embedding] auto update on startup triggered (${source})`);
      await this.updateAllEmbeddings();
    };

    this.registerEvent(
      this.app.metadataCache.on("resolved", () => {
        run("metadata-resolved").catch((error) => {
          console.error("Auto update failed:", error);
          new Notice(`Auto update failed: ${error.message}`);
        });
      })
    );

    this.app.workspace.onLayoutReady(() => {
      run("layout-ready").catch((error) => {
        console.error("Auto update failed:", error);
        new Notice(`Auto update failed: ${error.message}`);
      });
    });
  }

  private startMcpServer() {
    if (!this.settings.mcpEnabled) {
      console.log("[embedding] MCP server disabled");
      return;
    }
    if (this.mcpServer) {
      return;
    }

    // @@@mcp-server - host MCP-style JSON-RPC for semantic search tools
    this.mcpServer = http.createServer((req: any, res: any) => {
      this.handleMcpRequest(req, res).catch((error) => {
        console.error("[embedding] MCP request error:", error);
        this.sendMcpError(res, null, -32603, String(error.message ?? error));
      });
    });

    this.mcpServer.on("error", (error: Error) => {
      console.error("[embedding] MCP server error:", error);
      new Notice(`MCP server error: ${error.message}`);
    });

    this.mcpServer.listen(this.settings.mcpPort, "127.0.0.1", () => {
      console.log(`[embedding] MCP server listening on ${this.settings.mcpPort}`);
    });
  }

  private stopMcpServer() {
    if (this.mcpServer) {
      this.mcpServer.close();
      this.mcpServer = null;
    }
  }

  refreshMcpServer() {
    this.stopMcpServer();
    this.startMcpServer();
  }

  private async handleMcpRequest(req: any, res: any) {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    const body = await this.readRequestBody(req);
    let payload: McpRequest;
    try {
      payload = JSON.parse(body) as McpRequest;
    } catch (error) {
      this.sendMcpError(res, null, -32700, "Invalid JSON");
      return;
    }

    if (!payload || payload.jsonrpc !== "2.0" || !payload.method) {
      this.sendMcpError(res, payload?.id ?? null, -32600, "Invalid request");
      return;
    }

    const requestId = payload.id ?? null;

    if (payload.method === "initialize") {
      this.sendMcpResult(res, requestId, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "embedding-search", version: this.manifest.version },
      });
      return;
    }

    if (payload.method === "tools/list") {
      this.sendMcpResult(res, requestId, {
        tools: [
          {
            name: "semantic_search_text",
            description: "Semantic search for a freeform text query.",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string" },
                limit: { type: "number" },
              },
              required: ["query"],
            },
          },
          {
            name: "semantic_search_note",
            description: "Semantic search for notes related to a given note title or path.",
            inputSchema: {
              type: "object",
              properties: {
                note: { type: "string" },
                limit: { type: "number" },
              },
              required: ["note"],
            },
          },
          {
            name: "fetch_note",
            description: "Fetch the full content of a note by path.",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string" },
              },
              required: ["path"],
            },
          },
        ],
      });
      return;
    }

    if (payload.method === "tools/call") {
      const params = payload.params ?? {};
      const name = params.name as string | undefined;
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      if (!name) {
        this.sendMcpError(res, requestId, -32602, "Missing tool name");
        return;
      }

      try {
        const result = await this.handleToolCall(name, args);
        this.sendMcpResult(res, requestId, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: false,
        });
      } catch (error) {
        this.sendMcpError(res, requestId, -32603, String(error.message ?? error));
      }
      return;
    }

    this.sendMcpError(res, requestId, -32601, "Method not found");
  }

  private sendMcpResult(res: any, id: string | number | null, result: unknown) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
  }

  private sendMcpError(res: any, id: string | number | null, code: number, message: string) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }));
  }

  private readRequestBody(req: any) {
    return new Promise<string>((resolve, reject) => {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString("utf-8");
      });
      req.on("end", () => resolve(body));
      req.on("error", (error: Error) => reject(error));
    });
  }

  async showConnectionsForCurrentNote() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("No active note to analyze.");
      return;
    }

    try {
      const cache = await this.loadEmbeddings();
      const initial = await this.getInitialDisplayData(file, cache);
      const initialHotkeys = this.buildHotkeys(file.path, initial.items);
      this.panel.open(initial.header, initial.items, initial.message, undefined, initialHotkeys);

      const updated = await this.checkUpdateAndNotify(file, cache);
      if (updated) {
        const updateHotkeys = this.buildHotkeys(file.path, updated.items);
        this.panel.update(updated.header, updated.items, updated.message, "(Updated)", updateHotkeys);
      }
    } catch (error) {
      console.error("Error showing connections:", error);
      new Notice(`Error showing connections: ${error.message}`);
      this.panel.open("Error", [], `Error: ${error.message}`);
    }
  }

  async updateAllEmbeddings(options: { onlyNew?: boolean } = {}) {
    console.log("[embedding] updateAllEmbeddings start", options);
    const files = this.app.vault.getMarkdownFiles();
    const cache = await this.loadEmbeddings();
    const updateTargets: { file: TFile; reason: string }[] = [];

    for (const file of files) {
      if (this.shouldIgnorePath(file.path)) {
        continue;
      }
      const entry = cache[file.path];
      const reason = this.getUpdateReason(file, entry, options.onlyNew ?? false);
      if (reason) {
        updateTargets.push({ file, reason });
      }
    }

    if (!updateTargets.length) {
      console.log("[embedding] updateAllEmbeddings: no files need update");
      new Notice("All notes are up to date.");
      return;
    }

    console.log("[embedding] updateAllEmbeddings: queued", updateTargets.length, "of", files.length);
    let added = 0;
    let updated = 0;

    for (let i = 0; i < updateTargets.length; i += this.settings.batchSize) {
      const batch = updateTargets.slice(i, i + this.settings.batchSize);
      const batchFiles = batch.map((item) => item.file);
      const contents: string[] = [];
      const paths: string[] = [];

      for (const file of batchFiles) {
        const text = (await this.app.vault.read(file)).trim();
        if (!text) {
          continue;
        }
        contents.push(text);
        paths.push(file.path);
      }

      if (!contents.length) {
        continue;
      }

      const embeddings = await this.getEmbeddingsBatch(contents);
      if (embeddings.length !== contents.length) {
        throw new Error("Embedding batch length mismatch.");
      }

      for (let idx = 0; idx < paths.length; idx += 1) {
        const embedding = embeddings[idx];
        if (!embedding) {
          continue;
        }
        const path = paths[idx];
        const file = batchFiles.find((item) => item.path === path);
        if (!file) {
          continue;
        }
        const previous = cache[path];
        const isNew = !previous;
        cache[path] = {
          embedding,
          last_updated: new Date(file.stat.mtime).toISOString(),
        };
        if (isNew) {
          added += 1;
        } else {
          updated += 1;
        }
      }

      await this.saveEmbeddings(cache);
    }

    new Notice(`Embedding update complete. Added: ${added}. Updated: ${updated}.`);
  }

  private async handleToolCall(name: string, args: Record<string, unknown>) {
    if (name === "semantic_search_text") {
      return this.semanticSearchText(args);
    }
    if (name === "semantic_search_note") {
      return this.semanticSearchNote(args);
    }
    if (name === "fetch_note") {
      return this.fetchNoteContent(args);
    }
    throw new Error(`Unknown tool: ${name}`);
  }

  private async semanticSearchText(args: Record<string, unknown>) {
    const query = String(args.query ?? "").trim();
    if (!query) {
      throw new Error("query is required");
    }
    const limit = this.normalizeLimit(args.limit);
    const embedding = await this.getEmbedding(query);
    if (!embedding) {
      throw new Error("Failed to generate embedding for query");
    }
    const cache = await this.loadEmbeddings();
    const scores = this.calculateSimilarityScores(embedding, cache, null);
    const results = await this.buildSearchResults(scores.slice(0, limit));
    return { query, results };
  }

  private async semanticSearchNote(args: Record<string, unknown>) {
    const note = String(args.note ?? "").trim();
    if (!note) {
      throw new Error("note is required");
    }
    const limit = this.normalizeLimit(args.limit);
    const file = this.resolveNoteFile(note);
    const cache = await this.loadEmbeddings();
    const embedding = await this.ensureEmbeddingForFile(file, cache);
    const scores = this.calculateSimilarityScores(embedding, cache, file.path);
    const results = await this.buildSearchResults(scores.slice(0, limit));
    return { note: file.path, results };
  }

  private async fetchNoteContent(args: Record<string, unknown>) {
    const path = String(args.path ?? "").trim();
    if (!path) {
      throw new Error("path is required");
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`Note not found: ${path}`);
    }
    const content = await this.app.vault.read(file);
    return { path: file.path, content };
  }

  private async ensureEmbeddingForFile(file: TFile, cache: EmbeddingsCache) {
    const entry = cache[file.path];
    const reason = this.getUpdateReason(file, entry, false);
    if (!reason) {
      const cachedEmbedding = Array.isArray(entry) ? entry : entry?.embedding;
      if (!cachedEmbedding) {
        throw new Error(`Missing embedding for ${file.path}`);
      }
      return cachedEmbedding;
    }

    const text = (await this.app.vault.read(file)).trim();
    if (!text) {
      throw new Error(`Note is empty: ${file.path}`);
    }
    const embedding = await this.getEmbedding(text);
    if (!embedding) {
      throw new Error(`Failed to generate embedding for ${file.path}`);
    }
    cache[file.path] = {
      embedding,
      last_updated: new Date(file.stat.mtime).toISOString(),
    };
    await this.saveEmbeddings(cache);
    return embedding;
  }

  private resolveNoteFile(note: string) {
    const direct = this.app.metadataCache.getFirstLinkpathDest(note, "");
    if (direct) {
      return direct;
    }
    if (!note.endsWith(".md")) {
      const withMd = this.app.metadataCache.getFirstLinkpathDest(`${note}.md`, "");
      if (withMd) {
        return withMd;
      }
    }
    throw new Error(`Note not found: ${note}`);
  }

  private calculateSimilarityScores(
    currentEmbedding: number[],
    cache: EmbeddingsCache,
    excludePath: string | null
  ) {
    const results: { path: string; score: number }[] = [];

    for (const [path, entry] of Object.entries(cache)) {
      if (excludePath && path === excludePath) {
        continue;
      }
      if (!path.endsWith(".md")) {
        continue;
      }
      const otherEmbedding = Array.isArray(entry) ? entry : entry.embedding;
      if (!otherEmbedding) {
        continue;
      }
      const score = cosineSimilarity(currentEmbedding, otherEmbedding);
      results.push({ path, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  private async buildSearchResults(scores: { path: string; score: number }[]) {
    const results = [];
    for (const item of scores) {
      const file = this.app.vault.getAbstractFileByPath(item.path);
      if (!(file instanceof TFile)) {
        throw new Error(`Note not found: ${item.path}`);
      }
      const content = await this.app.vault.read(file);
      const isTruncated = content.length >= 3000;
      results.push({
        path: file.path,
        score: item.score,
        content: isTruncated ? content.slice(0, 1000) : content,
        truncated: isTruncated,
      });
    }
    return results;
  }

  private normalizeLimit(limit: unknown) {
    const parsed = Number(limit);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
    return this.settings.similarityLimit;
  }

  getCherryStudioConfig() {
    const url = `http://127.0.0.1:${this.settings.mcpPort}/mcp`;
    return JSON.stringify(
      {
        mcpServers: {
          "obsidian-embedding": {
            isActive: this.settings.mcpEnabled,
            name: "obsidian-embedding",
            type: "http",
            url,
          },
        },
      },
      null,
      2
    );
  }

  private async getInitialDisplayData(file: TFile, cache: EmbeddingsCache) {
    let header = "Most similar files:";
    let message: string | undefined;
    let embedding: number[] | null = null;

    const cached = cache[file.path];
    if (Array.isArray(cached)) {
      header = "Found old format embedding. Updating...";
      embedding = cached;
    } else if (cached && Array.isArray(cached.embedding)) {
      embedding = cached.embedding;
    } else {
      header = "No cached embedding found. Calculating...";
      message = "No cached embedding found. Calculating...";
    }

    const items = embedding ? this.calculateSimilarities(file.path, embedding, cache) : [];
    return { header, items, message };
  }

  private async checkUpdateAndNotify(file: TFile, cache: EmbeddingsCache) {
    const cached = cache[file.path];
    let needsUpdate = false;

    if (!cached) {
      needsUpdate = true;
    } else if (Array.isArray(cached)) {
      needsUpdate = true;
    } else {
      const lastUpdated = Date.parse(cached.last_updated);
      // @@@timestamp-compare - compare file mtime with stored ISO timestamp for cache invalidation
      if (!cached.last_updated || Number.isNaN(lastUpdated)) {
        needsUpdate = true;
      } else if (file.stat.mtime > lastUpdated + 1000) {
        needsUpdate = true;
      }
    }

    if (!needsUpdate) {
      return null;
    }

    const text = (await this.app.vault.read(file)).trim();
    if (!text) {
      new Notice("Current note is empty. Skipping embedding update.");
      return null;
    }

    const embedding = await this.getEmbedding(text);
    if (!embedding) {
      throw new Error("Failed to generate embedding.");
    }

    cache[file.path] = {
      embedding,
      last_updated: new Date(file.stat.mtime).toISOString(),
    };
    await this.saveEmbeddings(cache);

    const items = this.calculateSimilarities(file.path, embedding, cache);
    const header = "Updated similar files:";
    return { header, items, message: undefined };
  }

  private calculateSimilarities(currentPath: string, currentEmbedding: number[], cache: EmbeddingsCache) {
    const results: SimilarityItem[] = [];

    for (const [path, entry] of Object.entries(cache)) {
      if (path === currentPath) {
        continue;
      }
      if (!path.endsWith(".md")) {
        continue;
      }

      const otherEmbedding = Array.isArray(entry) ? entry : entry.embedding;
      if (!otherEmbedding) {
        continue;
      }

      const score = cosineSimilarity(currentEmbedding, otherEmbedding);
      results.push({
        path,
        displayName: this.displayNameForPath(path),
        score,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, this.settings.similarityLimit);
  }

  private buildHotkeys(originalPath: string, items: SimilarityItem[]) {
    const hotkeys = new Map<string, HotkeyAction>();
    const letters = "abcdefghijklmnopqrstuvwxyz";

    // @@@hotkey-map - reserve "a" for the original note and "z" for refresh
    hotkeys.set("a", { type: "open", path: originalPath });

    let letterIndex = 1;
    for (const item of items) {
      while (letterIndex < letters.length && letters[letterIndex] === "z") {
        letterIndex += 1;
      }
      if (letterIndex >= letters.length) {
        break;
      }
      const key = letters[letterIndex];
      item.hotkey = key;
      hotkeys.set(key, { type: "open", path: item.path });
      letterIndex += 1;
    }

    hotkeys.set("z", { type: "refresh" });

    return hotkeys;
  }

  private displayNameForPath(path: string) {
    const parts = path.split("/");
    const filename = parts[parts.length - 1] ?? path;
    if (filename.endsWith(".md")) {
      return filename.slice(0, -3);
    }
    return filename;
  }

  private shouldIgnorePath(path: string) {
    const parts = path.split("/");
    return parts.some((part) =>
      part.startsWith(".") || part.startsWith("@") || part.includes("nova_letter")
    );
  }

  private getUpdateReason(file: TFile, entry: EmbeddingEntry | number[] | undefined, onlyNew: boolean) {
    if (!entry) {
      return "new file";
    }
    if (onlyNew) {
      return "";
    }
    if (Array.isArray(entry)) {
      return "old format";
    }
    if (!entry.last_updated || !entry.embedding) {
      return "missing data";
    }
    const lastUpdated = Date.parse(entry.last_updated);
    if (Number.isNaN(lastUpdated)) {
      return "invalid timestamp";
    }
    if (file.stat.mtime > lastUpdated) {
      return "file modified";
    }
    return "";
  }

  private async loadEmbeddings(): Promise<EmbeddingsCache> {
    const adapter = this.app.vault.adapter;
    const exists = await adapter.exists(EMBEDDINGS_FILE);
    if (!exists) {
      await adapter.write(EMBEDDINGS_FILE, JSON.stringify({}, null, 2));
    }

    const raw = await adapter.read(EMBEDDINGS_FILE);
    if (!raw.trim()) {
      throw new Error(`${EMBEDDINGS_FILE} is empty.`);
    }

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      throw new Error(`${EMBEDDINGS_FILE} contains invalid JSON.`);
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(`${EMBEDDINGS_FILE} must contain a JSON object.`);
    }

    return data as EmbeddingsCache;
  }

  private async saveEmbeddings(cache: EmbeddingsCache) {
    await this.app.vault.adapter.write(EMBEDDINGS_FILE, JSON.stringify(cache, null, 2));
  }

  private async getEmbedding(text: string): Promise<number[] | null> {
    this.ensureApiKey();
    const trimmed = text.slice(0, this.settings.maxInputChars);
    if (!trimmed) {
      return null;
    }

    const response = await fetch(`${this.settings.apiBaseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.settings.apiKey}`,
      },
      body: JSON.stringify({
        input: trimmed,
        model: this.settings.model,
        dimensions: this.settings.dimensions,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Embedding request failed: ${response.status} ${body}`);
    }

    const result = await response.json();
    const embedding = result?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error("Embedding response missing embedding data.");
    }

    return embedding as number[];
  }

  private async getEmbeddingsBatch(texts: string[]): Promise<Array<number[] | null>> {
    this.ensureApiKey();
    if (!texts.length) {
      return [];
    }

    const trimmed: string[] = [];
    const indexMap: number[] = [];

    texts.forEach((text, index) => {
      const input = text.slice(0, this.settings.maxInputChars);
      if (input && input.trim()) {
        trimmed.push(input);
        indexMap.push(index);
      }
    });

    if (!trimmed.length) {
      return texts.map(() => null);
    }

    const response = await fetch(`${this.settings.apiBaseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.settings.apiKey}`,
      },
      body: JSON.stringify({
        input: trimmed,
        model: this.settings.model,
        dimensions: this.settings.dimensions,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Embedding batch failed: ${response.status} ${body}`);
    }

    const result = await response.json();
    if (!Array.isArray(result?.data)) {
      throw new Error("Embedding batch response missing data list.");
    }

    if (result.data.length !== trimmed.length) {
      throw new Error("Embedding batch response length mismatch.");
    }

    const output: Array<number[] | null> = texts.map(() => null);
    result.data.forEach((item: { embedding?: number[] }, idx: number) => {
      const originalIndex = indexMap[idx];
      if (!Array.isArray(item.embedding)) {
        return;
      }
      output[originalIndex] = item.embedding;
    });

    return output;
  }

  private ensureApiKey() {
    if (!this.settings.apiKey) {
      throw new Error("API key is missing. Add it in the plugin settings.");
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class EmbeddingSettingTab extends PluginSettingTab {
  private plugin: EmbeddingPlugin;

  constructor(app: App, plugin: EmbeddingPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("API key")
      .setDesc("OpenAI API key for embeddings.")
      .addText((text) =>
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API base URL")
      .setDesc("Base URL for the embeddings API.")
      .addText((text) =>
        text
          .setPlaceholder("https://api.openai.com/v1")
          .setValue(this.plugin.settings.apiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.apiBaseUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Embedding model name.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.model)
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Dimensions")
      .setDesc("Embedding dimension size.")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.dimensions))
          .setValue(String(this.plugin.settings.dimensions))
          .onChange(async (value) => {
            this.plugin.settings.dimensions = Number(value) || DEFAULT_SETTINGS.dimensions;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Max input chars")
      .setDesc("Maximum characters sent to the embedding API.")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.maxInputChars))
          .setValue(String(this.plugin.settings.maxInputChars))
          .onChange(async (value) => {
            this.plugin.settings.maxInputChars = Number(value) || DEFAULT_SETTINGS.maxInputChars;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Similarity limit")
      .setDesc("Number of similar notes to display.")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.similarityLimit))
          .setValue(String(this.plugin.settings.similarityLimit))
          .onChange(async (value) => {
            this.plugin.settings.similarityLimit = Number(value) || DEFAULT_SETTINGS.similarityLimit;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Batch size")
      .setDesc("Number of notes per embedding batch update.")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.batchSize))
          .setValue(String(this.plugin.settings.batchSize))
          .onChange(async (value) => {
            this.plugin.settings.batchSize = Number(value) || DEFAULT_SETTINGS.batchSize;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto update on startup")
      .setDesc("When enabled, new notes get embeddings when Obsidian starts.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoUpdateOnStartup).onChange(async (value) => {
          this.plugin.settings.autoUpdateOnStartup = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("MCP server enabled")
      .setDesc("Expose semantic search tools over MCP JSON-RPC.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.mcpEnabled).onChange(async (value) => {
          this.plugin.settings.mcpEnabled = value;
          await this.plugin.saveSettings();
          this.plugin.refreshMcpServer();
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("MCP server port")
      .setDesc("Local port for the MCP server.")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.mcpPort))
          .setValue(String(this.plugin.settings.mcpPort))
          .onChange(async (value) => {
            const nextPort = Number(value) || DEFAULT_SETTINGS.mcpPort;
            this.plugin.settings.mcpPort = nextPort;
            await this.plugin.saveSettings();
            this.plugin.refreshMcpServer();
            this.display();
          })
      );

    const cherryConfig = this.plugin.getCherryStudioConfig();
    new Setting(containerEl)
      .setName("Cherry Studio JSON")
      .setDesc("Copy/paste this into Cherry Studio MCP settings.")
      .addTextArea((text) => {
        text.setValue(cherryConfig);
        text.inputEl.readOnly = true;
        text.inputEl.rows = 8;
      })
      .addButton((button) => {
        button.setButtonText("Copy");
        button.onClick(async () => {
          try {
            await navigator.clipboard.writeText(cherryConfig);
            new Notice("Cherry Studio config copied.");
          } catch (error) {
            console.error("Failed to copy Cherry Studio config:", error);
            new Notice("Copy failed. See console.");
          }
        });
      });
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
