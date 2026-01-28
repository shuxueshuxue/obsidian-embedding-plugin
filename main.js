"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => EmbeddingPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var EMBEDDINGS_FILE = "embeddings.json";
var PANEL_ID = "embedding-similarity-panel";
var LIST_ID = `${PANEL_ID}-list`;
var HEADER_ID = `${PANEL_ID}-header`;
var PANEL_CLASS = "embedding-similarity-panel";
var PANEL_VISIBLE_CLASS = "is-visible";
var HEADER_CLASS = "embedding-similarity-header";
var STATUS_CLASS = "embedding-similarity-status";
var CLOSE_CLASS = "embedding-similarity-close";
var LIST_CLASS = "embedding-similarity-list";
var MESSAGE_CLASS = "embedding-similarity-message";
var EMPTY_CLASS = "embedding-similarity-empty";
var ITEM_CLASS = "embedding-similarity-item";
var ITEM_LEFT_CLASS = "embedding-similarity-item-left";
var HOTKEY_CLASS = "embedding-similarity-hotkey";
var TITLE_CLASS = "embedding-similarity-title";
var SCORE_CLASS = "embedding-similarity-score";
var SCORE_BAR_CLASS = "embedding-similarity-score-bar";
var SCORE_TEXT_CLASS = "embedding-similarity-score-text";
var DEFAULT_SETTINGS = {
  apiKey: "",
  apiBaseUrl: "https://api.openai.com/v1",
  model: "text-embedding-3-small",
  dimensions: 256,
  maxInputChars: 1024,
  similarityLimit: 12,
  batchSize: 32,
  autoUpdateOnStartup: false
};
var SimilarityPanel = class {
  constructor(app, registerDomEvent, onAction) {
    this.container = null;
    this.escHandler = null;
    this.keyHandler = null;
    this.hotkeys = /* @__PURE__ */ new Map();
    this.app = app;
    this.registerDomEvent = registerDomEvent;
    this.onAction = onAction;
  }
  open(headerText, items, message, status, hotkeys) {
    this.close();
    this.container = this.createPanelShell();
    if (!this.container) {
      return;
    }
    this.hotkeys = hotkeys != null ? hotkeys : /* @__PURE__ */ new Map();
    this.render(headerText, items, message, status);
  }
  update(headerText, items, message, status, hotkeys) {
    if (!this.container) {
      return;
    }
    this.hotkeys = hotkeys != null ? hotkeys : this.hotkeys;
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
  createPanelShell() {
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
        text: "\xD7",
        attr: { "aria-label": "Close similarity panel", type: "button" }
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
      this.escHandler = (event) => {
        if (event.key === "Escape" && this.container) {
          this.close();
        }
      };
      this.registerDomEvent(document, "keydown", this.escHandler);
      this.keyHandler = (event) => {
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
    } catch (error) {
      console.error("Error creating similarity panel:", error);
      this.close();
      return null;
    }
  }
  render(headerText, items, message, status) {
    if (!this.container) {
      return;
    }
    const header = this.container.querySelector(`#${HEADER_ID}`);
    const list = this.container.querySelector(`#${LIST_ID}`);
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
        attr: { type: "button" }
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
        attr: { max: "1", value: clampedScore.toFixed(3) }
      });
      scoreContainer.createSpan({
        cls: SCORE_TEXT_CLASS,
        text: item.score.toFixed(3)
      });
      resultItem.addEventListener("click", () => {
        void this.app.workspace.openLinkText(item.path, "", false);
        window.setTimeout(() => this.focus(), 0);
      });
    }
  }
};
var EmbeddingPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.startupUpdateStarted = false;
  }
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
      }
    });
    this.addCommand({
      id: "update-all-vectors",
      name: "Update all note vectors",
      callback: async () => {
        await this.updateAllEmbeddings();
      }
    });
    this.addSettingTab(new EmbeddingSettingTab(this.app, this));
    this.scheduleStartupUpdate();
  }
  onunload() {
    var _a;
    (_a = this.panel) == null ? void 0 : _a.close();
  }
  scheduleStartupUpdate() {
    if (!this.settings.autoUpdateOnStartup) {
      return;
    }
    const run = async (source) => {
      if (this.startupUpdateStarted) {
        return;
      }
      this.startupUpdateStarted = true;
      await this.updateAllEmbeddings();
    };
    this.registerEvent(
      this.app.metadataCache.on("resolved", () => {
        run("metadata-resolved").catch((error) => {
          console.error("Auto update failed:", error);
          new import_obsidian.Notice(`Auto update failed: ${error.message}`);
        });
      })
    );
    this.app.workspace.onLayoutReady(() => {
      run("layout-ready").catch((error) => {
        console.error("Auto update failed:", error);
        new import_obsidian.Notice(`Auto update failed: ${error.message}`);
      });
    });
  }
  async showConnectionsForCurrentNote() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new import_obsidian.Notice("No active note to analyze.");
      return;
    }
    try {
      const cache = await this.loadEmbeddings();
      const initial = this.getInitialDisplayData(file, cache);
      const initialHotkeys = this.buildHotkeys(file.path, initial.items);
      this.panel.open(initial.header, initial.items, initial.message, void 0, initialHotkeys);
      const updated = await this.checkUpdateAndNotify(file, cache);
      if (updated) {
        const updateHotkeys = this.buildHotkeys(file.path, updated.items);
        this.panel.update(updated.header, updated.items, updated.message, "(Updated)", updateHotkeys);
      }
    } catch (error) {
      console.error("Error showing connections:", error);
      new import_obsidian.Notice(`Error showing connections: ${error.message}`);
      this.panel.open("Error", [], `Error: ${error.message}`);
    }
  }
  async updateAllEmbeddings(options = {}) {
    var _a;
    const files = this.app.vault.getMarkdownFiles();
    const cache = await this.loadEmbeddings();
    const updateTargets = [];
    for (const file of files) {
      if (this.shouldIgnorePath(file.path)) {
        continue;
      }
      const entry = cache[file.path];
      const reason = this.getUpdateReason(file, entry, (_a = options.onlyNew) != null ? _a : false);
      if (reason) {
        updateTargets.push({ file, reason });
      }
    }
    if (!updateTargets.length) {
      new import_obsidian.Notice("All notes are up to date.");
      return;
    }
    let added = 0;
    let updated = 0;
    for (let i = 0; i < updateTargets.length; i += this.settings.batchSize) {
      const batch = updateTargets.slice(i, i + this.settings.batchSize);
      const batchFiles = batch.map((item) => item.file);
      const contents = [];
      const paths = [];
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
          last_updated: new Date(file.stat.mtime).toISOString()
        };
        if (isNew) {
          added += 1;
        } else {
          updated += 1;
        }
      }
      await this.saveEmbeddings(cache);
    }
    new import_obsidian.Notice(`Embedding update complete. Added: ${added}. Updated: ${updated}.`);
  }
  getInitialDisplayData(file, cache) {
    let header = "Most similar files:";
    let message;
    let embedding = null;
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
  async checkUpdateAndNotify(file, cache) {
    const cached = cache[file.path];
    let needsUpdate = false;
    if (!cached) {
      needsUpdate = true;
    } else if (Array.isArray(cached)) {
      needsUpdate = true;
    } else {
      const lastUpdated = Date.parse(cached.last_updated);
      if (!cached.last_updated || Number.isNaN(lastUpdated)) {
        needsUpdate = true;
      } else if (file.stat.mtime > lastUpdated + 1e3) {
        needsUpdate = true;
      }
    }
    if (!needsUpdate) {
      return null;
    }
    const text = (await this.app.vault.read(file)).trim();
    if (!text) {
      new import_obsidian.Notice("Current note is empty. Skipping embedding update.");
      return null;
    }
    const embedding = await this.getEmbedding(text);
    if (!embedding) {
      throw new Error("Failed to generate embedding.");
    }
    cache[file.path] = {
      embedding,
      last_updated: new Date(file.stat.mtime).toISOString()
    };
    await this.saveEmbeddings(cache);
    const items = this.calculateSimilarities(file.path, embedding, cache);
    const header = "Updated similar files:";
    return { header, items, message: void 0 };
  }
  calculateSimilarities(currentPath, currentEmbedding, cache) {
    const results = [];
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
        score
      });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, this.settings.similarityLimit);
  }
  buildHotkeys(originalPath, items) {
    const hotkeys = /* @__PURE__ */ new Map();
    const letters = "abcdefghijklmnopqrstuvwxyz";
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
  displayNameForPath(path) {
    var _a;
    const parts = path.split("/");
    const filename = (_a = parts[parts.length - 1]) != null ? _a : path;
    if (filename.endsWith(".md")) {
      return filename.slice(0, -3);
    }
    return filename;
  }
  shouldIgnorePath(path) {
    const parts = path.split("/");
    return parts.some(
      (part) => part.startsWith(".") || part.startsWith("@") || part.includes("nova_letter")
    );
  }
  getUpdateReason(file, entry, onlyNew) {
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
  async loadEmbeddings() {
    const adapter = this.app.vault.adapter;
    const exists = await adapter.exists(EMBEDDINGS_FILE);
    if (!exists) {
      await adapter.write(EMBEDDINGS_FILE, JSON.stringify({}, null, 2));
    }
    const raw = await adapter.read(EMBEDDINGS_FILE);
    if (!raw.trim()) {
      throw new Error(`${EMBEDDINGS_FILE} is empty.`);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      throw new Error(`${EMBEDDINGS_FILE} contains invalid JSON.`);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(`${EMBEDDINGS_FILE} must contain a JSON object.`);
    }
    return data;
  }
  async saveEmbeddings(cache) {
    await this.app.vault.adapter.write(EMBEDDINGS_FILE, JSON.stringify(cache, null, 2));
  }
  async getEmbedding(text) {
    var _a, _b;
    this.ensureApiKey();
    const trimmed = text.slice(0, this.settings.maxInputChars);
    if (!trimmed) {
      return null;
    }
    const response = await (0, import_obsidian.requestUrl)({
      url: `${this.settings.apiBaseUrl.replace(/\/$/, "")}/embeddings`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.settings.apiKey}`
      },
      contentType: "application/json",
      body: JSON.stringify({
        input: trimmed,
        model: this.settings.model,
        dimensions: this.settings.dimensions
      })
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Embedding request failed: ${response.status} ${response.text}`);
    }
    const result = response.json;
    const embedding = (_b = (_a = result == null ? void 0 : result.data) == null ? void 0 : _a[0]) == null ? void 0 : _b.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error("Embedding response missing embedding data.");
    }
    return embedding;
  }
  async getEmbeddingsBatch(texts) {
    this.ensureApiKey();
    if (!texts.length) {
      return [];
    }
    const trimmed = [];
    const indexMap = [];
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
    const response = await (0, import_obsidian.requestUrl)({
      url: `${this.settings.apiBaseUrl.replace(/\/$/, "")}/embeddings`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.settings.apiKey}`
      },
      contentType: "application/json",
      body: JSON.stringify({
        input: trimmed,
        model: this.settings.model,
        dimensions: this.settings.dimensions
      })
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Embedding batch failed: ${response.status} ${response.text}`);
    }
    const result = response.json;
    if (!Array.isArray(result == null ? void 0 : result.data)) {
      throw new Error("Embedding batch response missing data list.");
    }
    if (result.data.length !== trimmed.length) {
      throw new Error("Embedding batch response length mismatch.");
    }
    const output = texts.map(() => null);
    result.data.forEach((item, idx) => {
      const originalIndex = indexMap[idx];
      if (!Array.isArray(item.embedding)) {
        return;
      }
      output[originalIndex] = item.embedding;
    });
    return output;
  }
  ensureApiKey() {
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
};
var EmbeddingSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("API key").setDesc("OpenAI API key used to generate embeddings.").addText(
      (text) => text.setPlaceholder("Enter API key").setValue(this.plugin.settings.apiKey).onChange(async (value) => {
        this.plugin.settings.apiKey = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("API base URL").setDesc("Base URL for the embeddings API.").addText(
      (text) => text.setPlaceholder("Enter API base URL").setValue(this.plugin.settings.apiBaseUrl).onChange(async (value) => {
        this.plugin.settings.apiBaseUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Model").setDesc("Embedding model name to use.").addText(
      (text) => text.setPlaceholder(DEFAULT_SETTINGS.model).setValue(this.plugin.settings.model).onChange(async (value) => {
        this.plugin.settings.model = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Dimensions").setDesc("Embedding dimension size.").addText(
      (text) => text.setPlaceholder(String(DEFAULT_SETTINGS.dimensions)).setValue(String(this.plugin.settings.dimensions)).onChange(async (value) => {
        this.plugin.settings.dimensions = Number(value) || DEFAULT_SETTINGS.dimensions;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Max input chars").setDesc("Maximum characters sent to the embedding API.").addText(
      (text) => text.setPlaceholder(String(DEFAULT_SETTINGS.maxInputChars)).setValue(String(this.plugin.settings.maxInputChars)).onChange(async (value) => {
        this.plugin.settings.maxInputChars = Number(value) || DEFAULT_SETTINGS.maxInputChars;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Similarity limit").setDesc("Number of similar notes to display.").addText(
      (text) => text.setPlaceholder(String(DEFAULT_SETTINGS.similarityLimit)).setValue(String(this.plugin.settings.similarityLimit)).onChange(async (value) => {
        this.plugin.settings.similarityLimit = Number(value) || DEFAULT_SETTINGS.similarityLimit;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Batch size").setDesc("Number of notes per embedding batch update.").addText(
      (text) => text.setPlaceholder(String(DEFAULT_SETTINGS.batchSize)).setValue(String(this.plugin.settings.batchSize)).onChange(async (value) => {
        this.plugin.settings.batchSize = Number(value) || DEFAULT_SETTINGS.batchSize;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Auto update on startup").setDesc("When enabled, new notes get embeddings when Obsidian starts.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoUpdateOnStartup).onChange(async (value) => {
        this.plugin.settings.autoUpdateOnStartup = value;
        await this.plugin.saveSettings();
      })
    );
  }
};
function cosineSimilarity(a, b) {
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
