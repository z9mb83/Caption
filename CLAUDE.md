# CLAUDE.md - Caption (Shaadi Bells ads & Instagram caption generator)

Read this first, then `README.md`, `CHANGELOG.md`, `docs/TROUBLESHOOTING.md` (everything found and fixed, plus open decisions)
and `docs/DEPLOY.md`.

## What this is
Google Apps Script bound to the **"15-080-26 Shaadi ads"** sheet (`1dGJq2_2qqq31TgprLsXewllmchEzI7dYaR9x4nB8cZU`, Sheet1;
Apps Script project `1rCChkWwetgeBh1VDKSZ_OYRa2ppKL9DW1a60TLP3FkFN89bhP4HhH3a-`). From each matrimonial profile row it writes:
- **Ads** (column N): plain text, no emojis, always the same 13 points.
- **Instagram Text & Hashtags** (column O): 💖 Seeking · ✨ Introduction · ✨ Key Highlights · 💌 About · 📞 Call / WhatsApp
  +917770000559 · exactly 18 hashtags (4 brand + 6 approved SEO + 8 profile).
- **QA Notes** (column P): what was fixed and what needs a human.

Menu **Shaadi Bells AI**: repair (quick / with AI), generate empty rows, regenerate, stop, QA check, settings panel.

## Rules
- The structure is built in code; the AI (OpenAI `gpt-4o` default; Gemini/Claude supported) only writes the short personal
  sentences, and every answer is checked for gender, ages and placeholders.
- Style is learned from reference rows 2-101 (clean examples only).
- New rows get the next `SM` ID = highest existing SM number + 1.
- NRI detection includes city-only places (Canada, UK, US states, Gulf, Australia, Europe).
- The API key is stored through the menu in private Script Properties - never in code or the sheet.
- **Never commit sheet exports** - they hold personal profile data (`.gitignore` blocks `*.csv`, `data/`, `exports/`).
- The original script is kept in the Apps Script project as `Backup_OldScript.html` (not executed). Don't delete it.

## Working on it
`node tests/run.js` (mock Apps Script runtime, synthetic profiles). Read-only checks: `tools/audit-sheet.browser.js` (paste in
Chrome DevTools on the sheet) and `tools/analyze_export.py`. Deploy by pasting `apps-script/Code.gs` and `Sidebar.html` into the
bound project (or clasp, see `docs/DEPLOY.md`).

19 Nov 2026: repo copied to GitHub z9mb83 with full history.

## Owner and how to work with him

- Owner: the 99 group of brands (99 Consulting / 99 Marketing Services). Brand codes used everywhere:
  **SB** Shaadi Bells · **99M** 99 Marketing Services · **99S** 99 Staffing Services · **PE** Property Experts Group · **SC** Skyline Capital (business buying/selling).
- The sheets, Apps Script projects and Gmail senders belong to the owner's main Google account (the 99 Marketing "linkwithmarketing" account).
- GitHub: this repo was copied with its full history from `linkwithmarketing-design/<repo>` to `z9mb83/<repo>` on 19 Nov 2026
  (a fresh copy, not a GitHub transfer). The old copy still exists; new work goes to **z9mb83**.
- The owner is not a programmer. Explain in plain words and give the result, not a list of steps you took.
- He wants a simple internal tool, not a product: only what he asks for, as little code and as few files as possible, no Docker or
  other maintenance-heavy setups. Keep old code (move it to `archive/`) instead of deleting it.
- **He does not pay for anything.** Free tiers only (Apps Script, Vercel Hobby, free Cloud Run/Cloud Shell use). No paid GitHub Actions/Codespaces.
- Update `README.md` (and `TROUBLESHOOTING.md` where there is one) with every change, in plain language.

### Hard rules (from the owner, always in force)
- Never commit or print secrets. Keys live in Apps Script **Script Properties**, **Vercel environment variables** or **Secret Manager** - never in code, git or normal sheet cells.
- Never put raw Meta access tokens, Google OAuth refresh tokens or SMS API secrets in spreadsheet cells.
- The owner types API keys, passwords and OAuth / device codes himself. Claude never does.
- No live emails, WhatsApp or SMS to real customers, no production campaign switched on, and no redeploy of the running email service or its scheduler without a separate, explicit go-live instruction.
- Never overwrite existing leads, statuses, approval values or formulas in the sheets. Never delete sheet tabs the automation reads.
- Never force-push or overwrite unrelated work. Work on a branch and open a pull request; **merge only when the owner says "merge"**.
- Do not rotate or destroy production credentials without his authorization.

### How changes usually reach production
Most logic runs in **Google Apps Script**, which is not connected to git. The usual loop (done through Claude in Chrome, signed in to the owner's main Google account):
1. Make the change in the repo file and test it offline (each repo has a `test/` or `tests/` folder).
2. Apply the same change in the Apps Script editor (exact text replacement in the editor, then the **Save project to Drive** button; reload to check it saved).
3. If the script is a web app: **Deploy → Manage deployments → Edit (pencil) → Version: New version → description → Deploy**. Editing the existing deployment keeps the `/exec` URL the same.
4. Commit, push the branch, open a PR, wait for "merge". The repo must always match what is live.
