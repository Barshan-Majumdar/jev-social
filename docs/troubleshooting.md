# Troubleshooting

Jev Social directs your local Chrome browser through the [socai](https://github.com/socai-io/socai) CLI to collect public social media evidence. This guide explains how to identify and resolve common setup, connection, and platform access barriers while preserving the project's honest local-browser boundary.

---

## Local Browser Boundary

Jev Social intentionally acts within your real, local browser environment:
- **No authentication bypasses**: It does not bypass login screens, CAPTCHAs, bot challenges, or platform rate limits.
- **No credential injection**: It does not store passwords, scrape private cookies, or use rotating proxy pools.
- **Honest failure reporting**: When a site gates content behind a login wall, Jev Social halts visibly and returns partial results rather than inventing data or claiming false success.

---

## Distinguishing Failure & Result States

| State | What Happened | What You See | How to Resolve |
| --- | --- | --- | --- |
| **Missing `socai` executable** | The `socai` CLI is not installed or not discoverable on your system PATH. | Status indicator displays `socai unavailable`, or terminal reports `spawn ENOENT` / command not found. | Install `socai` or specify its path using `SOCAI_BIN`. |
| **Browser connection failure** | `socai` cannot connect to Chrome or remote debugging port is inaccessible. | Error indicates connection refusal (e.g. `ECONNREFUSED 127.0.0.1:9222`) or browser launch timeout. | Verify Chrome is installed and permitted to start on loopback. Close orphan Chrome processes. |
| **Login-required / challenge gate** | The platform blocked unauthenticated access with a login modal, redirect, or CAPTCHA. | Status displays `Partial results · login gate` or captured cards show a login redirect page. | Open the platform in Chrome, log in manually, complete any challenge, and re-run. |
| **Valid empty result** | The platform loaded successfully and the search ran, but returned 0 items. | `0 captured records` with completed status; no errors in terminal. | The search completed cleanly. Broaden or rephrase your search query. |

---

## Safe Diagnostics

Run these diagnostic commands to verify your setup without exposing secrets or browser cookies:

### 1. Check `socai` CLI installation
Verify that the `socai` binary is installed and executable:
```bash
socai --version
```
If installed in a non-standard directory, check where your environment points:
```bash
# macOS / Linux
which socai

# Windows PowerShell
Get-Command socai
```

### 2. Verify local service health & capabilities
Check the local Jev Social API status without printing keys:
```bash
curl -s http://127.0.0.1:8766/api/status
```
Expected response confirms configuration without exposing credentials:
```json
{
  "jevConfigured": true,
  "jevModel": "~typesafe/jev-latest",
  "socai": {
    "installed": true,
    "capabilities": {
      "instagram": true,
      "tiktok": true,
      "linkedin": true
    }
  }
}
```

### 3. Check OpenRouter key availability (without printing it)
Ensure `OPENROUTER_API_KEY` is present in your environment without echoing the actual key:
```bash
# macOS / Linux
[ -n "$OPENROUTER_API_KEY" ] && echo "Key is set" || echo "Key is missing"

# Windows PowerShell
if ($env:OPENROUTER_API_KEY) { "Key is set" } else { "Key is missing" }
```

---

## Platform-Specific Troubleshooting

### Instagram
- **Issue**: Instagram frequently displays a login modal after 1–2 page scrolls or redirects queries to `/accounts/login/`.
- **Resolution**: Open `https://www.instagram.com` in your standard Chrome browser window, log into your account, and confirm you can browse posts without a login prompt. Then re-run Jev Social.

### TikTok
- **Issue**: TikTok may present an interactive puzzle/slider challenge or restrict video detail and comments for unauthenticated sessions.
- **Resolution**: Complete any active puzzle verification in your Chrome browser window. Test direct platform access using:
  ```bash
  socai tiktok search "wearable AI" --num 4 --pretty
  ```

### LinkedIn
- **Issue**: LinkedIn redirects unauthenticated searches for people, content, or companies to `linkedin.com/authwall`.
- **CLI Capability Prerequisite**: The fallback `socai` binary resolved by the repository (v0.5.6) does not include the `linkedin` subcommand; running `socai linkedin` on this build outputs `error: unrecognized subcommand 'linkedin'`. Direct LinkedIn commands require a LinkedIn-capable build (or setting `SOCAI_BIN` to a build with the subcommand enabled).
- **Supported Diagnostics**:
  - Check whether your active `socai` binary exposes the `linkedin` subcommand:
    ```bash
    socai linkedin --help
    ```
  - Verify platform capability through the local Jev Social status endpoint:
    ```bash
    curl -s http://127.0.0.1:8766/api/status
    ```
    Confirm that `capabilities.linkedin` evaluates to `true`.
- **Resolution**: Sign into LinkedIn in your primary Chrome browser window. Once your authenticated session is active and a LinkedIn-capable build is available, run research through Jev Social:
  ```bash
  npm start -- search "find AI product managers in San Francisco on LinkedIn" --platform auto --limit 4
  ```
  On builds with the `linkedin` subcommand enabled, direct CLI calls are supported:
  ```bash
  socai linkedin search "AI product managers" --num 4 --pretty
  ```

---

## Working with Partial Evidence

When a research run stops early—whether due to a login gate, step exhaustion (`--max-steps`), or manual cancellation—**previously captured evidence is not discarded**:

1. **Captured Post Cards**: Any posts, profiles, or comments retrieved prior to the barrier remain visible in the cards view.
2. **Records Table**: The structured table retains all extracted rows for review.
3. **Action History**: The "Steps chosen by Jev" list details every decision and command executed up to the stopping point.
4. **Evidence Report & Download**: The generated Markdown summary and the **Download report.md** button remain fully accessible so you can export whatever evidence was collected before the run stopped.
