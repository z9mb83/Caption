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

## All links (updated 19 Nov 2026)

### Live websites (Vercel, team **ACE**, free Hobby plan, signed in with GitHub z9mb83)
| What | Link | Vercel project |
|---|---|---|
| Automation dashboard (WhatsApp, Email, SMS, reports) | https://automation-dashboard-pi-ten.vercel.app | https://vercel.com/ace-5891/automation-dashboard |
| Send WhatsApp / Send Email / Send SMS pages | `.../#send`, `.../#email`, `.../#send-sms` | (same) |
| Task tracker (sign-in: Admin / Task manager / Employee) | https://task-tracker-five-taupe.vercel.app (`/admin`, `/task-manager`, `/employee`) | https://vercel.com/ace-5891/task-tracker |
| Old addresses (old Vercel account, retired; delete when no longer needed) | automation-dashboard-sigma-rose.vercel.app, task-tracker-sable-omega.vercel.app | old account |

Every push to `main` of the z9mb83 repo redeploys that site. Vercel settings (Settings → Environment Variables), values only in Vercel:
- automation-dashboard: `SHEET_API_URL`, `SHEET_API_KEY`, `DASHBOARD_PASSWORD`, `TELINFY_API_KEY`, `SMS_SB_URL`, `SMS_SB_KEY`, `SMS_PE_URL`, `SMS_PE_KEY`
- task-tracker: `APPS_SCRIPT_URL`, `API_SECRET`, `TASK_MANAGER_PIN`
Vercel sometimes asks to "verify your identity" with a 6-digit email code: the owner types it.

### GitHub (owner z9mb83, all private)
unified-communication-automation · automation-dashboard · OCR · task-tracker · Caption · multibrand-comms-platform
(`https://github.com/z9mb83/<repo>`). The old copies under `linkwithmarketing-design` are frozen (they only gained a `claude-md` branch).

### Google Sheets
| Sheet | ID | Links to the websites inside the sheet |
|---|---|---|
| Automation Control Center | `1hiR6ofVNl9lpujWk8T8mGMml53ru0aJwC06NtUdeJTc` | Dashboard tab A2; Settings rows "Web dashboard", "Send SMS page", "Task tracker" |
| Old email sheet (Zoho_Email_Automation) | `18hjldwZeoQ8Y99ngc02OVpoT_4Pe1rM0nNhS2KPxfOI` | - |
| Shaadi OCR (SMS for SB) | `1FRZ7ErIx9vzN_dA-7eDjvQPyMUIMocGbFieL42G3LxE` | tab **Links** |
| Property OCR / "Property NeoDove" (SMS for PE) | `1LRXRZ2TTRe8lCP5kPOYUvpA4cispuTRN3LgnYdaJSoE` | tab **Links** |
| Task Tracker - Admin | `15qoYFLskj8dv4TD7TVKXkHbWbUQ_IYb4A0ZLZEduspc` | tab **Links**; Settings "Dashboard URL" (used in emails) |
| Task Tracker - Employees | `1Ft_mVNu-PIsqbi6rKHFfqYs8RweE6gWtCAUUJgapM5c` | none on purpose: its script treats every tab as an employee tab |
| 15-080-26 Shaadi ads (Caption) | `1dGJq2_2qqq31TgprLsXewllmchEzI7dYaR9x4nB8cZU` | - |

### Apps Script projects and web apps
| Project | Script ID | Web app `/exec` (needs `?key=`) |
|---|---|---|
| Automation Control Center | `1bqg1MgA09MZcD2Fai-Jq5s-j88dmqNOEkIL55BlIGTcpHvVNuyWG8Ws0` | `https://script.google.com/macros/s/AKfycbwJXy-XZJsxRQXFFrtJXCgCY0JEyaKOC3Dz6kYqGcwxy5kvONm3HZ46gXNvNlz1oU6EwA/exec` (version 17) |
| Shaadi OCR | `1UZ04niHn9lSIYWlFROnrVdxOTB-1cp1XS39W-gPf4kOtvGpIyI_xRLFT` | `https://script.google.com/macros/s/AKfycbw_1-mVno9v_R1rRFt-Yzk-N_j_n4BO_LVxMZU3ihf8YfrAwKiLCPOQUUwt3BexZehJ/exec` (SmsApi) |
| Property OCR | `1bR4FXxcLlzGWRnpmwnc7bseM-Ipd7DX4i-9113v8x1jMIdKl0I9mV0R3` | `https://script.google.com/macros/s/AKfycbzCR8mhq3dwwFfmAQloP_hQP9yNzNV6F7AlOe9TlvPPOXNDieCV6tFDxouhqnmYPHec/exec` (SmsApi) |
| Caption | `1rCChkWwetgeBh1VDKSZ_OYRa2ppKL9DW1a60TLP3FkFN89bhP4HhH3a-` | - |
| Task tracker | bound to Task Tracker - Admin (open with Extensions → Apps Script) | link only in Vercel `APPS_SCRIPT_URL`; do not make a new one ("Set up Vercel connection" rotates the secret) |

**Emails must always go from the linkwithmarketing Google account.** Task-tracker emails are sent by its Apps Script as the
account that deployed its web app / created its triggers (linkwithmarketing): never redeploy that web app or recreate its
triggers from another account. The SMS web apps were deployed from the PropertyExperts Admin Google account; they send no email.

## How work reaches z9mb83 (no direct push from a Claude session)
A Claude session may only have the old `linkwithmarketing-design` repos attached. What worked on 19 Nov 2026:
1. Claude commits on a branch locally and makes a git bundle (`git bundle create x.bundle <base>..<branch>`), sends the file.
2. The owner uploads it in **Cloud Shell** (z9mb83 Chrome profile, ⋮ → Upload). Cloud Shell's `gh` is logged in as z9mb83
   (device code typed by the owner in the z9mb83 GitHub profile).
3. Claude types in Cloud Shell: `git fetch ~/x.bundle <branch>:<branch> && git push -u origin <branch> && gh pr create ...`.
   Long typed commands freeze the Chrome tab for ~30 s but still run; keep each under ~300 characters.
4. Merge only after the owner says "merge" (`gh pr merge N -R z9mb83/<repo> --merge`).
If the z9mb83 repo is attached to the session directly, just push a branch and open a PR as usual.

## History of this work (chat with the owner, Sep-Nov 2026)
- Sep-Oct: email automation moved to the Automation Control Center sheet; WhatsApp (Meta templates) and SMS (Telinfy) built;
  SMS parked in the master sheet, live in the separate OCR sheets; task tracker (Sheets + Vercel) and Caption generator built;
  `multibrand-comms-platform` (FastAPI/Postgres) abandoned for the free sheet-based tool.
- 11-13 Nov: `<BRAND> Mail` / `<BRAND> WhatsApp` working tabs (yellow = type, white = live list). WhatsApp white list aligned
  row-by-row with yellow (vectorised XLOOKUP).
- Nov: SB WhatsApp duplicates removed (173,550 → 73,749 rows); 8,885 verified SB numbers set to consent Yes; WhatsApp sends sped up
  (buffered log/status writes, no flush); "Failed to fetch" report fixed with a cached report; WhatsApp cap 2,000 per brand per day.
- 17 Nov: dashboard restructured (Home, Send WhatsApp, Send Email, Reports & costs; analytics off the menu), upload CSV/XLSX +
  "Send next 30" WhatsApp / "Send next 25" email, brand cards with logos, blue + pastel pink theme; read-only dashboard calls
  skip the script lock (web app v17).
- 19 Nov: all 6 repos copied to z9mb83 with full history (git bundles pushed from Cloud Shell) and these CLAUDE.md files added;
  new Vercel projects (team ACE) for the dashboard and the task tracker with the same data (data lives in the sheets, not Vercel);
  dashboard **Send SMS** page (Send next 100 for SB/PE through the OCR sheets' own sender, `SmsApi.gs` web apps);
  links to the new sites put in the sheets (Links tabs, ACC Dashboard A2 + Settings, Task Tracker Settings "Dashboard URL").
- Still open: delete the old Vercel projects once everyone uses the new links; the old `linkwithmarketing-design` repos can be archived.

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
