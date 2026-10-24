# Shaadi Bells – Ads & Instagram Caption Generator

Google Apps Script that writes and repairs matrimonial profile **ads** and **Instagram captions** in the
*15-080-26 Shaadi ads* Google Sheet, from the profile columns of each row.

| Output | Column | Format |
|---|---|---|
| Ad | `Ads` (N) | Plain text, **no emojis**, always the same **13 points** |
| Caption | `Instagram Text & Hashtags` (O) | 💖 Seeking · ✨ Introduction · ✨ Key Highlights · 💌 About · 📞 Call / WhatsApp +917770000559 · **18 hashtags** (4 brand + 6 approved SEO + 8 profile) |
| QA notes | `QA Notes` (P, created automatically) | What was fixed per row + anything that needs a human decision |

The structure is assembled in code, so every row looks the same. The AI (OpenAI `gpt-4o` by default; Gemini and Claude also supported) only writes the short personal sentences, and every AI answer is checked for gender, ages and placeholders before it is used.

## Use it (in the sheet)

Menu **Shaadi Bells AI**:

| Item | What it does |
|---|---|
| 🔑 Set / change secret API key | Stores the key in your Google account's private script properties. It is never stored in the code or the sheet. |
| 🛠 Repair selected rows (quick, no AI) | Keeps the existing wording and fixes known errors, then rebuilds both formats. Free. |
| 🛠 Repair selected rows with AI | Same, plus an AI rewrite into one consistent voice (keeps the facts) |
| ✍ Generate empty rows (AI / template) | Fills only rows whose ad or caption is blank. Rows that have profile data but no ID get the next `SM` number. Continues automatically past Google's 6-minute limit. |
| ♻ Regenerate selected rows | Full rewrite (asks first) |
| ⏹ Stop background run | Cancels the automatic continuation |
| ✅ QA check selected rows | Writes data problems to QA Notes without changing text |
| ⚙ Open settings panel | Voice, tone, length, hashtag count, creativity, gender default, reference rows; "Show options" previews up to 3 AI versions for one row |

Style is learned from the **reference rows 2–101** (clean examples only).

## Repository layout

```
apps-script/Code.gs        the script (paste into Extensions ▸ Apps Script ▸ Code.gs)
apps-script/Sidebar.html   settings panel (HTML file named "Sidebar")
tests/                     Node test suite with a mock Apps Script runtime + synthetic profiles
tools/audit-sheet.browser.js   read-only live audit – paste into Chrome DevTools on the sheet
tools/analyze_export.py        read-only analysis of a CSV export
docs/TROUBLESHOOTING.md    everything found and fixed, in order, plus open decisions
docs/AUDIT-2026-10-22.md   latest audit results
docs/DEPLOY.md             ways to install/update the script (paste, clasp)
CHANGELOG.md
```

## Develop

```bash
node tests/run.js          # 33 checks, no Google account needed
python3 tools/analyze_export.py export.csv
```

Never commit sheet exports — they contain personal profile data (`.gitignore` blocks `*.csv`, `data/`, `exports/`).

## Where things live

- Sheet: `1dGJq2_2qqq31TgprLsXewllmchEzI7dYaR9x4nB8cZU` (Sheet1)
- Apps Script project (bound): `1rCChkWwetgeBh1VDKSZ_OYRa2ppKL9DW1a60TLP3FkFN89bhP4HhH3a-`
- The **original script** (OpenAI, "Repair selected row" / "Generate next rows") is preserved inside the Apps Script project as `Backup_OldScript.html`. It is not executed.
