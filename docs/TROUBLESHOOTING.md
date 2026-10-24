# Troubleshooting log

Everything found and fixed while cleaning up the Shaadi Bells ads sheet, in order.
IDs refer to the *Registration number* column; row numbers are sheet rows.

---

## 1. Initial audit of the sheet (21 Oct 2026)

Sheet1 had 600 filled rows: 586 profile rows, 6 repeated header rows and 8 section-label rows. There were 565 unique IDs (SM196367–SM196933, with gaps at SM196521 and SM196624).

| # | Problem | Scale | Examples |
|---|---|---|---|
| 1 | Pronouns contradict the Boy/Girl label ("our son" in girls' sections and vice versa) | 34 rows | SM196426, SM196799, SM196884; the whole "Aggrawal Boys" block holds women's profiles |
| 2 | Duplicate IDs | 13 IDs / 30 rows | SM196652–659 ×3, SM196632–635 ×2, SM196784 ×2 |
| 3 | Placeholder ads ("Date of Birth: —") on section-label and empty rows | 15 rows | label rows, SM196418, SM196572, SM196623, SM196731 |
| 4 | Ages hard-coded as of 2023 (now 3 years wrong) | 56 mentions | SM196429 "Age 23" for a 2000 birth year |
| 5 | Job seniority implausible for age | 15–28 rows | Equity Partner / CTO born 2001–02 |
| 6 | Education copied from a lookup list ("X or Y", "No formal degree required…") | ~18 rows | SM196387–415 |
| 7 | Three voices mixed (first person / third person / parents') | all | — |
| 8 | Typos and inconsistent formats | many | "Bussinessman" (32), "chool principal", "Kharti Boys", 8 height formats, 3 ID formats |
| 9 | Caption defects | various | `#customhashtag1` (SM196425, SM196437), "💖 Seeking" twice (8 rows), hyphens stripped ("closeknit" in 92 rows), wrong-community hashtags |
| 10 | Ads in two layouts (15 points vs 13 points) | 417 / 157 rows | — |
| 11 | Sheet2 lookup lists misaligned (professions vs hobby pairs) | — | likely source of #5/#6 |

## 2. Original script reviewed

The original bound script ("Shaadi Bells" menu) used OpenAI gpt-4o with the key pasted into the code. Features it had that were kept:

- an approved list of 48 SEO hashtags in a 4 brand + 6 SEO + 8 custom split
- automatic `SM` numbering for new rows (highest ID + 1, starting at SM196367)
- NRI and divorce/second-marriage detection
- automatic continuation after the 6-minute limit (a time trigger)
- a lock against overlapping runs
- the Ads column as a data source when profile cells are blank

It was backed up as `Backup_OldScript.html` in the Apps Script project before being replaced.

## 3. New script – design decisions

| Decision | Why |
|---|---|
| Structure built in code, AI writes only sentences | Every row has identical format, and the AI cannot drop sections |
| Ad = 13 points, no emojis; caption = emoji sections | Client requirement |
| Key in `PropertiesService` (user scope) via menu | No key in source or sheet |
| Temperature 0.3 plus a fixed seed per ID | The same row gives the same wording on re-runs |
| Validation → retry once → template fallback | Wrong-gender, age or placeholder AI replies never reach the sheet |
| Gender from ID label ("Boy - …") → nearest section heading → default | The data has no gender column |
| Quick repair keeps the existing wording | Fixes known errors without paying for AI on 580 rows |

## 4. Installation issues

| Issue | Fix |
|---|---|
| The Chrome connection dropped while sending 75 KB of code in 5 large parts | Re-sent in 14 parts of about 7 KB, each verified by a fingerprint (length + 31-hash) before the editor was replaced. See `docs/DEPLOY.md`. |
| Old "Shaadi Bells" menu still visible | Replaced by the new `onOpen`. The old menu disappears after reload. |
| Leftover time triggers from the old script could call removed functions | Checked: none existed. `clearContinuation_()` also deletes the old `generateInstagramForEmptyColumnO` trigger name. |

## 5. Bulk repair run (22 Oct 2026)

- "Generate empty rows" found only the 4 stub rows SM196632–635, which have no profile data, so nothing was generated.
- Quick repair was run on rows 2–1120 from the settings panel, which processes rows in batches with no time limit.

| Fix | Rows |
|---|---|
| Ad reduced to 13 points | 413 |
| Background missing from the ad, written from the row's data | ~160 |
| Spellings fixed | 254 |
| Hyphens restored | 112 |
| Emojis removed from sentences | 77 |
| Pronouns corrected to match the label (flagged "VERIFY gender") | 34 |
| Duplicate Seeking merged | 8 |
| Placeholder hashtags removed | 3 |

## 6. Bugs found by the audit and fixed (22–24 Oct 2026)

| Bug | Cause | Fix | Commit |
|---|---|---|---|
| 26 NRI profiles had no #NRIMatrimony tag and got "…InIndia" tags | Places were city-only (Mississauga, Montreal, Fremont (CA), Riyadh, Milan…) | Added Canadian/UK/US (state codes)/Gulf/Australian/European cities; re-ran repair on rows 108–209 | "Fix NRI city detection" |
| 25 captions had 17 hashtags | The "InIndia" SEO fillers were correctly skipped for NRI rows, but the custom slots didn't grow to compensate | `nCustom = limit − core − seo` | same |
| New ID would be SM196367 if every existing ID were lower | `max(196366, …)` instead of "highest ID, else 196366" | Matches the original script's rule (found by the test suite) | "Next-ID rule" |

## 7. Open decisions (need the sheet owner)

1. **Rows 108–157 (SM196471–520) have no section label.** They have their own header row but no "Boys/Girls" heading, so the script treats them as part of "Jatt Girls". Their text is mixed son/daughter, and several schools are boys' schools. SM196479 and SM196494 were changed son → daughter by the repair. **Fix:** add a label row (e.g. "Jatt NRI Boys") or a `Gender` column, then run Repair on those rows.
2. **Stub/empty rows** SM196418, SM196572, SM196623, SM196731 still show old placeholder ads. Fill them in or delete them.
3. **Duplicate IDs** (30 rows): renumber.
4. **Voice is still mixed** (first person 366 / third person 189 / parents' 19 / mixed 8), because quick repair keeps the original sentences. Run *Repair with AI* on all rows to unify (~580 AI calls).
5. **Profile data**: 28 rows have a job that looks senior for the age; 18 have "X or Y" education. See QA Notes.

## 8. How to check things yourself

- **Live audit:** open the sheet → F12 → Console → paste `tools/audit-sheet.browser.js`.
- **Export analysis:** File ▸ Download ▸ CSV → `python3 tools/analyze_export.py file.csv`.
- **Code change:** `node tests/run.js` must pass before pasting into Apps Script.
- **Undo a bulk run:** File ▸ Version history in the sheet.
