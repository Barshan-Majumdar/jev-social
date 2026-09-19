import crypto from "node:crypto";
import { classifySearch } from "./classifier.js";
import { AppError } from "./errors.js";
import { readConfig, resolveApiKey } from "./config.js";
import { extractSearchQuery } from "./query.js";
import { saveRun } from "./runs.js";
import { runSocaiResearch, runSocaiSearch, runSocaiTikTokVideos } from "./socai.js";

const DEMO_RESULT_LIMIT = 4;
const SOCAI_EVENT_PREFIX = "@@SOCAI_EVENT@@";

export async function runSearch(
  { query, platform = "auto", limit = DEMO_RESULT_LIMIT },
  { env = process.env, client, onEvent, signal } = {},
) {
  const normalizedQuery = query?.trim();
  if (!normalizedQuery) {
    throw new AppError("Search query cannot be empty.", { code: "EMPTY_QUERY" });
  }
  const config = await readConfig(env);
  const apiKey = resolveApiKey(config, env);
  if (!apiKey && !client) {
    throw new AppError("Set OPENROUTER_API_KEY (or openrouter in the local .env) first.", {
      code: "ONBOARDING_REQUIRED",
    });
  }

  const startedAt = Date.now();
  const runId = createRunId();
  onEvent?.({ stage: "classifying", message: "Jev is choosing the social workflow…" });
  const classification = await classifySearch({
    goal: normalizedQuery,
    requestedPlatform: platform,
    apiKey,
    model: env.OPENROUTER_JEV_MODEL || "~typesafe/jev-latest",
    client,
  });
  if (!classification.platform) {
    throw new AppError("Jev classified this request as unsupported. Choose Instagram, TikTok, or LinkedIn and use a read-only search.", {
      code: "UNSUPPORTED_TASK",
      details: { classification },
    });
  }
  if (typeof classification.confidence === "number" && classification.confidence < 0.35) {
    throw new AppError("Jev confidence is too low to execute automatically. Select a platform explicitly.", {
      code: "LOW_CLASSIFICATION_CONFIDENCE",
      details: { classification },
    });
  }

  const searchQuery = extractSearchQuery(normalizedQuery);

  onEvent?.({
    stage: "executing",
    message: `Jev chose ${classification.platform}; running socai CLI with “${searchQuery}”…`,
    classification,
  });
  const searchExecutions = [];
  let execution;
  let items = [];
  let streamedItems = [];
  const publishEvidence = (candidates, message) => {
    const previous = JSON.stringify(streamedItems);
    const prepared = (Array.isArray(candidates) ? candidates : [])
      .filter(isRecord)
      .map((item) => ({ ...item, platform: item.platform || classification.platform }))
      .map(sanitizeEvidenceForStream);
    streamedItems = selectPreviewableEvidence(
      mergeEvidenceItems(streamedItems, prepared),
      DEMO_RESULT_LIMIT,
    );
    if (!streamedItems.length || JSON.stringify(streamedItems) === previous) return;
    onEvent?.({
      stage: "evidence",
      message: message || `Captured ${streamedItems.length} previewable ${streamedItems.length === 1 ? "post" : "posts"}.`,
      items: streamedItems,
    });
  };
  for (const candidate of buildSearchQueries(searchQuery, classification.platform)) {
    if (searchExecutions.length) {
      onEvent?.({ stage: "searching", message: `No posts yet; trying the related query “${candidate}”…` });
    }
    execution = await runSocaiSearch({
      config,
      env,
      platform: classification.platform,
      query: candidate,
      limit,
      onProgress: (message) => emitProgress(onEvent, "searching", message),
      signal,
    });
    searchExecutions.push(execution);
    items = extractItems(execution.data);
    if (items.length) {
      publishEvidence(items, `Captured ${items.length} search ${items.length === 1 ? "result" : "results"}; research is continuing.`);
      break;
    }
  }

  let videoExecution;
  if (classification.platform === "tiktok") {
    const locators = items.map(videoLocator).filter(Boolean);
    if (locators.length) {
      onEvent?.({
        stage: "downloading",
        message: `Opening ${locators.length} video${locators.length === 1 ? "" : "s"}, reading details, and downloading media…`,
      });
      videoExecution = await runSocaiTikTokVideos({
        config,
        env,
        locators,
        numComments: 4,
        onProgress: (message) => emitProgress(onEvent, "downloading", message),
        signal,
      });
      items = mergeTikTokItems(items, videoExecution.data);
      publishEvidence(items, "Video details arrived; socai is continuing the evidence review.");
    }
  }

  const result = videoExecution
    ? { ...execution.data, items, video_details: videoExecution.data }
    : {
        ...execution.data,
        query: searchQuery,
        ...(searchExecutions.length > 1 ? { search_attempts: searchExecutions.map((item) => item.data) } : {}),
      };

  onEvent?.({
    stage: "researching",
    message: "socai is launching its research agent to compare evidence and write the report…",
  });
  const researchExecution = await runSocaiResearch({
    config,
    env,
    platform: classification.platform,
    task: buildResearchTask(normalizedQuery, classification.platform),
    maxSteps: 4,
    onProgress: (message) => {
      const event = parseSocaiEvent(message);
      if (event?.type === "evidence") {
        publishEvidence(event.items, "New evidence captured; socai is comparing it now.");
        return;
      }
      emitProgress(onEvent, "researching", message);
    },
    signal,
  });
  if (researchExecution.data?.ok === false) {
    throw new AppError(researchExecution.data.error || "socai research did not complete.", {
      code: "SOCAI_RESEARCH_FAILED",
      status: 502,
      details: { runId: researchExecution.data.run_id },
    });
  }
  const evidenceItems = selectPreviewableEvidence(
    mergeEvidenceItems(mergeEvidenceItems(items, streamedItems), researchExecution.data.evidence)
      .map((item) => ({ ...item, platform: item.platform || classification.platform })),
    DEMO_RESULT_LIMIT,
  );

  const run = {
    id: runId,
    createdAt: new Date().toISOString(),
    request: normalizedQuery,
    query: searchQuery,
    requestedPlatform: platform,
    platform: classification.platform,
    classification,
    command: researchExecution.command,
    evidenceCommand: searchExecutions[0].command,
    evidenceCommands: searchExecutions.map((item) => item.command),
    socaiExitCode: execution.exitCode,
    socaiElapsedMs: searchExecutions.reduce((total, item) => total + item.elapsedMs, 0) + (videoExecution?.elapsedMs || 0) + researchExecution.elapsedMs,
    elapsedMs: Date.now() - startedAt,
    result: { ...result, items: evidenceItems, research: researchExecution.data },
    report: researchExecution.data.report,
    socaiOutputs: [
      ...searchExecutions.map((item, index) => ({ stage: `search ${index + 1}`, elapsedMs: item.elapsedMs, text: item.stdout })),
      ...(videoExecution
        ? [{ stage: "video details and download", elapsedMs: videoExecution.elapsedMs, text: videoExecution.stdout }]
        : []),
      { stage: "research report", elapsedMs: researchExecution.elapsedMs, text: researchExecution.stdout },
    ],
    finalSocaiOutput: researchExecution.data.report,
  };
  await saveRun(run, env);
  onEvent?.({ stage: "complete", message: "Research report complete.", runId: run.id });
  return run;
}

function buildResearchTask(request, platform) {
  return [
    `Research this goal on ${platform}: ${request}`,
    "Use one or two focused search angles and prioritize current, concrete posts.",
    "Read post details, audience comments, and replies whenever the platform tools support them.",
    "Stop after identifying up to four strong posts or videos with a usable thumbnail, poster, or video URL; prefer directly previewable evidence.",
    "Compare recurring themes, engagement signals, disagreements, and notable outliers.",
    "Cite source URLs and do not invent facts that are not present in the captured evidence.",
  ].join("\n");
}

function buildSearchQueries(query, platform) {
  if (platform !== "instagram") return [query];
  const normalized = query.trim();
  const compact = normalized.replace(/[^a-z0-9_]+/gi, "");
  const singularCompact = compact.replace(/s$/i, "");
  return [...new Set([normalized, compact, singularCompact].filter(Boolean))].slice(0, 3);
}

function mergeEvidenceItems(initialItems, researchItems) {
  const merged = [...initialItems];
  for (const candidate of Array.isArray(researchItems) ? researchItems.filter(isRecord) : []) {
    const identity = evidenceIdentity(candidate);
    const index = identity ? merged.findIndex((item) => evidenceIdentity(item) === identity) : -1;
    if (index >= 0) merged[index] = { ...merged[index], ...candidate };
    else merged.push(candidate);
  }
  return merged;
}

function evidenceIdentity(item) {
  const value = item?.shortcode || item?.video_id || item?.id || item?.url || item?.web_url || item?.share_url;
  return String(value || "").trim();
}

function selectPreviewableEvidence(items, limit) {
  return items
    .map((item, index) => ({ item, index, score: previewScore(item) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ item }) => item);
}

function previewScore(item) {
  const browserPaths = [
    item?.video?.browser_url,
    item?.video?.local_url,
    item?.video_browser_url,
  ];
  if (browserPaths.some(nonEmptyString)) return 100;

  const media = Array.isArray(item?.media) ? item.media : [];
  if (media.some((entry) => entry?.type === "video" && [entry.url, entry.browser_url].some(nonEmptyString))) {
    return 80;
  }
  if ([item?.video?.url, item?.video?.play_url, item?.video_url, item?.play_url].some(nonEmptyString)) return 75;

  const posters = [
    item?.video?.poster_url,
    item?.video?.poster_browser_url,
    item?.cover_url,
    item?.cover,
    item?.thumbnail_url,
    item?.thumbnail,
    item?.image_url,
    item?.image,
    ...media.flatMap((entry) => [entry?.poster_url, entry?.url, entry?.browser_url]),
  ];
  if (posters.some(nonEmptyString)) return 50;

  const localPaths = [item?.video?.local_path, item?.video_local_path, ...media.map((entry) => entry?.local_path)];
  return localPaths.some(nonEmptyString) ? 35 : 0;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function emitProgress(onEvent, stage, message) {
  const normalized = safeProgressMessage(message);
  if (normalized) onEvent?.({ stage, message: normalized });
}

function parseSocaiEvent(message) {
  const normalized = String(message || "").trim();
  if (!normalized.startsWith(SOCAI_EVENT_PREFIX)) return null;
  try {
    const event = JSON.parse(normalized.slice(SOCAI_EVENT_PREFIX.length));
    return isRecord(event) ? event : null;
  } catch {
    return null;
  }
}

function safeProgressMessage(message) {
  const normalized = String(message || "").trim();
  if (!normalized || normalized.startsWith(SOCAI_EVENT_PREFIX)) return "";
  if (/^[{[]/.test(normalized)) return "";
  if (/^\d{4}-\d{2}-\d{2}T\S+\s+(?:TRACE|DEBUG|INFO|WARN|ERROR)\b/.test(normalized)) return "";
  if (/^at\s+(?:<anonymous>|[\w.]+)(?::|\s|$)/.test(normalized)) return "";
  if (/\b(?:run_dir|report_path|local_path|output_dir|artifact_path)\b\s*[:=]/i.test(normalized)) return "";
  if (/(?:^|\s)(?:\/Users\/|\/home\/|\/tmp\/|[A-Za-z]:\\)/.test(normalized)) return "";
  return normalized;
}

function sanitizeEvidenceForStream(item) {
  return sanitizeStreamValue(item);
}

function sanitizeStreamValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeStreamValue).filter((item) => item !== undefined);
  if (!isRecord(value)) {
    if (typeof value === "string" && /^(?:\/Users\/|\/home\/|\/tmp\/|[A-Za-z]:\\)/.test(value)) return undefined;
    return value;
  }
  const clean = {};
  for (const [key, child] of Object.entries(value)) {
    if (/(?:^|_)(?:local_)?path$|(?:^|_)(?:run|output|artifact)_dir$/i.test(key)) continue;
    const next = sanitizeStreamValue(child);
    if (next !== undefined) clean[key] = next;
  }
  return clean;
}

function extractItems(value) {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  for (const key of ["results", "cards", "items", "videos", "posts", "data"]) {
    if (Array.isArray(value[key])) return value[key].filter(isRecord);
  }
  return [];
}

function videoLocator(item) {
  for (const key of ["url", "web_url", "share_url", "video_id", "id"]) {
    const value = item?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function mergeTikTokItems(cards, details) {
  const wrappers = Array.isArray(details?.videos) ? details.videos : [];
  const unused = new Set(wrappers);
  const merged = cards.map((card) => {
    const wrapper = wrappers.find((candidate) => unused.has(candidate) && sameVideo(card, candidate?.entity, candidate?.locator));
    if (!wrapper) return card;
    unused.delete(wrapper);
    const entity = isRecord(wrapper?.entity) ? wrapper.entity : {};
    return { ...card, ...entity, socai_detail: wrapper };
  });
  for (const wrapper of unused) {
    const entity = isRecord(wrapper?.entity) ? wrapper.entity : {};
    merged.push({ ...entity, socai_detail: wrapper });
  }
  return merged;
}

function sameVideo(card, entity, locator) {
  const candidates = [card?.video_id, card?.id, card?.url, card?.web_url, card?.share_url].map(videoIdentity).filter(Boolean);
  const targets = [entity?.video_id, entity?.id, entity?.url, locator].map(videoIdentity).filter(Boolean);
  return candidates.some((candidate) => targets.includes(candidate));
}

function videoIdentity(value) {
  const normalized = String(value || "").trim();
  const id = normalized.match(/(?:^|\/video\/)(\d{3,})(?:[/?#]|$)/)?.[1];
  if (id) return `id:${id}`;
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const url = new URL(normalized);
      return `url:${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
    } catch {
      return "";
    }
  }
  return normalized ? `value:${normalized}` : "";
}

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function createRunId() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${timestamp}-${crypto.randomBytes(3).toString("hex")}`;
}
