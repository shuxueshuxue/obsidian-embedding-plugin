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
  constructor(app, onAction) {
    this.container = null;
    this.escHandler = null;
    this.keyHandler = null;
    this.hotkeys = /* @__PURE__ */ new Map();
    this.app = app;
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
    if (this.container) {
      if (this.keyHandler) {
        this.container.removeEventListener("keydown", this.keyHandler);
        this.keyHandler = null;
      }
      this.container.remove();
      this.container = null;
    }
    if (this.escHandler) {
      document.removeEventListener("keydown", this.escHandler);
      this.escHandler = null;
    }
  }
  createPanelShell() {
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
        transform: "translateX(calc(-50% + 5vw)) translateY(-10px)"
      });
      const header = document.createElement("h3");
      header.id = HEADER_ID;
      Object.assign(header.style, {
        marginTop: "0",
        marginBottom: "15px",
        color: "var(--text-muted)",
        fontWeight: "600"
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
        lineHeight: "1"
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
        gap: "8px"
      });
      container.appendChild(resultsList);
      document.body.appendChild(container);
      requestAnimationFrame(() => {
        container.style.opacity = "1";
        container.style.transform = "translateX(calc(10% + 5vw)) translateY(0)";
        container.focus();
      });
      this.escHandler = (event) => {
        if (event.key === "Escape" && document.getElementById(PANEL_ID)) {
          this.close();
        }
      };
      document.addEventListener("keydown", this.escHandler);
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
      container.addEventListener("keydown", this.keyHandler);
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
        color: message.startsWith("Error") ? "var(--text-error)" : "var(--text-faint)"
      });
      list.appendChild(messageDiv);
      return;
    }
    if (!items.length) {
      const emptyDiv = document.createElement("div");
      emptyDiv.textContent = "No similar files found.";
      Object.assign(emptyDiv.style, {
        padding: "10px",
        color: "var(--text-faint)"
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
        transition: "background-color 0.15s ease-in-out"
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
        whiteSpace: "nowrap"
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
          textTransform: "uppercase"
        });
        resultItem.appendChild(keyBadge);
      }
      const scoreContainer = document.createElement("div");
      Object.assign(scoreContainer.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexShrink: "0"
      });
      const scoreBar = document.createElement("div");
      Object.assign(scoreBar.style, {
        width: "80px",
        height: "6px",
        backgroundColor: "var(--background-modifier-border)",
        borderRadius: "3px",
        overflow: "hidden"
      });
      const scoreIndicator = document.createElement("div");
      Object.assign(scoreIndicator.style, {
        width: `${Math.max(0, Math.min(100, item.score * 100))}%`,
        height: "100%",
        backgroundColor: "var(--interactive-accent)",
        borderRadius: "3px"
      });
      const scoreText = document.createElement("span");
      scoreText.textContent = item.score.toFixed(3);
      Object.assign(scoreText.style, {
        fontSize: "0.85em",
        color: "var(--text-muted)",
        minWidth: "35px",
        textAlign: "right"
      });
      scoreBar.appendChild(scoreIndicator);
      scoreContainer.appendChild(scoreBar);
      scoreContainer.appendChild(scoreText);
      resultItem.appendChild(filenameSpan);
      resultItem.appendChild(scoreContainer);
      resultItem.addEventListener("click", () => {
        this.app.workspace.openLinkText(item.path, "", false);
      });
      list.appendChild(resultItem);
    }
  }
};
var EmbeddingPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.startupUpdateStarted = false;
  }
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
      callback: () => this.showConnectionsForCurrentNote()
    });
    this.addCommand({
      id: "update-all-embeddings",
      name: "Update All Embeddings",
      callback: () => this.updateAllEmbeddings()
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
      console.log("[embedding] auto update on startup disabled");
      return;
    }
    const run = async (source) => {
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
      const initial = await this.getInitialDisplayData(file, cache);
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
    console.log("[embedding] updateAllEmbeddings start", options);
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
      console.log("[embedding] updateAllEmbeddings: no files need update");
      new import_obsidian.Notice("All notes are up to date.");
      return;
    }
    console.log("[embedding] updateAllEmbeddings: queued", updateTargets.length, "of", files.length);
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
  async getInitialDisplayData(file, cache) {
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
    } catch (error) {
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
    const response = await fetch(`${this.settings.apiBaseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.settings.apiKey}`
      },
      body: JSON.stringify({
        input: trimmed,
        model: this.settings.model,
        dimensions: this.settings.dimensions
      })
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Embedding request failed: ${response.status} ${body}`);
    }
    const result = await response.json();
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
    const response = await fetch(`${this.settings.apiBaseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.settings.apiKey}`
      },
      body: JSON.stringify({
        input: trimmed,
        model: this.settings.model,
        dimensions: this.settings.dimensions
      })
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Embedding batch failed: ${response.status} ${body}`);
    }
    const result = await response.json();
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
    new import_obsidian.Setting(containerEl).setName("API key").setDesc("OpenAI API key for embeddings.").addText(
      (text) => text.setPlaceholder("sk-...").setValue(this.plugin.settings.apiKey).onChange(async (value) => {
        this.plugin.settings.apiKey = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("API base URL").setDesc("Base URL for the embeddings API.").addText(
      (text) => text.setPlaceholder("https://api.openai.com/v1").setValue(this.plugin.settings.apiBaseUrl).onChange(async (value) => {
        this.plugin.settings.apiBaseUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Model").setDesc("Embedding model name.").addText(
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
