import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl } from "obsidian";

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

interface EmbeddingPluginSettings {
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  dimensions: number;
  maxInputChars: number;
  similarityLimit: number;
  batchSize: number;
  autoUpdateOnStartup: boolean;
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

    this.scheduleStartupUpdate();
  }

  onunload() {
    this.panel?.close();
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
      .setDesc("Openai api key used to generate embeddings.")
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
