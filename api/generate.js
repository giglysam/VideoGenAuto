import { chromium } from "playwright-core";

export const config = {
  maxDuration: 300,
};

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
    "video[src]",
  ],
};

const TIMING = {
  navigationTimeoutMs: 70000,
  elementTimeoutMs: 45000,
  generationTimeoutMs: 240000,
  afterOpenVeoMs: 1500,
  afterPromptMs: 600,
  afterGenerateMs: 1200,
};

export default async function handler(request, response) {
  if (request.method === "GET") {
    response.status(200).json({
      ready: Boolean(process.env.BROWSER_WS_ENDPOINT),
      mode: "remote-browser-cdp",
      requiredEnv: "BROWSER_WS_ENDPOINT",
    });
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.BROWSER_WS_ENDPOINT) {
    response.status(500).json({
      error:
        "BROWSER_WS_ENDPOINT is not configured. Add a remote authenticated Chrome/Chromium CDP WebSocket URL in Vercel env vars.",
    });
    return;
  }

  const body = request.body || {};
  const prompts = normalizePrompts(body.prompts);
  if (!prompts.length) {
    response.status(400).json({ error: "No prompts provided" });
    return;
  }

  const targetUrl = sanitizeTargetUrl(body.targetUrl);
  const selectors = mergeSelectors(body.selectors);
  const parallelCount = clamp(Number(body.parallelCount) || 1, 1, 4);
  const waitForResult = body.waitForResult !== false;

  let browser;
  try {
    browser = await chromium.connectOverCDP(process.env.BROWSER_WS_ENDPOINT, {
      timeout: TIMING.navigationTimeoutMs,
    });
    const context = browser.contexts()[0] || (await browser.newContext());
    const results = await runPromptQueue({
      context,
      prompts,
      targetUrl,
      selectors,
      parallelCount,
      waitForResult,
    });

    response.status(200).json({ results });
  } catch (error) {
    response.status(500).json({
      error: error.message || "Automation failed",
    });
  } finally {
    await browser?.close().catch(() => {});
  }
}

async function runPromptQueue(options) {
  const results = [];
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(options.parallelCount, options.prompts.length) }, async () => {
    while (nextIndex < options.prompts.length) {
      const promptIndex = nextIndex;
      nextIndex += 1;

      const prompt = options.prompts[promptIndex];
      const result = await runPrompt({
        ...options,
        prompt,
      }).catch((error) => ({
        prompt,
        status: "error",
        error: error.message || String(error),
      }));

      results[promptIndex] = result;
    }
  });

  await Promise.all(workers);
  return results;
}

async function runPrompt({ context, targetUrl, selectors, prompt, waitForResult }) {
  const page = await context.newPage();
  page.setDefaultTimeout(TIMING.elementTimeoutMs);
  page.setDefaultNavigationTimeout(TIMING.navigationTimeoutMs);

  try {
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: TIMING.navigationTimeoutMs,
    });

    await clickOptional(page, selectors.openVeo, "Veo");
    await page.waitForTimeout(TIMING.afterOpenVeoMs);

    const beforeVideoSources = waitForResult ? await collectVideoSources(page, selectors.videos) : [];

    const promptLocator = await firstVisibleLocator(page, selectors.prompt);
    await promptLocator.evaluate((element, value) => {
      element.focus();
      element.value = value;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, prompt);

    await page.waitForTimeout(TIMING.afterPromptMs);

    const generateLocator = (await firstVisibleLocator(page, selectors.generate).catch(() => null))
      || page.getByRole("button", { name: /^generate$/i }).first();
    await generateLocator.click({ timeout: TIMING.elementTimeoutMs });
    await page.waitForTimeout(TIMING.afterGenerateMs);

    if (!waitForResult) {
      return {
        prompt,
        status: "submitted",
      };
    }

    const videoUrl = await waitForNewVideo(page, selectors.videos, beforeVideoSources);
    return {
      prompt,
      status: "ready",
      videoUrl,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function clickOptional(page, selectors, fallbackText) {
  const locator = await firstVisibleLocator(page, selectors).catch(() => null);
  if (locator) {
    await locator.click({ timeout: TIMING.elementTimeoutMs }).catch(() => {});
    return;
  }

  if (fallbackText) {
    await page.getByText(fallbackText, { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
  }
}

async function firstVisibleLocator(page, selectors) {
  let lastError;
  for (const selector of selectors || []) {
    try {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: "visible", timeout: TIMING.elementTimeoutMs });
      return locator;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No matching element found");
}

async function collectVideoSources(page, selectors) {
  return page.evaluate((videoSelectors) => {
    const sources = [];
    for (const selector of videoSelectors) {
      for (const video of document.querySelectorAll(selector)) {
        const source = video.currentSrc || video.src;
        if (source && !source.includes("/inspirationgallery/")) {
          sources.push(source);
        }
      }
    }
    return Array.from(new Set(sources));
  }, selectors);
}

async function waitForNewVideo(page, selectors, beforeSources) {
  const handle = await page.waitForFunction(
    ({ videoSelectors, before }) => {
      const beforeSet = new Set(before);
      for (const selector of videoSelectors) {
        for (const video of document.querySelectorAll(selector)) {
          const source = video.currentSrc || video.src;
          if (!source || beforeSet.has(source) || source.includes("/inspirationgallery/")) {
            continue;
          }
          const rect = video.getBoundingClientRect();
          const visible = rect.width > 0 && rect.height > 0;
          if (visible) {
            return source;
          }
        }
      }
      return "";
    },
    {
      videoSelectors: selectors,
      before: beforeSources,
    },
    {
      timeout: TIMING.generationTimeoutMs,
      polling: 2000,
    },
  );

  return handle.jsonValue();
}

function normalizePrompts(prompts) {
  if (Array.isArray(prompts)) {
    return prompts.map((prompt) => String(prompt).trim()).filter(Boolean);
  }
  return String(prompts || "")
    .split(/\n/g)
    .map((prompt) => prompt.trim())
    .filter(Boolean);
}

function sanitizeTargetUrl(url) {
  const value = String(url || DEFAULT_TARGET_URL).trim();
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") {
    throw new Error("Target URL must use https");
  }
  return parsed.toString();
}

function mergeSelectors(selectors = {}) {
  return {
    openVeo: normalizeSelectorList(selectors.openVeo, DEFAULT_SELECTORS.openVeo),
    prompt: normalizeSelectorList(selectors.prompt, DEFAULT_SELECTORS.prompt),
    generate: normalizeSelectorList(selectors.generate, DEFAULT_SELECTORS.generate),
    videos: normalizeSelectorList(selectors.videos, DEFAULT_SELECTORS.videos),
  };
}

function normalizeSelectorList(value, fallback) {
  if (Array.isArray(value)) {
    const selectors = value.map((selector) => String(selector).trim()).filter(Boolean);
    return selectors.length ? selectors : fallback;
  }
  return fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
