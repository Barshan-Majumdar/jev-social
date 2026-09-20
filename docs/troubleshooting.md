# Troubleshooting

Jev Social directs your local Chrome browser through the [socai](https://github.com/socai-io/socai) CLI to collect evidence visible to the active browser session. This guide explains how to identify and resolve common setup, connection, and platform access barriers while preserving the project's honest local-browser boundary.

> [!WARNING]
> **Review and redact reports before sharing**: Because Jev Social operates within your active browser session, captured evidence may include access-restricted posts, private account connections, author names, bio/experience data, comments, and direct URLs. Downloaded `report.md` files preserve these extracted details. Always review and redact sensitive or personal information before sharing reports publicly.

---

## Local Browser Boundary

Jev Social intentionally acts within your real, local browser environment:
- **No authentication bypasses**: It does not bypass login screens, CAPTCHAs, bot challenges, or platform rate limits.
- **No credential injection**: It does not store passwords, scrape private cookies, or use rotating proxy pools.
- **Honest failure reporting**: When a site gates content behind a login wall or rate limit, Jev Social halts visibly and returns partial results rather than inventing data or claiming false success.

---

## Distinguishing Failure & Result States

| State | What Happened | What You See | How to Resolve |
| --- | --- | --- | --- |
| **Missing `socai` executable** | The `socai` CLI is not installed or not discoverable at the resolved binary path. | Status indicator displays `socai unavailable`, or terminal reports `spawn ENOENT` / command not found. | Run `npm start -- onboard` (or `npx jev-social onboard`) to install the official CLI, or point `SOCAI_BIN` to your installed binary. |
| **Browser connection failure** | `socai` cannot connect to Chrome or its DevTools protocol (CDP) endpoint. | Error indicates connection refusal (e.g. `ECONNREFUSED 127.0.0.1:9222`), socket error, or browser launch timeout. | Follow your active connection mode below. Ensure the target Chrome instance is running with remote debugging enabled and accept any remote-debugging permission prompts. Avoid blanket process-killing commands. |
| **Login-required / challenge gate** | The platform blocked unauthenticated access with a login modal, redirect (e.g. `authwall`), or CAPTCHA. | Status displays a partial result notice with the specific gate reason (for example, `Partial results · The platform requires attention: login_required`). | Open the platform in the specific Chrome session or profile selected by `socai`, complete authentication or challenges, and verify browsing before re-running. |
| **Valid empty result** | The platform loaded successfully and the search executed cleanly, but returned 0 matching records. | Evidence cards, table, and heading remain hidden. The run may finalize as `partial` (e.g. `Partial results · Jev stopped without usable evidence.`), `step_limit`, or `decision_failed`. | The search executed cleanly without matching records. Broaden or rephrase your query. |

---

## Safe Diagnostics

Run these diagnostic commands to verify readiness without exposing API credentials or browser secrets:

### 1. Check Configuration & Capabilities via `/api/status`

Jev Social resolves your OpenRouter key from `OPENROUTER_API_KEY`, lowercase `openrouter` in `.env`, or saved onboarding config (`config.json`). Checking only `$OPENROUTER_API_KEY` in your shell can falsely report "missing" when a key is already configured.

Query the local status endpoint to verify the effective `jevConfigured` state and platform capabilities:

```bash
curl -s http://127.0.0.1:8766/api/status
```

> [!NOTE]
> **Privacy note:** `/api/status` returns `configPath` and `socai.bin`. If sharing output in public issues or chat, redact these local filesystem paths.

To inspect status with local paths filtered out, pipe the response through Node or `jq`:

```bash
# Filtered diagnostic (Node.js)
curl -s http://127.0.0.1:8766/api/status | node -e '
  const fs = require("fs");
  const { jevConfigured, jevModel, socai } = JSON.parse(fs.readFileSync(0, "utf8"));
  console.log(JSON.stringify({ jevConfigured, jevModel, socai: { installed: socai?.installed, capabilities: socai?.capabilities } }, null, 2));
'
```

Expected output confirms configuration without exposing credentials or local filesystem paths:

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

You can also run the CLI status command:

```bash
npm start -- status
```

### 2. Verify the Resolved `socai` Binary

Jev Social resolves the `socai` binary in the following order:
1. `SOCAI_BIN` environment variable or `socaiBin` in `~/.jev-social/config.json`.
2. Standard installation path at `~/.socai/bin/socai` (or `socai.exe` on Windows).
3. Local development build candidates (`target/debug` or `target/release`).
4. System `PATH`.

Because resolution is not pinned to a single binary and may differ from what is on your current shell `PATH`, test the exact binary resolved by Jev Social (found in the `socai.bin` field of `/api/status`, represented as `/path/from-api-status` below):

```bash
# Replace /path/from-api-status with your resolved binary path from /api/status:
/path/from-api-status --version
```

---

## Browser Connection & Session Modes

Jev Social forwards Chrome and Chrome DevTools Protocol (CDP) settings to child `socai` processes:
- `SOCAI_CDP_URL` / `SOCAI_CDP_WS`: Connects to an existing Chrome instance or remote debugging endpoint.
- `SOCAI_CHROME_PROFILE`: Selects the profile connection mode (`existing`, `managed`, or `auto`).
- `SOCAI_CHROME_USER_DATA_DIR`: Specifies a custom Chrome user data directory path.
- `SOCAI_CHROME_EXECUTABLE`: Specifies the Chrome or Chromium binary path.

### Working with Browser Sessions Safely

1. **Identify the Active Profile**: `socai` can use an existing running browser, a managed instance, or an auto-detected profile based on `SOCAI_CHROME_PROFILE` and `SOCAI_CHROME_USER_DATA_DIR`. When logging in or solving challenges, ensure you are interacting with the **exact Chrome session/profile selected by `socai`**. Logging into a different profile or everyday browser window will not share session cookies with `socai`.
2. **Existing-Profile Remote Debugging Permission**: If attaching `socai` to an existing Chrome profile via remote debugging (e.g. `--remote-debugging-port=9222`), Chrome may display an infobar or confirmation prompt requesting permission for remote debugging/automation. Confirm that this permission is granted.
3. **Avoid Blanket Process Termination**: Do not use blanket commands such as `pkill chrome` or `killall chrome`. Arbitrarily closing processes can destroy the exact running Chrome session, debugging port, or authenticated state that `socai` is configured to reuse.

---

## Platform-Specific Troubleshooting

### Instagram
- **Issue**: Instagram frequently displays a login modal after 1–2 page scrolls or redirects queries to `/accounts/login/`.
- **Resolution**: Open `https://www.instagram.com` within the Chrome session/profile selected by `socai`, log into your account, and verify you can browse posts without a login modal. Then re-run Jev Social.

### TikTok
- **Issue**: TikTok may present an interactive puzzle/slider challenge or restrict video detail and comments for unauthenticated sessions.
- **Resolution**: Complete any active puzzle verification within the Chrome session/profile selected by `socai`. Test direct platform access using the resolved `socai` executable:
  ```bash
  /path/from-api-status tiktok search "wearable AI" --num 4 --pretty
  ```

### LinkedIn
- **Issue**: LinkedIn redirects unauthenticated searches for people, content, or companies to `linkedin.com/authwall`.
- **Capability Prerequisite**: Binary resolution is dynamic and depends on the active `socai` executable. For example, testing with `socai v0.5.6` shows it returns exit code 2 and reports `socai.capabilities.linkedin: false` because the subcommand was not enabled in that build. Direct LinkedIn CLI commands require an executable with LinkedIn support enabled (or setting `SOCAI_BIN` to a capable build).
- **Supported Diagnostics**:
  - Check platform capability via the local status endpoint:
    ```bash
    curl -s http://127.0.0.1:8766/api/status
    ```
    Confirm that `socai.capabilities.linkedin` evaluates to `true`.
  - Test subcommand availability directly on the resolved executable:
    ```bash
    /path/from-api-status linkedin --help
    ```
- **Resolution**: Sign into LinkedIn within the Chrome session/profile selected by `socai`. Once your authenticated session is active and `socai.capabilities.linkedin` is `true`, run research through Jev Social:
  ```bash
  npm start -- search "find AI product managers in San Francisco on LinkedIn" --platform auto --limit 4
  ```
  On builds where the `linkedin` subcommand is supported by the resolved binary:
  ```bash
  /path/from-api-status linkedin search "AI product managers" --num 4 --pretty
  ```

---

## Working with Partial Evidence

Understanding how Jev Social handles runs that stop before completing all requested steps:

### Completed Partial Runs (Step Exhaustion & Login Gates)

When a run naturally halts at a barrier—such as a login or challenge wall (`status: blocked`) or reaching the configured decision step limit (`status: step_limit` via `--max-steps`)—**all collected evidence is preserved and finalized**:

1. **Finalized Report Generation**: The backend executes `evidenceReport()` and persists the run with `saveRun()`.
2. **Captured Post Cards**: Any posts, profiles, or video cards retrieved before the stopping point remain rendered in the UI.
3. **Records Table**: The structured evidence table retains all extracted rows.
4. **Action History**: The "Steps chosen by Jev" list displays each operation executed along with its status (`${step.action.label} · ${step.status}`).
5. **Report Export**: The generated Markdown summary is displayed, and the **Download report.md** button is fully accessible to export the captured evidence.

### Manual Cancellation

When a run is manually cancelled (e.g. by navigating back to search, clicking back, or closing the stream connection):
- **Immediate Halt**: The abort signal immediately stops active browser work and child processes.
- **Observable Guarantee**: Cancellation stops active work and may end without a newly rendered run view or downloadable report in the UI. While an abort during the decision loop bypasses report compilation and run persistence, a disconnect during or after persistence can leave a saved run on disk while suppressing the final UI event.
