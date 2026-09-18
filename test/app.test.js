import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runSearch } from "../src/app.js";

test("runSearch gives Jev the original request and socai the literal query", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jev-social-app-"));
  const mock = path.join(directory, "socai-mock.mjs");
  await writeFile(
    mock,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "research" && args[1] === "--help") console.log("Run research");
else if (args[0] === "research") {
  console.error('@@SOCAI_EVENT@@' + JSON.stringify({ type: "evidence", items: [
    { shortcode: "live-1", caption: "Live captured evidence", thumbnail_url: "https://cdn.example/live.jpg", local_path: "/tmp/private/video.mp4", url: "https://www.instagram.com/p/live-1/" }
  ] }));
  console.error('@@SOCAI_EVENT@@' + JSON.stringify({ type: "evidence", items: [1, 2, 3, 4].map((id) => ({
    shortcode: "local-only-" + id,
    caption: "Downloaded without a browser URL",
    video: { local_path: "/tmp/private/" + id + ".mp4" },
    url: "https://www.instagram.com/reel/local-only-" + id + "/"
  })) }));
  console.error("run_dir: /tmp/private/research-run");
  console.error("2026-09-19T00:00:00Z WARN browser: internal diagnostic");
  console.error("at <anonymous>:17:26");
  console.log(JSON.stringify({ ok: true, report: "# Report\\nThree-angle research complete.", evidence: [
  { shortcode: "no-preview", caption: "No preview", url: "https://www.instagram.com/p/no-preview/" },
  { shortcode: "recovered-1", caption: "Recovered agent evidence", thumbnail_url: "https://cdn.example/1.jpg", url: "https://www.instagram.com/p/recovered-1/" },
  { shortcode: "recovered-2", title: "Preview two", image_url: "https://cdn.example/2.jpg", url: "https://www.instagram.com/p/recovered-2/" },
  { shortcode: "recovered-3", title: "Preview three", media: [{ type: "image", url: "https://cdn.example/3.jpg" }], url: "https://www.instagram.com/p/recovered-3/" },
  { shortcode: "recovered-4", title: "Preview four", media: [{ type: "video", url: "https://cdn.example/4.mp4" }], url: "https://www.instagram.com/reel/recovered-4/" }
] }));
}
else if (args[1] === "--help") console.log("Commands: search");
else if (args[1] === "search") console.log(JSON.stringify({ ok: true, query: args[2], results: [] }));
else console.log("socai mock");
`,
    { mode: 0o755 },
  );
  await chmod(mock, 0o755);

  let decisionRequest;
  const client = {
    async systemOne(request) {
      decisionRequest = request;
      return {
        model: "typesafe/jev-test",
        answers: {
          route: {
            type: "choice",
            choice: "instagram_search",
            confidence: 0.9,
            probabilities: { instagram_search: 0.9, tiktok_search: 0.05, unsupported: 0.05 },
          },
        },
      };
    },
  };

  try {
    const env = { ...process.env, JEV_SOCIAL_HOME: directory, SOCAI_BIN: mock };
    const events = [];
    const run = await runSearch(
      { query: "search mr beasts on instagram", platform: "auto" },
      { env, client, onEvent: (event) => events.push(event) },
    );
    assert.equal(decisionRequest.state.request, "search mr beasts on instagram");
    assert.equal(run.request, "search mr beasts on instagram");
    assert.equal(run.query, "mr beasts");
    assert.equal(run.result.query, "mr beasts");
    assert.equal(run.socaiExitCode, 0);
    assert.match(run.evidenceCommand, /instagram search 'mr beasts' --num 4 --pretty$/);
    assert.match(run.command, /research/);
    assert.match(run.report, /Three-angle research complete/);
    assert.equal(run.result.items.length, 4);
    assert.ok(run.result.items.every((item) => item.shortcode !== "no-preview"));
    assert.ok(run.result.items.every((item) => item.platform === "instagram"));
    const live = events.find((event) => event.stage === "evidence" && event.items.some((item) => item.shortcode === "live-1"));
    assert.ok(live, "research evidence should stream before the final result");
    assert.equal(live.items[0].local_path, undefined);
    const latestLive = events.filter((event) => event.stage === "evidence").at(-1);
    assert.ok(latestLive.items.some((item) => item.shortcode === "live-1"), "later local-only captures must not evict a visible card");
    assert.ok(latestLive.items.every((item) => item.thumbnail_url || item.image_url || item.video?.url));
    assert.ok(events.every((event) => !String(event.message || "").includes("/tmp/private")));
    assert.ok(events.every((event) => !String(event.message || "").startsWith("{")));
    assert.ok(events.every((event) => !String(event.message || "").includes("internal diagnostic")));
    assert.ok(events.every((event) => !String(event.message || "").startsWith("at <anonymous>")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("runSearch continues TikTok cards into detail reading and real media download", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jev-social-video-"));
  const mock = path.join(directory, "socai-mock.mjs");
  await writeFile(
    mock,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "research" && args[1] === "--help") console.log("Run research");
else if (args[0] === "research") console.log(JSON.stringify({ ok: true, report: "# Report\\nVideo research complete." }));
else if (args.includes("--help")) console.log("Commands: search get-videos");
else if (args[1] === "search") console.log(JSON.stringify({ ok: true, cards: [
  { video_id: "123", url: "https://www.tiktok.com/@demo/video/123", title: "Unmatched card" },
  { share_url: "https://www.tiktok.com/@demo/video/3123", title: "Matched card" }
] }));
else if (args[1] === "get-videos") {
  if (!args.includes("--download-media")) process.exit(7);
  console.error("downloading video media");
  console.log(JSON.stringify({ ok: false, videos: [{ ok: true, locator: "3123", entity: { video_id: "3123", title: "Full post", author: "demo", video: { local_path: "/tmp/video.mp4" } } }] }));
} else console.log("socai mock");
`,
    { mode: 0o755 },
  );
  await chmod(mock, 0o755);
  const client = {
    async systemOne() {
      return {
        model: "typesafe/jev-test",
        answers: { route: { type: "choice", choice: "tiktok_search", confidence: 0.99 } },
      };
    },
  };
  const events = [];
  try {
    const env = { ...process.env, JEV_SOCIAL_HOME: directory, SOCAI_BIN: mock };
    const run = await runSearch(
      { query: "find demo videos on TikTok", platform: "auto", limit: 1 },
      { env, client, onEvent: (event) => events.push(event) },
    );
    assert.equal(run.result.items.length, 1);
    assert.equal(run.result.items[0].title, "Full post");
    assert.equal(run.result.items[0].video.local_path, "/tmp/video.mp4");
    assert.match(run.finalSocaiOutput, /Video research complete/);
    assert.equal(run.socaiOutputs.length, 3);
    assert.ok(events.some((event) => event.stage === "downloading"));
    assert.ok(events.some((event) => event.stage === "researching"));
    assert.ok(events.some((event) => /downloading video media/.test(event.message)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
