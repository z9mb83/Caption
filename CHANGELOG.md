# Changelog

## 1.3.1 – 2026-10-24
- Next-ID rule matches the original script: the highest existing `SM` number + 1 (SM196367 only when the sheet has no IDs). Found by the new test suite.
- Added a Node test suite (mock Apps Script runtime, synthetic profiles), a live audit tool, an export analyser and docs.

## 1.3.0 – 2026-10-22
- NRI detection now recognises city-only places (Canada, UK, US with state codes, Gulf, Australia, Europe). 26 profiles were fixed.
- The hashtag total is always the configured count (default 18), even when fewer SEO tags apply.
- Settings panel labels say "Ad (13 points)".

## 1.2.0 – 2026-10-21
- Kept everything the original script did: 48 approved SEO hashtags (4 + 6 + 8 split), automatic `SM` IDs for new rows, NRI/divorce detection and prompts, auto-continue past the 6-minute limit, run lock, the Ads text used as a data source when cells are blank.
- OpenAI `gpt-4o` is the default provider.
- The original script is preserved as `Backup_OldScript.html` in the project.

## 1.1.0 – 2026-10-21
- Ads use a fixed 13-point layout with no emojis. Captions have emoji sections, the phone number and hashtags.
- One-click **Repair** (quick, or with AI) keeps the existing wording, fixes gender, ages, typos, hyphens, duplicate "Seeking" and placeholder tags, then rebuilds both formats.
- 🔑 menu item for the secret API key (stored privately).
- Consistent output: temperature 0.3 plus a fixed seed per profile ID.

## 1.0.0 – 2026-10-21
- First generator: reads columns by header name, learns style from rows 2–101, profile-specific (AI) or template captions, validation with retry and fallback, QA Notes, settings panel with "Show options".
