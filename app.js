const DEFAULT_TARGET_URL = "https://docs.google.com/videos/u/0/create?usp=vids_home";

const DEFAULT_SELECTORS = {
  openVeo: [
    "#content-library-rail-video-generation-element",
    '[aria-label="Generate an AI video clip"]',
    '[data-tooltip="Generate an AI video clip"]',
  ],
  prompt: [
    'textarea[aria-label*="Describe your eight-second video" i]',
    'textarea[placeholder*="Describe your eight-second video" i]',
    'textarea[jsname="YPqjbf"]',
    "textarea#c1",
    ".promptTextAreaPromptTextInput textarea",
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
  ],
};

const elements = {
  backendStatus: document.querySelector("#backendStatus"),
  checkBackendButton: document.querySelector("#checkBackendButton"),
  targetUrl: document.querySelector("#targetUrl"),
  parallelCount: document.querySelector("#parallelCount"),
  waitForResult: document.querySelector("#waitForResult"),
  prompts: document.querySelector("#prompts"),
  openVeoSelectors: document.querySelector("#openVeoSelectors"),
  promptSelectors: document.querySelector("#promptSelectors"),
  generateSelectors: document.querySelector("#generateSelectors"),
  videoSelectors: document.querySelector("#videoSelectors"),
  startButton: document.querySelector("#startButton"),
  clearButton: document.querySelector("#clearButton"),
  runStatus: document.querySelector("#runStatus"),
  resultCount: document.querySelector("#resultCount"),
  results: document.querySelector("#results"),
};

const state = {
  results: [],
};

init();

function init() {
  elements.targetUrl.value = DEFAULT_TARGET_URL;
  elements.openVeoSelectors.value = DEFAULT_SELECTORS.openVeo.join("\n");
  elements.promptSelectors.value = DEFAULT_SELECTORS.prompt.join("\n");
  elements.generateSelectors.value = DEFAULT_SELECTORS.generate.join("\n");
  elements.videoSelectors.value = DEFAULT_SELECTORS.videos.join("\n");

  elements.checkBackendButton.addEventListener("click", checkBackend);
  elements.startButton.addEventListener("click", startAutomation);
  elements.clearButton.addEventListener("click", () => {
    state.results = [];
    renderResults();
  });

  checkBackend();
  renderResults();
}

async function checkBackend() {
  elements.backendStatus.textContent = "Checking backend...";
  try {
    const response = await fetch("/api/generate");
    const payload = await response.json();
    if (payload.ready) {
      elements.backendStatus.textContent = "Ready: remote browser endpoint is configured.";
      return;
    }
    elements.backendStatus.textContent =
      "Setup needed: add BROWSER_WS_ENDPOINT in Vercel env vars. It must point to a remote Chrome session already signed in to Google.";
  } catch (error) {
    elements.backendStatus.textContent = `Backend check failed: ${error.message}`;
  }
}

async function startAutomation() {
  const prompts = parsePrompts(elements.prompts.value);
  if (!prompts.length) {
    setRunStatus("Add prompts", "error");
    return;
  }

  setRunStatus("Running", "running");
  elements.startButton.disabled = true;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targetUrl: elements.targetUrl.value.trim() || DEFAULT_TARGET_URL,
        prompts,
        parallelCount: Number(elements.parallelCount.value) || 1,
        waitForResult: elements.waitForResult.value === "true",
        selectors: {
          openVeo: parseLines(elements.openVeoSelectors.value),
          prompt: parseLines(elements.promptSelectors.value),
          generate: parseLines(elements.generateSelectors.value),
          videos: parseLines(elements.videoSelectors.value),
        },
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Automation failed");
    }

    state.results = payload.results || [];
    renderResults();
    setRunStatus("Done", "done");
  } catch (error) {
    state.results = [
      {
        status: "error",
        prompt: "Run failed",
        error: error.message,
      },
    ];
    renderResults();
    setRunStatus("Error", "error");
  } finally {
    elements.startButton.disabled = false;
  }
}

function renderResults() {
  elements.resultCount.textContent = `${state.results.length} result${state.results.length === 1 ? "" : "s"}`;

  if (!state.results.length) {
    elements.results.className = "results empty";
    elements.results.textContent = "No runs yet.";
    return;
  }

  elements.results.className = "results";
  elements.results.textContent = "";

  state.results.forEach((result, index) => {
    const card = document.createElement("article");
    card.className = "result-card";

    const title = document.createElement("strong");
    title.textContent = `${index + 1}. ${result.status || "unknown"}`;
    card.appendChild(title);

    const prompt = document.createElement("div");
    prompt.textContent = result.prompt || "";
    card.appendChild(prompt);

    if (result.videoUrl) {
      const link = document.createElement("a");
      link.href = result.videoUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = "";
      link.textContent = "Open/download generated video";
      card.appendChild(link);
    }

    if (result.error) {
      const error = document.createElement("code");
      error.textContent = result.error;
      card.appendChild(error);
    }

    elements.results.appendChild(card);
  });
}

function setRunStatus(text, tone = "") {
  elements.runStatus.textContent = text;
  elements.runStatus.className = `pill ${tone}`.trim();
}

function parsePrompts(value) {
  return value
    .split(/\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseLines(value) {
  return value
    .split(/\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
}
