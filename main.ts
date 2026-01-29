import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl } from "obsidian";
// eslint-disable-next-line import/no-nodejs-modules
import * as http from "http";

const EMBEDDINGS_FILE = "embeddings.json";
const PANEL_ID = "embedding-similarity-panel";
const LIST_ID = `${PANEL_ID}-list`;
const HEADER_ID = `${PANEL_ID}-header`;
const PANEL_CLASS = "embedding-similarity-panel";
const PANEL_VISIBLE_CLASS = "is-visible";
const HEADER_CLASS = "embedding-similarity-header";
const STATUS_CLASS = "embedding-similarity-status";
const CLOSE_CLASS = "embedding-similarity-close";
const LIST_CLASS = "embedding-similarity-list";
const MESSAGE_CLASS = "embedding-similarity-message";
const EMPTY_CLASS = "embedding-similarity-empty";
const ITEM_CLASS = "embedding-similarity-item";
const ITEM_LEFT_CLASS = "embedding-similarity-item-left";
const HOTKEY_CLASS = "embedding-similarity-hotkey";
const TITLE_CLASS = "embedding-similarity-title";
const SCORE_CLASS = "embedding-similarity-score";
const SCORE_BAR_CLASS = "embedding-similarity-score-bar";
const SCORE_TEXT_CLASS = "embedding-similarity-score-text";

interface EmbeddingEntry {
  embedding: number[];
  last_updated: string;
}

type EmbeddingsCache = Record<string, EmbeddingEntry | number[]>;

type HotkeyAction =
  | { type: "open"; path: string }
  | { type: "refresh" };

type HttpServer = {
  listen: (port: number, host?: string) => void;
  close: () => void;
  on: (event: "error", handler: (error: Error) => void) => void;
};

type HttpRequest = {
  url?: string;
  method?: string;
  on: (event: string, handler: (arg?: unknown) => void) => void;
};

type HttpResponse = {
  writeHead: (status: number, headers?: Record<string, string>) => void;
  end: (body?: string) => void;
};

type McpRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

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
  mcpEnabled: false,
  mcpPort: 7345,
};

class SimilarityPanel {
  private app: App;
  private registerDomEvent: Plugin["registerDomEvent"];
  private container: HTMLDivElement | null = null;
  private escHandler: ((event: KeyboardEvent) => void) | null = null;
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;
  private hotkeys = new Map<string, HotkeyAction>();
  private onAction: (action: HotkeyAction) => void;

  constructor(
    app: App,
    registerDomEvent: Plugin["registerDomEvent"],
    onAction: (action: HotkeyAction) => void
  ) {
    this.app = app;
    this.registerDomEvent = registerDomEvent;
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
    if (this.escHandler) {
      document.removeEventListener("keydown", this.escHandler);
      this.escHandler = null;
    }
    if (this.container) {
      const container = this.container;
      container.removeClass(PANEL_VISIBLE_CLASS);
      window.setTimeout(() => {
        container.remove();
      }, 200);
      this.container = null;
    }
  }

  private createPanelShell(): HTMLDivElement | null {
    try {
      const container = document.body.createDiv({ cls: PANEL_CLASS });
      container.id = PANEL_ID;
      container.tabIndex = 0;
      container.setAttribute("role", "dialog");
      container.setAttribute("aria-label", "Similarity panel");
      container.setAttribute("aria-modal", "false");

      const header = container.createEl("h3", { cls: HEADER_CLASS });
      header.id = HEADER_ID;

      const closeButton = container.createEl("button", {
        cls: CLOSE_CLASS,
        text: "×",
        attr: { "aria-label": "Close similarity panel", type: "button" },
      });
      closeButton.addEventListener("click", () => {
        this.close();
      });

      const resultsList = container.createDiv({ cls: LIST_CLASS });
      resultsList.id = LIST_ID;

      requestAnimationFrame(() => {
        container.addClass(PANEL_VISIBLE_CLASS);
        this.focus();
      });

      // @@@panel-lifecycle - ensure only one ESC handler exists for the floating panel
      this.escHandler = (event: KeyboardEvent) => {
        if (event.key === "Escape" && this.container) {
          this.close();
        }
      };
      this.registerDomEvent(document, "keydown", this.escHandler);

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
      this.registerDomEvent(document, "keydown", this.keyHandler, { capture: true });

      return container;
    } catch {
      // console.error("Error creating similarity panel:", error);
      this.close();
      return null;
    }
  }

  private render(headerText: string, items: SimilarityItem[], message?: string, status?: string) {
    if (!this.container) {
      return;
    }
    const header = this.container.querySelector<HTMLElement>(`#${HEADER_ID}`);
    const list = this.container.querySelector<HTMLElement>(`#${LIST_ID}`);
    if (!header || !list) {
      return;
    }

    header.textContent = headerText;
    if (status) {
      const statusMarker = header.createSpan({ cls: STATUS_CLASS, text: status });
      statusMarker.setAttribute("aria-label", status);
    }

    list.empty();

    if (message) {
      const messageDiv = list.createDiv({ cls: MESSAGE_CLASS, text: message });
      if (message.startsWith("Error")) {
        messageDiv.addClass("is-error");
      }
      return;
    }

    if (!items.length) {
      list.createDiv({ cls: EMPTY_CLASS, text: "No similar files found." });
      return;
    }

    for (const item of items) {
      const resultItem = list.createEl("button", {
        cls: ITEM_CLASS,
        attr: { type: "button" },
      });

      const left = resultItem.createDiv({ cls: ITEM_LEFT_CLASS });

      if (item.hotkey) {
        left.createSpan({ cls: HOTKEY_CLASS, text: item.hotkey });
      }

      left.createSpan({ cls: TITLE_CLASS, text: item.displayName });

      const scoreContainer = resultItem.createDiv({ cls: SCORE_CLASS });
      const clampedScore = Math.max(0, Math.min(1, item.score));
      scoreContainer.createEl("progress", {
        cls: SCORE_BAR_CLASS,
        attr: { max: "1", value: clampedScore.toFixed(3) },
      });
      scoreContainer.createSpan({
        cls: SCORE_TEXT_CLASS,
        text: item.score.toFixed(3),
      });

      resultItem.addEventListener("click", () => {
        void this.app.workspace.openLinkText(item.path, "", false);
        window.setTimeout(() => this.focus(), 0);
      });

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
  private mcpServer: HttpServer | null = null;

  async onload() {
    await this.loadSettings();

    this.panel = new SimilarityPanel(this.app, this.registerDomEvent.bind(this), (action) => {
      if (action.type === "open") {
        void this.app.workspace.openLinkText(action.path, "", false);
        window.setTimeout(() => this.panel.focus(), 0);
        return;
      }
      if (action.type === "refresh") {
        void this.showConnectionsForCurrentNote();
      }
    });

    this.addCommand({
      id: "show-connections-current-note",
      name: "See connections for current note",
      callback: async () => {
        await this.showConnectionsForCurrentNote();
      },
    });

    this.addCommand({
      id: "update-all-vectors",
      name: "Update all note vectors",
      callback: async () => {
        await this.updateAllEmbeddings();
      },
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
      return;
    }

    const run = async (source: string) => {
      // @@@startup-guard - ensure only one auto update runs across layout/metadata events
      if (this.startupUpdateStarted) {
        return;
      }
      this.startupUpdateStarted = true;
      await this.updateAllEmbeddings();
    };

    this.registerEvent(
      this.app.metadataCache.on("resolved", () => {
        run("metadata-resolved").catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          // console.error("Auto update failed:", error);
          new Notice(`Auto update failed: ${message}`);
        });
      })
    );

    this.app.workspace.onLayoutReady(() => {
      run("layout-ready").catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        // console.error("Auto update failed:", error);
        new Notice(`Auto update failed: ${message}`);
      });
    });
  }

  private startMcpServer() {
    if (!this.settings.mcpEnabled) {
      return;
    }
    if (this.mcpServer) {
      return;
    }
    const httpModule = http as unknown as {
      createServer: (handler: (req: HttpRequest, res: HttpResponse) => void) => HttpServer;
    };
    const server = httpModule.createServer((req, res) => {
      void this.handleMcpRequest(req, res);
    });
    server.on("error", (error) => {
      new Notice(`MCP server error: ${error.message}`);
    });
    server.listen(this.settings.mcpPort, "127.0.0.1");
    this.mcpServer = server;
  }

  private stopMcpServer() {
    if (!this.mcpServer) {
      return;
    }
    this.mcpServer.close();
    this.mcpServer = null;
  }

  refreshMcpServer() {
    this.stopMcpServer();
    this.startMcpServer();
  }

  private async handleMcpRequest(req: HttpRequest, res: HttpResponse) {
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
    const payload = this.parseJson(body);
    if (!isMcpRequest(payload)) {
      this.sendMcpError(res, null, -32600, "Invalid request");
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
      const params = isRecord(payload.params) ? payload.params : {};
      const name = typeof params.name === "string" ? params.name : "";
      const args = isRecord(params.arguments) ? params.arguments : {};
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
        const message = error instanceof Error ? error.message : String(error);
        this.sendMcpError(res, requestId, -32603, message);
      }
      return;
    }

    this.sendMcpError(res, requestId, -32601, "Method not found");
  }

  private sendMcpResult(res: HttpResponse, id: string | number | null, result: unknown) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
  }

  private sendMcpError(res: HttpResponse, id: string | number | null, code: number, message: string) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }));
  }

  private parseJson(text: string): unknown {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }

  private readRequestBody(req: HttpRequest) {
    return new Promise<string>((resolve, reject) => {
      let body = "";
      const decoder = new TextDecoder("utf-8");
      req.on("data", (chunk) => {
        if (chunk instanceof Uint8Array) {
          body += decoder.decode(chunk, { stream: true });
        }
      });
      req.on("end", () => {
        body += decoder.decode();
        resolve(body);
      });
      req.on("error", (error) => {
        const err = error instanceof Error ? error : new Error(String(error));
        reject(err);
      });
    });
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
    const query = typeof args.query === "string" ? args.query.trim() : "";
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
    const { results, missingPaths } = await this.buildSearchResults(scores.slice(0, limit), cache);
    return { query, results, missingPaths };
  }

  private async semanticSearchNote(args: Record<string, unknown>) {
    const note = typeof args.note === "string" ? args.note.trim() : "";
    if (!note) {
      throw new Error("note is required");
    }
    const limit = this.normalizeLimit(args.limit);
    const file = this.resolveNoteFile(note);
    const cache = await this.loadEmbeddings();
    const embedding = await this.ensureEmbeddingForFile(file, cache);
    const scores = this.calculateSimilarityScores(embedding, cache, file.path);
    const { results, missingPaths } = await this.buildSearchResults(scores.slice(0, limit), cache);
    return { note: file.path, results, missingPaths };
  }

  private async fetchNoteContent(args: Record<string, unknown>) {
    const path = typeof args.path === "string" ? args.path.trim() : "";
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

  async showConnectionsForCurrentNote() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("No active note to analyze.");
      return;
    }

    try {
      const cache = await this.loadEmbeddings();
      const initial = this.getInitialDisplayData(file, cache);
      const initialHotkeys = this.buildHotkeys(file.path, initial.items);
      this.panel.open(initial.header, initial.items, initial.message, undefined, initialHotkeys);

      const updated = await this.checkUpdateAndNotify(file, cache);
      if (updated) {
        const updateHotkeys = this.buildHotkeys(file.path, updated.items);
        this.panel.update(updated.header, updated.items, updated.message, "(Updated)", updateHotkeys);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // console.error("Error showing connections:", error);
      new Notice(`Error showing connections: ${message}`);
      this.panel.open("Error", [], `Error: ${message}`);
    }
  }

  async updateAllEmbeddings(options: { onlyNew?: boolean } = {}) {
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
      new Notice("All notes are up to date.");
      return;
    }

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

  private async buildSearchResults(
    scores: { path: string; score: number }[],
    cache: EmbeddingsCache
  ) {
    const results: Array<{
      path: string;
      score: number;
      content: string;
      truncated: boolean;
    }> = [];
    const missingPaths: string[] = [];
    for (const item of scores) {
      const file = this.app.vault.getAbstractFileByPath(item.path);
      if (!(file instanceof TFile)) {
        missingPaths.push(item.path);
        continue;
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
    if (missingPaths.length) {
      for (const path of missingPaths) {
        delete cache[path];
      }
      await this.saveEmbeddings(cache);
    }
    return { results, missingPaths };
  }

  private normalizeLimit(limit: unknown) {
    const parsed =
      typeof limit === "number" ? limit : typeof limit === "string" ? Number(limit) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
    return this.settings.similarityLimit;
  }

  private getInitialDisplayData(file: TFile, cache: EmbeddingsCache) {
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
    } catch {
      throw new Error(`${EMBEDDINGS_FILE} contains invalid JSON.`);
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(`${EMBEDDINGS_FILE} must contain a JSON object.`);
    }

    const cache = data as EmbeddingsCache;
    await this.pruneMissingEmbeddings(cache);
    return cache;
  }

  private async saveEmbeddings(cache: EmbeddingsCache) {
    await this.app.vault.adapter.write(EMBEDDINGS_FILE, JSON.stringify(cache, null, 2));
  }

  private async pruneMissingEmbeddings(cache: EmbeddingsCache) {
    let removed = 0;
    for (const path of Object.keys(cache)) {
      if (!path.endsWith(".md")) {
        delete cache[path];
        removed += 1;
        continue;
      }
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        delete cache[path];
        removed += 1;
      }
    }
    if (removed > 0) {
      await this.saveEmbeddings(cache);
    }
  }

  private async getEmbedding(text: string): Promise<number[] | null> {
    this.ensureApiKey();
    const trimmed = text.slice(0, this.settings.maxInputChars);
    if (!trimmed) {
      return null;
    }

    const response = await requestUrl({
      url: `${this.settings.apiBaseUrl.replace(/\/$/, "")}/embeddings`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.settings.apiKey}`,
      },
      contentType: "application/json",
      body: JSON.stringify({
        input: trimmed,
        model: this.settings.model,
        dimensions: this.settings.dimensions,
      }),
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Embedding request failed: ${response.status} ${response.text}`);
    }

    const result: unknown = response.json;
    if (!isEmbeddingApiResponse(result) || result.data.length === 0) {
      throw new Error("Embedding response missing embedding data.");
    }

    return result.data[0].embedding;
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

    const response = await requestUrl({
      url: `${this.settings.apiBaseUrl.replace(/\/$/, "")}/embeddings`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.settings.apiKey}`,
      },
      contentType: "application/json",
      body: JSON.stringify({
        input: trimmed,
        model: this.settings.model,
        dimensions: this.settings.dimensions,
      }),
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Embedding batch failed: ${response.status} ${response.text}`);
    }

    const result: unknown = response.json;
    if (!isEmbeddingApiResponse(result)) {
      throw new Error("Embedding batch response missing data list.");
    }

    if (result.data.length !== trimmed.length) {
      throw new Error("Embedding batch response length mismatch.");
    }

    const output: Array<number[] | null> = texts.map(() => null);
    result.data.forEach((item, idx) => {
      const originalIndex = indexMap[idx];
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
    const loaded: unknown = await this.loadData();
    const safeLoaded =
      loaded && typeof loaded === "object" ? (loaded as Partial<EmbeddingPluginSettings>) : {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, safeLoaded);
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
      .addText((text) =>
        text
          .setPlaceholder("Enter API key")
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
          .setPlaceholder("Enter API base URL")
          .setValue(this.plugin.settings.apiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.apiBaseUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Embedding model name to use.")
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
      .setName("Mcp server enabled")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.mcpEnabled).onChange(async (value) => {
          this.plugin.settings.mcpEnabled = value;
          await this.plugin.saveSettings();
          this.plugin.refreshMcpServer();
        })
      );

    new Setting(containerEl)
      .setName("Mcp server port")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.mcpPort))
          .setValue(String(this.plugin.settings.mcpPort))
          .onChange(async (value) => {
            const nextPort = Number(value) || DEFAULT_SETTINGS.mcpPort;
            this.plugin.settings.mcpPort = nextPort;
            await this.plugin.saveSettings();
            this.plugin.refreshMcpServer();
          })
      );

  }
}

type EmbeddingApiItem = { embedding: number[] };
type EmbeddingApiResponse = { data: EmbeddingApiItem[] };

function isEmbeddingApiResponse(value: unknown): value is EmbeddingApiResponse {
  if (!value || typeof value !== "object") {
    return false;
  }
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    return false;
  }
  return data.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const embedding = (item as { embedding?: unknown }).embedding;
    return (
      Array.isArray(embedding) &&
      embedding.length > 0 &&
      embedding.every((value) => typeof value === "number")
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isMcpRequest(value: unknown): value is McpRequest {
  if (!isRecord(value)) {
    return false;
  }
  if (value.jsonrpc !== "2.0") {
    return false;
  }
  return typeof value.method === "string";
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
