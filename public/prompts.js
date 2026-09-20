export const SUPPORTED_PLATFORMS = Object.freeze(["instagram", "tiktok", "linkedin"]);

export const RESEARCH_PROMPT_EXAMPLES = Object.freeze([
  {
    platform: "instagram",
    platformLabel: "Instagram",
    title: "Handmade art creators",
    query: "Find handmade art creators and inspect their most engaging posts",
  },
  {
    platform: "tiktok",
    platformLabel: "TikTok",
    title: "Emerging AI creators",
    query: "Find emerging AI creators and inspect their most engaging videos",
  },
  {
    platform: "linkedin",
    platformLabel: "LinkedIn",
    title: "AI product managers",
    query: "Find AI product managers and examine their recent shared posts",
  },
]);

export function getPromptForPlatform(platform) {
  if (!platform || typeof platform !== "string") return null;
  const target = platform.trim().toLowerCase();
  return RESEARCH_PROMPT_EXAMPLES.find((item) => item.platform === target) || null;
}

export function applyPromptSelection(prompt, elements = {}) {
  if (!prompt) return false;
  const query = typeof prompt === "string" ? prompt : prompt.query;
  const platform = typeof prompt === "object" ? prompt.platform : undefined;

  const queryEl = elements.queryElement || elements.queryInput || elements.query;
  const platformEl = elements.platformElement || elements.platformSelect || elements.platform;

  if (queryEl && typeof queryEl === "object") {
    queryEl.value = query || "";
    if (typeof queryEl.dispatchEvent === "function" && typeof Event !== "undefined") {
      queryEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  if (platformEl && typeof platformEl === "object" && platform) {
    platformEl.value = platform;
    if (typeof platformEl.dispatchEvent === "function" && typeof Event !== "undefined") {
      platformEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  if (queryEl && typeof queryEl.focus === "function") {
    queryEl.focus();
  }

  return true;
}

export function bindPromptButtons({ buttons, queryElement, platformElement, onSelect } = {}) {
  if (!buttons) return () => {};
  const list = Array.from(buttons);
  const cleanups = [];

  for (const button of list) {
    const handler = (event) => {
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      const platform = button.dataset?.platform;
      const query = button.dataset?.query;
      const prompt = getPromptForPlatform(platform) || { platform, query };
      applyPromptSelection(prompt, { queryElement, platformElement });
      if (typeof onSelect === "function") {
        onSelect(prompt);
      }
    };
    button.addEventListener("click", handler);
    cleanups.push(() => button.removeEventListener("click", handler));
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
