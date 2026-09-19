<img src="docs/banner.png" alt="Jev × socai" width="100%" />

# Jev for social media

**Jev is cool. Giving it access to your social media is cooler.**

Jev makes typed decisions. [socai](https://github.com/socai-io/socai) opens your real Chrome and Instagram, TikTok, or LinkedIn; posts, profiles, comments, downloaded video, a table, a report. Not a generic browser agent guessing what the feed looked like.

<p>
  <img src="docs/platforms/instagram.png" height="32" alt="Instagram">
  &nbsp;&nbsp;
  <img src="docs/platforms/tiktok.png" height="32" alt="TikTok">
  &nbsp;&nbsp;
  <img src="docs/platforms/linkedin.svg" height="32" alt="LinkedIn">
</p>

[socai](https://github.com/socai-io/socai) · [Discord](https://discord.gg/CpQdA7bwt8) · [Jev](https://typesafe.ai/)

![Live run](docs/jev-social.gif)

## Why this pairing

Jev is absurdly good at *choosing*. It is a waste of that to make it pick CSS selectors.

socai already knows the sites. Search, open a reel, read a LinkedIn profile, expand comments, keep the file. The model never sees a shell. The Node process launches `socai` with an argument array.

```text
"find the loudest AI wearable posts on Instagram"
        │
        ▼
   Jev · one choice
        │
        ├─ instagram ──► socai instagram search …
        ├─ tiktok    ──► socai tiktok search … + get-videos --download-media
        ├─ linkedin  ──► socai linkedin search …
        └─ no        ──► stop
        │
        ▼
   cards · table · report
```

https://github.com/user-attachments/assets/4849e0f3-87d5-4a0d-8e0b-2a58e3d0267a

## 1/2 hours → 30 seconds

A manual social scan is a chain of small tasks: pick a network, search, open posts, copy captions, download videos, build a table, write it up. This turns that chain into one request.

| Workflow | Manual | Jev × socai | |
| --- | ---: | ---: | ---: |
| Search one social topic | 5–10 min | 10–20 s | up to 30× |
| Open and inspect 10 posts | 10–15 min | 20–30 s | up to 45× |
| Download video evidence | 5–10 min | included | no extra step |
| Build a results table | 5–15 min | immediate | no copy/paste |
| **End-to-end trend scan** | **~30 min** | **~50 s** | **~36×** |

These are demo targets, not a benchmark. Live time depends on result count, video size, login, and the site. The UI always shows the measured elapsed time for the current run.

## Run it

An OpenRouter key with Jev access, and a current [socai](https://github.com/socai-io/socai) CLI.

```bash
curl -fsSL https://github.com/socai-io/socai/releases/latest/download/install.sh | sh
npm install
cp .env.example .env   # OPENROUTER_API_KEY=…
npm start
```

Opens `http://127.0.0.1:8766`. Loopback only. Leave the platform on **Jev · auto**, type a goal, watch the timer.

```bash
npm start -- search "find emerging design creators on Instagram" --platform auto --limit 4
npm start -- search "find AI wearable trends on TikTok" --platform auto --limit 4
npm start -- search "find AI product managers in San Francisco on LinkedIn" --platform auto --limit 4
```

Or call socai directly:

```bash
socai instagram search "AI wearables" --num 10 --pretty
socai tiktok search "AI wearables" --num 10 --pretty
socai tiktok get-videos --video <url> --download-media --pretty
socai linkedin search "AI product managers" --num 10 --pretty
socai linkedin search "AI agents" --type content --num 10 --pretty
```

---

If this is useful, [star socai](https://github.com/socai-io/socai) or [join the Discord](https://discord.gg/CpQdA7bwt8).
