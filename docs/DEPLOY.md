# Installing / updating the script

The script is **container-bound** to the sheet (Extensions ▸ Apps Script). Pick one way.

## A. Paste (simplest)

1. In the sheet, open **Extensions ▸ Apps Script**.
2. Open `Code.gs`, select everything, and paste `apps-script/Code.gs`.
3. In `Sidebar.html` (create it with **+ ▸ HTML**, name `Sidebar`), paste `apps-script/Sidebar.html`.
4. Save (Ctrl+S) and reload the sheet. The **Shaadi Bells AI** menu appears.
5. The first time you click a menu item, Google asks you to authorise the script once.

## B. clasp (command line)

```bash
npm i -g @google/clasp
clasp login
cp .clasp.json.example .clasp.json      # scriptId already filled in
clasp pull                               # first time: fetches appsscript.json manifest
# copy apps-script/Code.gs and Sidebar.html into the clasp folder (rootDir), then:
clasp push
```

`clasp pull` brings down the project's real `appsscript.json`. Don't replace it with a guessed one.

## C. What was done on 21–22 Oct (browser automation)

The editor's Monaco model was replaced with the file contents, sent in parts of about 7 KB. Each part and the whole file were checked with a fingerprint before saving:

```js
// same hash in Python: h = (h*31 + ord(ch)) & 0xffffffff over code points
const fp = s => { let h = 0; for (const ch of s) h = (Math.imul(h, 31) + ch.codePointAt(0)) >>> 0; return h; };
```

After saving, the editor was reloaded and the fingerprint was checked again. Small fixes were applied the same way: find and replace in the model, then fingerprint, save, reload and re-check.

## After updating

- Run `node tests/run.js` **before** pasting.
- After a change to tag or category rules, run **Repair selected rows (quick)** on the affected rows. Existing text is only rebuilt when a row is repaired.
