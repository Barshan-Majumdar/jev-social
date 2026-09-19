import { AppError } from "./errors.js";

export const SUPPORTED_PLATFORMS = new Set(["instagram", "tiktok", "linkedin"]);
const ROUTE_TO_PLATFORM = {
  instagram_search: "instagram",
  tiktok_search: "tiktok",
  linkedin_search: "linkedin",
};

export async function classifySearch({
  goal,
  requestedPlatform = "auto",
  apiKey,
  model = process.env.OPENROUTER_JEV_MODEL || "~typesafe/jev-latest",
  client,
  fetchImpl = fetch,
}) {
  const normalizedPlatform = requestedPlatform.toLowerCase();
  if (normalizedPlatform !== "auto" && !SUPPORTED_PLATFORMS.has(normalizedPlatform)) {
    throw new AppError(`Unsupported platform: ${requestedPlatform}`, {
      code: "INVALID_PLATFORM",
    });
  }
  if (!goal?.trim()) {
    throw new AppError("Search query cannot be empty.", { code: "EMPTY_QUERY" });
  }

  const request = {
    model,
    state: {
      request: goal.trim(),
      requested_platform: normalizedPlatform,
      supported_workflows: [
        "Read-only Instagram search via the socai CLI",
        "Read-only TikTok search via the socai CLI",
        "Read-only LinkedIn search via the socai CLI",
      ],
    },
    questions: {
      route: {
        type: "choice",
        instructions: {
          task: "Choose the one supported workflow that should execute this request.",
          rules: [
            "Honor an explicit requested_platform.",
            "Choose unsupported when the request is not a read-only social search.",
            "Do not invent another platform or an action that changes remote state.",
          ],
        },
        criteria: {
          instagram_search: "Search or research Instagram content, profiles, posts, or reels.",
          tiktok_search: "Search or research TikTok content, creators, or videos.",
          linkedin_search: "Search or research LinkedIn people, companies, posts, or professional experience.",
          unsupported:
            "Anything else, including posting, liking, following, messaging, or an ambiguous auto route.",
        },
      },
    },
  };
  let response;
  try {
    response = client
      ? await client.systemOne(request)
      : await requestOpenRouterDecision({ apiKey, request, fetchImpl });
  } catch (error) {
    throw new AppError(`Jev classification failed: ${error.message}`, {
      code: "JEV_UNAVAILABLE",
      status: 502,
    });
  }

  const answer = response?.answers?.route;
  const selected = answer?.choice;
  const platform = ROUTE_TO_PLATFORM[selected] || null;
  const confidence = answer?.confidence;
  const probabilities = answer?.probabilities;
  const probabilitiesValid =
    probabilities === undefined ||
    (probabilities &&
      typeof probabilities === "object" &&
      !Array.isArray(probabilities) &&
      Object.values(probabilities).every(
        (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1,
      ));
  if (
    answer?.type !== "choice" ||
    !["instagram_search", "tiktok_search", "linkedin_search", "unsupported"].includes(selected) ||
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1 ||
    !probabilitiesValid
  ) {
    throw new AppError("Jev returned an invalid route response.", {
      code: "INVALID_JEV_RESPONSE",
      status: 502,
    });
  }
  if (normalizedPlatform !== "auto" && platform !== normalizedPlatform) {
    throw new AppError(
      `Jev route '${selected}' conflicts with the explicitly selected ${normalizedPlatform} platform.`,
      {
        code: "JEV_ROUTE_MISMATCH",
        details: { requestedPlatform: normalizedPlatform, selectedRoute: selected },
      },
    );
  }

  return {
    route: selected,
    platform,
    confidence,
    probabilities,
    model: response.model || model,
    usage: response.usage || {},
  };
}

async function requestOpenRouterDecision({ apiKey, request, fetchImpl }) {
  if (!apiKey?.trim()) {
    throw new Error("OPENROUTER_API_KEY is missing");
  }
  const response = await fetchImpl("https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
      "X-Title": "jev-social",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenRouter returned HTTP ${response.status}`);
  }
  return payload;
}
