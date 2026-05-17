const DEFAULT_CONFIG = {
  targetUrl: "https://docs.google.com/videos/u/0/create?usp=vids_home",
  containerCount: 1,
  promptSplitMode: "line",
  openVeoFirst: true,
  reloadBeforeEachPrompt: true,
  useCoordinateFallback: true,
  autoDownload: false,
  attachIngredientFiles: false,
  selectors: {
    openVeo: [
      "#content-library-rail-video-generation-element",
      '[aria-label="Generate an AI video clip"]',
      '[data-tooltip="Generate an AI video clip"]',
      '[role="button"][aria-label*="AI video" i]',
    ],
    prompt: [
      'textarea[aria-label*="Describe your eight-second video" i]',
      'textarea[placeholder*="Describe your eight-second video" i]',
      'textarea[jsname="YPqjbf"]',
      "textarea#c1",
      ".promptTextAreaPromptTextInput textarea",
    ],
    avatar: [
      "button.videoGenCreationViewFileInputsCharacterSelectContainer",
      'button[data-idom-class*="CharacterSelectContainer"]',
      '[aria-describedby="tt-c16"]',
    ],
    ingredients: [
      'button[aria-label="Ingredients"]',
      "button.videoGenCreationViewImageSelectFillContainer",
      'button[data-idom-class*="ImageSelect"]',
      ".videoGenCreationViewImageSelectExpandingContainer button",
    ],
    ingredientFileInput: [
      '.videoGenCreationViewImageSelectExpandingContainer input[type="file"]',
      'input[type="file"][accept*="image"]',
    ],
    generate: [
      "button.videoGenCreationViewGenerateButton",
      'button[data-idom-class="videoGenCreationViewGenerateButton"]',
      'button[data-idom-class*="GenerateButton"]',
    ],
    videos: [
      ".appsDocsAiGenerativeaiVideoUiSidebarWizVideogenerationthumbnailsContainer video[src]",
      ".videoGenGenerationHistory video[src]",
      'video[src]:not(.appsDocsAiGenerativeaiVideoUiSidebarWizVideogenfooterInspirationGalleryVideo)',
      "video[src]",
    ],
  },
  coordinates: {
    openVeo: null,
    prompt: null,
    avatar: null,
    ingredients: null,
    generate: null,
  },
  timing: {
    iframeLoadTimeoutMs: 60000,
    elementTimeoutMs: 45000,
    generationTimeoutMs: 900000,
    pollIntervalMs: 1200,
    initialDelayMs: 1000,
    afterVeoClickMs: 1800,
    afterPromptInputMs: 650,
    afterAssetClickMs: 1000,
    afterGenerateClickMs: 1500,
  },
};

const STORAGE_KEY = "videoGenAuto.config.v1";

const elements = {
  targetUrl: document.querySelector("#targetUrl"),
  containerCount: document.querySelector("#containerCount"),
  promptSplitMode: document.querySelector("#promptSplitMode"),
  promptQueue: document.querySelector("#promptQueue"),
  openVeoFirst: document.querySelector("#openVeoFirst"),
  reloadBeforeEachPrompt: document.querySelector("#reloadBeforeEachPrompt"),
  useCoordinateFallback: document.querySelector("#useCoordinateFallback"),
  autoDownload: document.querySelector("#autoDownload"),
  attachIngredientFiles: document.querySelector("#attachIngredientFiles"),
  ingredientFiles: document.querySelector("#ingredientFiles"),
  buildContainersButton: document.querySelector("#buildContainersButton"),
  openTargetButton: document.querySelector("#openTargetButton"),
  refreshFramesButton: document.querySelector("#refreshFramesButton"),
  startQueueButton: document.querySelector("#startQueueButton"),
  stopQueueButton: document.querySelector("#stopQueueButton"),
  downloadAllButton: document.querySelector("#downloadAllButton"),
  exportConfigButton: document.querySelector("#exportConfigButton"),
  importConfigButton: document.querySelector("#importConfigButton"),
  restoreDefaultsButton: document.querySelector("#restoreDefaultsButton"),
  globalStatus: document.querySelector("#globalStatus"),
  queueStats: document.querySelector("#queueStats"),
  workspace: document.querySelector("#workspace"),
  template: document.querySelector("#workerCardTemplate"),
  selectorOpenVeo: document.querySelector("#selectorOpenVeo"),
  selectorPrompt: document.querySelector("#selectorPrompt"),
  selectorAvatar: document.querySelector("#selectorAvatar"),
  selectorIngredients: document.querySelector("#selectorIngredients"),
  selectorGenerate: document.querySelector("#selectorGenerate"),
  selectorVideos: document.querySelector("#selectorVideos"),
  timingJson: document.querySelector("#timingJson"),
  coordinateJson: document.querySelector("#coordinateJson"),
};

const selectorFieldMap = {
  openVeo: elements.selectorOpenVeo,
  prompt: elements.selectorPrompt,
  avatar: elements.selectorAvatar,
  ingredients: elements.selectorIngredients,
  generate: elements.selectorGenerate,
  videos: elements.selectorVideos,
};

const state = {
  config: clone(DEFAULT_CONFIG),
  workers: [],
  prompts: [],
  nextPromptIndex: 0,
  queueRunning: false,
  stopRequested: false,
  files: [],
};

class QueueStoppedError extends Error {
  constructor() {
    super("Queue stopped");
    this.name = "QueueStoppedError";
  }
}

class FrameWorker {
  constructor(index, card) {
    this.index = index;
    this.card = card;
    this.iframe = card.querySelector(".target-frame");
    this.canvas = card.querySelector(".frame-overlay");
    this.ctx = this.canvas.getContext("2d");
    this.statusEl = card.querySelector(".worker-status");
    this.logEl = card.querySelector(".worker-log");
    this.lastPointEl = card.querySelector(".last-point");
    this.downloadButton = card.querySelector(".download-video");
    this.lastPoint = null;
    this.resultUrl = "";
    this.resultName = "";
    this.hasLoadedOnce = false;
    this.resizeObserver = new ResizeObserver(() => this.syncCanvas());
    this.resizeObserver.observe(card.querySelector(".frame-stack"));
    this.bindEvents();
    this.syncCanvas();
  }

  bindEvents() {
    this.canvas.addEventListener("click", (event) => {
      if (!this.card.classList.contains("calibrating")) {
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      this.lastPoint = {
        x: round(event.clientX - rect.left),
        y: round(event.clientY - rect.top),
      };
      this.lastPointEl.textContent = `Last point: x=${this.lastPoint.x}, y=${this.lastPoint.y}`;
      this.log(`Captured coordinate ${JSON.stringify(this.lastPoint)}`);
      this.drawOverlay();
    });

    this.card.querySelector(".run-one").addEventListener("click", () => {
      runWorkerOnce(this).catch((error) => this.fail(error));
    });

    this.card.querySelector(".reload-frame").addEventListener("click", () => {
      this.load(state.config.targetUrl).catch((error) => this.fail(error));
    });

    this.card.querySelector(".open-frame-tab").addEventListener("click", () => {
      openExternal(state.config.targetUrl);
      this.log("Opened creator page in a new tab for Google sign-in/access.");
    });

    this.card.querySelector(".calibrate-toggle").addEventListener("click", () => {
      this.card.classList.toggle("calibrating");
      const enabled = this.card.classList.contains("calibrating");
      this.log(enabled ? "Calibration overlay enabled" : "Calibration overlay disabled");
      this.drawOverlay();
    });

    this.card.querySelectorAll(".map-point").forEach((button) => {
      button.addEventListener("click", () => {
        if (!this.lastPoint) {
          this.log("Click the canvas overlay first, then assign the point.");
          return;
        }
        const action = button.dataset.action;
        const config = readConfigFromUi();
        config.coordinates[action] = { ...this.lastPoint };
        state.config = config;
        writeConfigToUi(config);
        saveConfig();
        state.workers.forEach((worker) => worker.drawOverlay());
        this.log(`Mapped ${action} to ${JSON.stringify(this.lastPoint)}`);
      });
    });

    this.downloadButton.addEventListener("click", () => {
      if (this.resultUrl) {
        downloadUrl(this.resultUrl, this.resultName || `video-worker-${this.index + 1}.mp4`);
      }
    });
  }

  syncCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.drawOverlay();
  }

  drawOverlay() {
    const rect = this.canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    if (!this.card.classList.contains("calibrating")) {
      return;
    }

    this.ctx.fillStyle = "rgba(71, 182, 255, 0.08)";
    this.ctx.fillRect(0, 0, rect.width, rect.height);
    this.ctx.strokeStyle = "rgba(191, 230, 255, 0.22)";
    this.ctx.lineWidth = 1;

    for (let x = 0; x <= rect.width; x += 50) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, rect.height);
      this.ctx.stroke();
    }

    for (let y = 0; y <= rect.height; y += 50) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(rect.width, y);
      this.ctx.stroke();
    }

    const coordinates = readConfigFromUi({ quiet: true }).coordinates || {};
    Object.entries(coordinates).forEach(([label, point]) => {
      if (!point || typeof point.x !== "number" || typeof point.y !== "number") {
        return;
      }
      this.drawPin(point.x, point.y, label);
    });

    if (this.lastPoint) {
      this.drawPin(this.lastPoint.x, this.lastPoint.y, "last", "#ffd166");
    }
  }

  drawPin(x, y, label, color = "#47b6ff") {
    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = "rgba(2, 8, 14, 0.86)";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 7, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(x - 14, y);
    this.ctx.lineTo(x + 14, y);
    this.ctx.moveTo(x, y - 14);
    this.ctx.lineTo(x, y + 14);
    this.ctx.stroke();
    this.ctx.fillRect(x + 10, y - 15, Math.max(38, label.length * 7 + 12), 22);
    this.ctx.fillStyle = color;
    this.ctx.font = "700 12px sans-serif";
    this.ctx.fillText(label, x + 16, y);
    this.ctx.restore();
  }

  async load(url) {
    this.setStatus("Loading", "running");
    this.resultUrl = "";
    this.resultName = "";
    this.downloadButton.disabled = true;
    this.log(`Loading ${url}`);

    this.iframe.src = "about:blank";
    await sleep(100);

    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Iframe load timed out"));
      }, state.config.timing.iframeLoadTimeoutMs);

      const cleanup = () => {
        window.clearTimeout(timeout);
        this.iframe.removeEventListener("load", onLoad);
      };

      const onLoad = () => {
        cleanup();
        resolve();
      };

      this.iframe.addEventListener("load", onLoad);
      this.iframe.src = url;
    });

    this.hasLoadedOnce = true;
    this.setStatus("Loaded", "done");
    this.log("Frame load event received");
  }

  setStatus(text, tone = "") {
    this.statusEl.textContent = text;
    this.statusEl.className = `status-pill worker-status ${tone}`.trim();
  }

  log(message) {
    const stamp = new Date().toLocaleTimeString();
    this.logEl.textContent += `[${stamp}] ${message}\n`;
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  fail(error) {
    if (error instanceof QueueStoppedError) {
      this.setStatus("Stopped");
      this.log("Stopped by user");
      return;
    }
    this.setStatus("Error", "error");
    this.log(`ERROR: ${error.message || error}`);
    console.error(error);
  }

  markResult(url, prompt) {
    this.resultUrl = url;
    this.resultName = fileSafeName(prompt || `video-worker-${this.index + 1}`) + ".mp4";
    this.downloadButton.disabled = false;
    this.setStatus("Ready", "done");
    this.log(`Generated video candidate ready: ${url}`);
    updateDownloadAllState();
  }
}

class FrameAutomator {
  constructor(worker, config) {
    this.worker = worker;
    this.config = config;
  }

  get doc() {
    try {
      const doc = this.worker.iframe.contentDocument || this.worker.iframe.contentWindow.document;
      if (!doc || !doc.body) {
        throw new Error("Iframe document is not ready");
      }
      return doc;
    } catch (error) {
      throw new Error(
        "Cannot access iframe DOM. Confirm your same-origin/proxy/custom-browser setup permits iframe.contentDocument access.",
      );
    }
  }

  async waitForDocument() {
    return waitFor(() => this.doc, {
      timeoutMs: this.config.timing.elementTimeoutMs,
      intervalMs: this.config.timing.pollIntervalMs,
      shouldStop,
    });
  }

  findBySelectors(key, options = {}) {
    const selectors = this.config.selectors[key] || [];
    const doc = this.doc;

    for (const selector of selectors) {
      try {
        const nodes = Array.from(doc.querySelectorAll(selector));
        const match = nodes.find((node) => {
          if (options.onlyVisible && !isVisible(node)) {
            return false;
          }
          if (options.enabled && !isEnabled(node)) {
            return false;
          }
          return true;
        });
        if (match) {
          return match;
        }
      } catch (error) {
        this.worker.log(`Ignoring invalid selector for ${key}: ${selector}`);
      }
    }

    return null;
  }

  findButtonByText(text, options = {}) {
    const doc = this.doc;
    const candidates = Array.from(doc.querySelectorAll('button, [role="button"], [role="menuitemradio"], [role="option"]'));
    const normalizedText = normalizeText(text);
    return candidates.find((candidate) => {
      const candidateText = normalizeText(
        [
          candidate.getAttribute("aria-label"),
          candidate.getAttribute("data-tooltip"),
          candidate.textContent,
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (!candidateText.includes(normalizedText)) {
        return false;
      }
      if (options.onlyVisible && !isVisible(candidate)) {
        return false;
      }
      if (options.enabled && !isEnabled(candidate)) {
        return false;
      }
      return true;
    });
  }

  async waitForElement(key, options = {}) {
    const timeoutMs = options.timeoutMs || this.config.timing.elementTimeoutMs;
    return waitFor(() => {
      shouldStop();
      const selectorMatch = this.findBySelectors(key, options);
      if (selectorMatch) {
        return selectorMatch;
      }

      if (key === "openVeo") {
        return this.findButtonByText("Veo", options) || this.findButtonByText("Generate an AI video clip", options);
      }
      if (key === "avatar") {
        return this.findButtonByText("Avatar", options);
      }
      if (key === "ingredients") {
        return this.findButtonByText("Ingredients", options);
      }
      if (key === "generate") {
        return this.findButtonByText("Generate", options);
      }
      return null;
    }, {
      timeoutMs,
      intervalMs: this.config.timing.pollIntervalMs,
      shouldStop,
    });
  }

  async clickAction(key) {
    try {
      const element = await this.waitForElement(key, {
        onlyVisible: true,
        enabled: key === "generate",
      });
      dispatchClick(element);
      this.worker.log(`Clicked ${key} using DOM selector/text`);
      return;
    } catch (error) {
      if (!this.config.useCoordinateFallback) {
        throw error;
      }
      this.worker.log(`${key} selector failed, trying coordinate fallback`);
    }

    this.clickCoordinate(key);
  }

  clickCoordinate(key) {
    const point = this.config.coordinates[key];
    if (!point || typeof point.x !== "number" || typeof point.y !== "number") {
      throw new Error(`No coordinate configured for ${key}`);
    }
    const target = this.doc.elementFromPoint(point.x, point.y);
    if (!target) {
      throw new Error(`No iframe element found at ${key} coordinate ${point.x},${point.y}`);
    }
    dispatchClick(target, point);
    this.worker.log(`Clicked ${key} at iframe coordinate x=${point.x}, y=${point.y}`);
  }

  async fillPrompt(prompt) {
    let target = null;

    try {
      target = await this.waitForElement("prompt", { onlyVisible: true });
    } catch (error) {
      if (!this.config.useCoordinateFallback) {
        throw error;
      }
      this.worker.log("Prompt selector failed, trying coordinate fallback");
      this.clickCoordinate("prompt");
      await sleep(150);
      target = this.doc.activeElement;
    }

    if (!target || !("value" in target)) {
      throw new Error("Prompt target is not an input or textarea");
    }

    target.focus();
    setNativeValue(target, "");
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward", data: null }));
    setNativeValue(target, prompt);
    target.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: prompt }));
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    target.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " ", code: "Space" }));
    this.worker.log(`Injected prompt (${prompt.length} chars)`);
  }

  async attachIngredients(files) {
    const fileList = Array.from(files || []).slice(0, 3);
    if (!fileList.length) {
      await this.clickAction("ingredients");
      await sleep(this.config.timing.afterAssetClickMs);
      return;
    }

    const fileInput = this.findBySelectors("ingredientFileInput", { onlyVisible: false });
    if (fileInput && "files" in fileInput && typeof DataTransfer !== "undefined") {
      const transfer = new DataTransfer();
      fileList.forEach((file) => transfer.items.add(file));
      fileInput.files = transfer.files;
      fileInput.dispatchEvent(new Event("input", { bubbles: true }));
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      this.worker.log(`Attached ${fileList.length} ingredient image(s) through file input`);
      await sleep(this.config.timing.afterAssetClickMs);
      return;
    }

    this.worker.log("Could not set iframe file input directly; clicking Ingredients instead");
    await this.clickAction("ingredients");
    await sleep(this.config.timing.afterAssetClickMs);
  }

  collectVideoCandidates(beforeSources = new Set()) {
    const videos = [];
    for (const selector of this.config.selectors.videos || []) {
      try {
        videos.push(...Array.from(this.doc.querySelectorAll(selector)));
      } catch (error) {
        this.worker.log(`Ignoring invalid video selector: ${selector}`);
      }
    }

    return uniqueBy(videos, (video) => video.currentSrc || video.src)
      .filter((video) => isGeneratedVideoCandidate(video))
      .map((video) => video.currentSrc || video.src)
      .filter((src) => src && !beforeSources.has(src));
  }

  async waitForGeneratedVideo(beforeSources) {
    const result = await waitFor(() => {
      shouldStop();
      const [first] = this.collectVideoCandidates(beforeSources);
      return first || null;
    }, {
      timeoutMs: this.config.timing.generationTimeoutMs,
      intervalMs: this.config.timing.pollIntervalMs,
      shouldStop,
    });

    return result;
  }
}

function init() {
  state.config = loadConfig();
  writeConfigToUi(state.config);
  bindStaticEvents();
  buildContainers();
  refreshPrompts();
  setGlobalStatus("Idle");
}

function bindStaticEvents() {
  [
    elements.targetUrl,
    elements.containerCount,
    elements.promptSplitMode,
    elements.openVeoFirst,
    elements.reloadBeforeEachPrompt,
    elements.useCoordinateFallback,
    elements.autoDownload,
    elements.attachIngredientFiles,
    ...Object.values(selectorFieldMap),
    elements.timingJson,
    elements.coordinateJson,
  ].forEach((element) => {
    element.addEventListener("change", syncConfigFromUi);
    element.addEventListener("input", syncConfigFromUi);
  });

  elements.promptQueue.addEventListener("input", refreshPrompts);
  elements.ingredientFiles.addEventListener("change", () => {
    state.files = Array.from(elements.ingredientFiles.files || []);
  });

  elements.buildContainersButton.addEventListener("click", () => {
    syncConfigFromUi();
    buildContainers();
  });

  elements.openTargetButton.addEventListener("click", () => {
    syncConfigFromUi();
    openExternal(state.config.targetUrl);
    setGlobalStatus("Opened sign-in tab", "running");
  });

  elements.refreshFramesButton.addEventListener("click", () => {
    syncConfigFromUi();
    state.workers.forEach((worker) => {
      worker.load(state.config.targetUrl).catch((error) => worker.fail(error));
    });
    setGlobalStatus("Refreshing", "running");
  });

  elements.startQueueButton.addEventListener("click", () => {
    startQueue().catch((error) => {
      if (error instanceof QueueStoppedError) {
        setGlobalStatus("Stopped");
        return;
      }
      setGlobalStatus("Error", "error");
      console.error(error);
    });
  });

  elements.stopQueueButton.addEventListener("click", () => {
    state.stopRequested = true;
    setGlobalStatus("Stopping", "running");
  });

  elements.downloadAllButton.addEventListener("click", () => {
    state.workers
      .filter((worker) => worker.resultUrl)
      .forEach((worker) => downloadUrl(worker.resultUrl, worker.resultName || `video-worker-${worker.index + 1}.mp4`));
  });

  elements.restoreDefaultsButton.addEventListener("click", () => {
    state.config = clone(DEFAULT_CONFIG);
    writeConfigToUi(state.config);
    saveConfig();
    state.workers.forEach((worker) => worker.drawOverlay());
  });

  elements.exportConfigButton.addEventListener("click", exportConfig);
  elements.importConfigButton.addEventListener("click", importConfig);
}

function syncConfigFromUi() {
  state.config = readConfigFromUi();
  saveConfig();
  state.workers.forEach((worker) => worker.drawOverlay());
}

function buildContainers() {
  elements.workspace.textContent = "";
  state.workers.forEach((worker) => worker.resizeObserver.disconnect());
  state.workers = [];
  updateDownloadAllState();

  const count = clamp(Number(elements.containerCount.value) || DEFAULT_CONFIG.containerCount, 1, 8);
  for (let index = 0; index < count; index += 1) {
    const fragment = elements.template.content.cloneNode(true);
    const card = fragment.querySelector(".worker-card");
    card.querySelector(".worker-number").textContent = `Worker ${index + 1}`;
    card.querySelector(".worker-title").textContent = `Container ${index + 1}`;
    elements.workspace.appendChild(fragment);
    const worker = new FrameWorker(index, elements.workspace.lastElementChild);
    state.workers.push(worker);
    worker.load(state.config.targetUrl).catch((error) => worker.fail(error));
  }
}

function refreshPrompts() {
  state.prompts = parsePrompts(elements.promptQueue.value, elements.promptSplitMode.value);
  state.nextPromptIndex = 0;
  updateQueueStats();
}

async function startQueue() {
  syncConfigFromUi();
  refreshPrompts();
  state.stopRequested = false;

  if (!state.prompts.length) {
    setGlobalStatus("No prompts", "error");
    return;
  }

  if (!state.workers.length) {
    buildContainers();
  }

  state.queueRunning = true;
  setGlobalStatus("Running", "running");
  elements.startQueueButton.disabled = true;

  try {
    await Promise.all(state.workers.map((worker) => workerLoop(worker)));
    setGlobalStatus(state.stopRequested ? "Stopped" : "Complete", state.stopRequested ? "" : "done");
  } finally {
    state.queueRunning = false;
    elements.startQueueButton.disabled = false;
    updateQueueStats();
  }
}

async function workerLoop(worker) {
  while (!state.stopRequested) {
    const prompt = getNextPrompt();
    if (!prompt) {
      worker.setStatus("Idle");
      return;
    }
    await runPromptOnWorker(worker, prompt);
  }
}

async function runWorkerOnce(worker) {
  syncConfigFromUi();
  if (!state.prompts.length || state.nextPromptIndex >= state.prompts.length) {
    refreshPrompts();
  }
  const prompt = getNextPrompt();
  if (!prompt) {
    worker.log("No queued prompt available.");
    return;
  }
  await runPromptOnWorker(worker, prompt);
}

function getNextPrompt() {
  if (state.nextPromptIndex >= state.prompts.length) {
    updateQueueStats();
    return "";
  }
  const prompt = state.prompts[state.nextPromptIndex];
  state.nextPromptIndex += 1;
  updateQueueStats();
  return prompt;
}

async function runPromptOnWorker(worker, prompt) {
  shouldStop();
  const config = readConfigFromUi();
  state.config = config;
  const automator = new FrameAutomator(worker, config);
  worker.setStatus("Running", "running");
  worker.log(`Starting prompt: ${prompt.slice(0, 120)}${prompt.length > 120 ? "..." : ""}`);

  if (config.reloadBeforeEachPrompt || !worker.hasLoadedOnce) {
    await worker.load(config.targetUrl);
  }

  await sleep(config.timing.initialDelayMs);
  await automator.waitForDocument();

  const promptAlreadyVisible = automator.findBySelectors("prompt", { onlyVisible: true });
  if (config.openVeoFirst && !promptAlreadyVisible) {
    await automator.clickAction("openVeo");
    await sleep(config.timing.afterVeoClickMs);
  }

  await automator.fillPrompt(prompt);
  await sleep(config.timing.afterPromptInputMs);

  if (config.attachIngredientFiles) {
    await automator.attachIngredients(state.files);
  }

  const beforeSources = new Set(automator.collectVideoCandidates());
  await automator.clickAction("generate");
  await sleep(config.timing.afterGenerateClickMs);
  const resultUrl = await automator.waitForGeneratedVideo(beforeSources);
  worker.markResult(resultUrl, prompt);

  if (config.autoDownload) {
    downloadUrl(resultUrl, worker.resultName);
  }
}

function readConfigFromUi(options = {}) {
  const config = clone(DEFAULT_CONFIG);
  config.targetUrl = elements.targetUrl.value.trim() || DEFAULT_CONFIG.targetUrl;
  config.containerCount = clamp(Number(elements.containerCount.value) || DEFAULT_CONFIG.containerCount, 1, 8);
  config.promptSplitMode = elements.promptSplitMode.value;
  config.openVeoFirst = elements.openVeoFirst.checked;
  config.reloadBeforeEachPrompt = elements.reloadBeforeEachPrompt.checked;
  config.useCoordinateFallback = elements.useCoordinateFallback.checked;
  config.autoDownload = elements.autoDownload.checked;
  config.attachIngredientFiles = elements.attachIngredientFiles.checked;
  config.selectors.openVeo = parseSelectorLines(elements.selectorOpenVeo.value);
  config.selectors.prompt = parseSelectorLines(elements.selectorPrompt.value);
  config.selectors.avatar = parseSelectorLines(elements.selectorAvatar.value);
  config.selectors.ingredients = parseSelectorLines(elements.selectorIngredients.value);
  config.selectors.generate = parseSelectorLines(elements.selectorGenerate.value);
  config.selectors.videos = parseSelectorLines(elements.selectorVideos.value);
  config.selectors.ingredientFileInput = clone(DEFAULT_CONFIG.selectors.ingredientFileInput);

  try {
    config.timing = { ...config.timing, ...JSON.parse(elements.timingJson.value || "{}") };
  } catch (error) {
    if (!options.quiet) {
      setGlobalStatus("Timing JSON error", "error");
    }
  }

  try {
    config.coordinates = { ...config.coordinates, ...JSON.parse(elements.coordinateJson.value || "{}") };
  } catch (error) {
    if (!options.quiet) {
      setGlobalStatus("Coordinate JSON error", "error");
    }
  }

  return config;
}

function writeConfigToUi(config) {
  elements.targetUrl.value = config.targetUrl;
  elements.containerCount.value = String(config.containerCount);
  elements.promptSplitMode.value = config.promptSplitMode;
  elements.openVeoFirst.checked = config.openVeoFirst;
  elements.reloadBeforeEachPrompt.checked = config.reloadBeforeEachPrompt;
  elements.useCoordinateFallback.checked = config.useCoordinateFallback;
  elements.autoDownload.checked = config.autoDownload;
  elements.attachIngredientFiles.checked = config.attachIngredientFiles;
  elements.selectorOpenVeo.value = config.selectors.openVeo.join("\n");
  elements.selectorPrompt.value = config.selectors.prompt.join("\n");
  elements.selectorAvatar.value = config.selectors.avatar.join("\n");
  elements.selectorIngredients.value = config.selectors.ingredients.join("\n");
  elements.selectorGenerate.value = config.selectors.generate.join("\n");
  elements.selectorVideos.value = config.selectors.videos.join("\n");
  elements.timingJson.value = JSON.stringify(config.timing, null, 2);
  elements.coordinateJson.value = JSON.stringify(config.coordinates, null, 2);
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return clone(DEFAULT_CONFIG);
    }
    return deepMerge(clone(DEFAULT_CONFIG), JSON.parse(raw));
  } catch (error) {
    console.warn("Failed to load config", error);
    return clone(DEFAULT_CONFIG);
  }
}

function saveConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
}

async function exportConfig() {
  const payload = {
    ...readConfigFromUi(),
    prompts: elements.promptQueue.value,
  };
  const text = JSON.stringify(payload, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    setGlobalStatus("Config copied", "done");
  } catch (error) {
    setGlobalStatus("Config downloaded", "done");
  }
  downloadBlob(text, "videogenauto-config.json", "application/json");
}

function importConfig() {
  const raw = window.prompt("Paste VideoGenAuto config JSON");
  if (!raw) {
    return;
  }
  try {
    const imported = JSON.parse(raw);
    state.config = deepMerge(clone(DEFAULT_CONFIG), imported);
    writeConfigToUi(state.config);
    if (typeof imported.prompts === "string") {
      elements.promptQueue.value = imported.prompts;
    }
    saveConfig();
    refreshPrompts();
    setGlobalStatus("Config imported", "done");
  } catch (error) {
    setGlobalStatus("Import failed", "error");
    window.alert(`Invalid JSON: ${error.message}`);
  }
}

function parsePrompts(raw, mode) {
  const text = raw.trim();
  if (!text) {
    return [];
  }
  if (mode === "blank") {
    return text
      .split(/\n\s*\n/g)
      .map((prompt) => prompt.trim())
      .filter(Boolean);
  }
  return text
    .split(/\n/g)
    .map((prompt) => prompt.trim())
    .filter(Boolean);
}

function parseSelectorLines(raw) {
  return raw
    .split(/\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

function setGlobalStatus(text, tone = "") {
  elements.globalStatus.textContent = text;
  elements.globalStatus.className = `status-pill ${tone}`.trim();
}

function updateQueueStats() {
  elements.queueStats.textContent = `${state.nextPromptIndex}/${state.prompts.length} prompts assigned`;
}

function updateDownloadAllState() {
  elements.downloadAllButton.disabled = !state.workers.some((worker) => worker.resultUrl);
}

function shouldStop() {
  if (state.stopRequested) {
    throw new QueueStoppedError();
  }
}

async function waitFor(callback, options) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < options.timeoutMs) {
    if (options.shouldStop) {
      options.shouldStop();
    }
    try {
      const result = callback();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(options.intervalMs || 500);
  }
  throw lastError || new Error("Timed out waiting for condition");
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setNativeValue(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor && typeof descriptor.set === "function") {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

function dispatchClick(element, point = null) {
  element.scrollIntoView?.({ block: "center", inline: "center" });
  const rect = element.getBoundingClientRect();
  const clientX = point?.x ?? rect.left + rect.width / 2;
  const clientY = point?.y ?? rect.top + rect.height / 2;
  const view = element.ownerDocument.defaultView;

  ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((type) => {
    const EventClass = type.startsWith("pointer") && typeof view.PointerEvent === "function"
      ? view.PointerEvent
      : view.MouseEvent;
    element.dispatchEvent(
      new EventClass(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX,
        clientY,
        button: 0,
        buttons: type.endsWith("down") ? 1 : 0,
        view,
      }),
    );
  });
}

function isEnabled(element) {
  return !(
    element.disabled ||
    element.getAttribute("disabled") !== null ||
    element.getAttribute("aria-disabled") === "true"
  );
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function isGeneratedVideoCandidate(video) {
  const src = video.currentSrc || video.src;
  if (!src) {
    return false;
  }
  if (src.includes("/inspirationgallery/")) {
    return false;
  }
  if (video.closest(".appsDocsAiGenerativeaiVideoUiSidebarWizVideogenfooterInspirationGallery")) {
    return false;
  }
  if (!isVisible(video)) {
    return false;
  }
  return true;
}

function downloadUrl(url, filename) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function openExternal(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function downloadBlob(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function fileSafeName(value) {
  return String(value || "video")
    .slice(0, 70)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "video";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(target, source) {
  if (!source || typeof source !== "object") {
    return target;
  }
  Object.entries(source).forEach(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = deepMerge(target[key] || {}, value);
    } else {
      target[key] = value;
    }
  });
  return target;
}

window.videoAutomationApp = {
  getState: () => state,
  startQueue,
  buildContainers,
  readConfig: readConfigFromUi,
};

init();
