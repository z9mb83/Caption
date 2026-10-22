/**
 * Shaadi Bells – Profile Ad & Instagram Caption Generator
 * --------------------------------------------------------
 * Google Sheets bound Apps Script (Extensions ▸ Apps Script).
 *
 *  • Reads each profile row by HEADER NAME (works even if columns move or
 *    headers say "Residence" / "Birth Place" / "Place Of Residence").
 *  • Learns tone + structure from the reference rows (default rows 2–101).
 *  • Writes two kinds of captions:
 *      - Profile-specific (AI): personalised Seeking / Introduction / hashtags.
 *      - Generic (no AI): brand template filled from the row – works offline.
 *  • Two fixed formats, assembled in code so every row looks the same:
 *      - AD (column "Ads"): plain text, NO emojis, always the same 13 points.
 *      - CAPTION (Instagram): emoji sections, Key Highlights, phone, hashtags.
 *    The AI only writes the short personal sentences.
 *  • One-click menu: Repair selected rows (keeps existing wording, fixes
 *    errors, rebuilds both formats) and Generate empty rows.
 *  • Consistent results: low temperature + a fixed seed per profile ID.
 *  • Every AI result is checked (gender pronouns, no hard-coded ages,
 *    no placeholders, length) and retried once, else falls back to generic.
 *
 * The API key is NEVER stored in code – it is saved per user in
 * PropertiesService (Shaadi Bells AI ▸ Settings, or the sidebar).
 */

// ───────────────────────────── Brand constants ─────────────────────────────
var BRAND = {
  name: 'Shaadi Bells Matrimonial Solutions',
  phone: '+917770000559',
  about: 'Personal | Professional | Confidential – Trusted Connections for a Brighter Tomorrow.',
  baseTags: ['#shaadibells', '#matrimonialsolutions', '#jeevansathi', '#shaadi'],
  premiumTags: ['#PremiumMatrimonyServices', '#HighProfileMatrimony', '#MatrimonyInIndia']
};

var DEFAULT_OPTS = {
  provider: 'openai',            // openai | gemini | anthropic
  model: '',                     // blank = provider default
  generate: 'both',              // both | caption | ads
  captionType: 'specific',       // specific | generic | both
  rows: 'selected',              // selected | empty | all | range
  rangeFrom: 2,
  rangeTo: 101,
  overwrite: false,
  voice: 'third',                // third | parent | first
  tone: 'warm',                  // warm | premium | concise
  length: 'standard',            // short | standard | long
  emojis: true,
  hashtagCount: 18,
  temperature: 0.3,               // low = consistent wording
  defaultGender: 'auto',         // auto | M | F
  cleanData: true,
  writeQA: true,
  writeGender: false,
  refFrom: 2,
  refTo: 101,
  variants: 3,
  repairAI: false,
  sheetName: 'Sheet1'            // blank = active sheet
};

var DEFAULT_MODELS = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5'
};

// Header aliases → internal field names (case/space-insensitive, first match wins)
var FIELD_PATTERNS = {
  id:         [/^registration/, /^reg(istration)?\s*(no|number|id)/, /^profile\s*id/],
  gender:     [/^gender$/, /^sex$/, /^boy\s*\/\s*girl/],
  dob:        [/^date\s*of\s*birth/, /^dob$/, /^birth\s*year/, /^year\s*of\s*birth/],
  place:      [/^residence/, /^place\s*of\s*residence/, /^birth\s*place/, /^city/, /^location/],
  height:     [/^height/],
  caste:      [/^caste/, /^community/],
  education:  [/^education/, /^qualification/],
  schooling:  [/^school/],
  college:    [/^college/, /^university/],
  occupation: [/^occupation/, /^job/, /^profession/],
  background: [/^background/],
  father:     [/^father/],
  hobbies:    [/^hobb/, /^interests/],
  mother:     [/^mother/],
  ads:        [/^ads?$/, /^ad\s*text/, /^profile\s*ad/],
  caption:    [/^instagram/, /^caption/],
  generic:    [/^generic\s*caption/],
  qa:         [/^qa/, /^check/]
};

// ────────────────────────────────── Menu ───────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Shaadi Bells AI')
    .addItem('🔑 Set / change secret API key', 'menuSetApiKey')
    .addSeparator()
    .addItem('🛠 Repair selected rows (quick, no AI)', 'menuRepairQuick')
    .addItem('🛠 Repair selected rows with AI (fixes gender/voice too)', 'menuRepairAI')
    .addSeparator()
    .addItem('✍ Generate empty rows (AI)', 'menuGenerateEmptyAI')
    .addItem('✍ Generate empty rows (no AI, template)', 'menuGenerateEmptyGeneric')
    .addItem('♻ Regenerate selected rows (AI, overwrite)', 'menuRegenerateSelected')
    .addItem('⏹ Stop background run', 'menuStopBackground')
    .addSeparator()
    .addItem('✅ QA check selected rows', 'menuQASelected')
    .addItem('⚙ Open settings panel', 'showSidebar')
    .addItem('Reload reference style (rows 2–101)', 'menuRefreshReference')
    .addToUi();
}

function onInstall() { onOpen(); }

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Shaadi Bells – Ads & Captions');
  SpreadsheetApp.getUi().showSidebar(html);
}

function menuSetApiKey() {
  var ui = SpreadsheetApp.getUi();
  var opts = getOptions();
  var pr = ui.prompt('Secret API key – step 1 of 2',
    'Which AI provider? Type: gemini, openai or anthropic\n(currently: ' + opts.provider +
    (hasApiKey(opts.provider) ? ', key saved' : ', no key yet') + ')', ui.ButtonSet.OK_CANCEL);
  if (pr.getSelectedButton() !== ui.Button.OK) return;
  var provider = (pr.getResponseText().trim().toLowerCase() || opts.provider);
  if (!DEFAULT_MODELS[provider]) { ui.alert('Unknown provider "' + provider + '". Use gemini, openai or anthropic.'); return; }
  var r = ui.prompt('Secret API key – step 2 of 2',
    'Paste the ' + provider + ' API key.\nIt is stored privately for your Google account (not in the script, not in the sheet).\nType DELETE to remove the saved key.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var key = r.getResponseText().trim();
  if (!key) return;
  if (key === 'DELETE') { PropertiesService.getUserProperties().deleteProperty('sb_key_' + provider); ui.alert('Key removed.'); return; }
  saveApiKey(provider, key);
  opts.provider = provider; saveOptions(opts);
  try { ui.alert('Saved ✓  ' + testConnection(opts)); }
  catch (e) { ui.alert('Key saved, but the test call failed:\n' + (e.message || e)); }
}

/** Runs a one-click job on the current options with a few overrides. */
function runMenuJob_(over, mode) {
  var o = getOptions();
  for (var k in over) o[k] = over[k];
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) { notify_('Another run is already in progress – try again in a minute.'); return; }
  try {
    var started = Date.now();
    var ctx = getContext_(o);
    var rows = targetRows_(ctx);
    if (!rows.length) { clearContinuation_(); notify_('No matching rows.'); return; }
    var done = 0, problems = 0;
    for (var i = 0; i < rows.length; i++) {
      if (Date.now() - started > 270000) break;                    // stay inside the 6-min limit
      try {
        var msg = mode === 'repair' ? repairRow_(ctx, rows[i]) : processRow_(ctx, rows[i]);
        if (/⚠|ERROR/.test(msg)) problems++;
      } catch (e) {
        if (/API key|error 40[13]/.test(String(e.message))) { clearContinuation_(); notify_(e.message, true); return; }
        problems++;
      }
      done++;
      if (done % 5 === 0) notify_(done + ' / ' + rows.length + ' rows…');
    }
    SpreadsheetApp.flush();
    var more = done < rows.length;
    // "Generate empty rows" continues by itself in the background (like the original script).
    if (more && o.rows === 'empty') scheduleContinuation_(over); else if (o.rows === 'empty') clearContinuation_();
    notify_(done + ' of ' + rows.length + ' rows done' + (problems ? ' · ' + problems + ' need a look (see QA Notes)' : '') +
      (more ? (o.rows === 'empty' ? ' · continuing automatically in 1 minute' : ' · time limit – click again to continue') : ''));
  } finally {
    lock.releaseLock();
  }
}

function notify_(msg, alert) {
  try {
    if (alert) SpreadsheetApp.getUi().alert(msg);
    else SpreadsheetApp.getActive().toast(msg, 'Shaadi Bells AI', 8);
  } catch (e) { console.log(msg); }   // no UI when running from a trigger
}

function scheduleContinuation_(over) {
  clearContinuation_();
  PropertiesService.getDocumentProperties().setProperty('sb_continue', JSON.stringify(over || {}));
  ScriptApp.newTrigger('continueGenerateEmpty_').timeBased().after(60 * 1000).create();
}

function clearContinuation_() {
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      var h = t.getHandlerFunction();
      if (h === 'continueGenerateEmpty_' || h === 'generateInstagramForEmptyColumnO') ScriptApp.deleteTrigger(t);
    });
  } catch (e) {}
}

/** Trigger handler – resumes "Generate empty rows". */
function continueGenerateEmpty_() {
  var saved = PropertiesService.getDocumentProperties().getProperty('sb_continue');
  runMenuJob_(saved ? JSON.parse(saved) : { rows: 'empty', generate: 'both', captionType: 'specific', overwrite: false });
}

/** Stops any background continuation. */
function menuStopBackground() { clearContinuation_(); notify_('Background run stopped.'); }

function menuRepairQuick() { runMenuJob_({ rows: 'selected', repairAI: false }, 'repair'); }
function menuRepairAI() { runMenuJob_({ rows: 'selected', repairAI: true }, 'repair'); }
function menuGenerateEmptyAI() { runMenuJob_({ rows: 'empty', generate: 'both', captionType: 'specific', overwrite: false }); }
function menuGenerateEmptyGeneric() { runMenuJob_({ rows: 'empty', generate: 'both', captionType: 'generic', overwrite: false }); }
function menuRegenerateSelected() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('Regenerate selected rows?', 'This replaces the existing Ads and Instagram text in the selected rows.', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  runMenuJob_({ rows: 'selected', generate: 'both', captionType: 'specific', overwrite: true });
}
function menuGenerateSelected() { runMenuJob_({ rows: 'selected' }); }
function menuGenericSelected() { runMenuJob_({ rows: 'selected', captionType: 'generic' }); }

function menuQASelected() {
  var ctx = getContext_(getOptions());
  var rows = selectedRows_(ctx);
  var n = 0;
  rows.forEach(function (r) {
    var p = readProfile_(ctx, r);
    if (!p) return;
    writeCell_(ctx, r, 'qa', qaCheck_(p, ctx).join('; ') || 'OK', true);
    n++;
  });
  SpreadsheetApp.getActive().toast(n + ' rows checked', 'Shaadi Bells AI');
}
function menuRefreshReference() {
  CacheService.getDocumentCache().remove('sb_ref_v3');
  var ctx = getContext_(getOptions());
  var refs = getReferences_(ctx);
  SpreadsheetApp.getActive().toast(refs.length + ' clean reference examples loaded', 'Shaadi Bells AI');
}

// ─────────────────────────── Options & API key ─────────────────────────────
function getOptions() {
  var saved = PropertiesService.getUserProperties().getProperty('sb_opts');
  var o = JSON.parse(JSON.stringify(DEFAULT_OPTS));
  if (saved) { try { var s = JSON.parse(saved); for (var k in s) o[k] = s[k]; } catch (e) {} }
  return o;
}

function saveOptions(o) {
  var clean = {};
  for (var k in DEFAULT_OPTS) if (o && o[k] !== undefined) clean[k] = o[k];
  PropertiesService.getUserProperties().setProperty('sb_opts', JSON.stringify(clean));
  return getOptions();
}

function saveApiKey(provider, key) {
  PropertiesService.getUserProperties().setProperty('sb_key_' + provider, String(key).trim());
  return true;
}

function hasApiKey(provider) {
  return !!PropertiesService.getUserProperties().getProperty('sb_key_' + provider);
}

/** Data the sidebar needs on load. */
function getPanelState() {
  var o = getOptions();
  var sh = SpreadsheetApp.getActiveSheet();
  return {
    opts: o,
    keys: { gemini: hasApiKey('gemini'), openai: hasApiKey('openai'), anthropic: hasApiKey('anthropic') },
    defaultModels: DEFAULT_MODELS,
    sheet: sh.getName(),
    activeRow: sh.getActiveRange() ? sh.getActiveRange().getRow() : 2
  };
}

function testConnection(opts) {
  opts = mergeOpts_(opts);
  var out = callLLM_(opts, 'Reply with JSON only.', 'Return {"ok": true}', 0);
  return out && out.ok ? 'Connected ✓ (' + (opts.model || DEFAULT_MODELS[opts.provider]) + ')' : 'Unexpected reply';
}

function mergeOpts_(o) {
  var base = getOptions();
  if (o) for (var k in o) base[k] = o[k];
  base.hashtagCount = Math.max(8, Math.min(30, Number(base.hashtagCount) || 18));
  base.variants = Math.max(1, Math.min(3, Number(base.variants) || 3));
  base.temperature = Math.max(0, Math.min(1.2, Number(base.temperature)));
  if (isNaN(base.temperature)) base.temperature = 0.3;
  return base;
}

// ─────────────────────────── Sheet context ─────────────────────────────────
function getContext_(opts) {
  opts = mergeOpts_(opts);
  var ss = SpreadsheetApp.getActive();
  var sh = opts.sheetName ? ss.getSheetByName(opts.sheetName) : ss.getActiveSheet();
  if (!sh) throw new Error('Sheet not found: ' + opts.sheetName);
  var lastCol = sh.getLastColumn();
  var header = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var cols = mapHeaders_(header);
  if (!cols.id) throw new Error('Could not find a "Registration number" column in row 1.');
  if (!cols.caption) cols.caption = ensureColumn_(sh, header, 'Instagram Text & Hashtags');
  if (!cols.ads) cols.ads = ensureColumn_(sh, header, 'Ads');
  if (opts.writeQA && !cols.qa) cols.qa = ensureColumn_(sh, header, 'QA Notes');
  if (opts.captionType === 'both' && !cols.generic) cols.generic = ensureColumn_(sh, header, 'Generic Caption');
  if (opts.writeGender && !cols.gender) cols.gender = ensureColumn_(sh, header, 'Gender');

  var lastRow = Math.max(2, sh.getLastRow());
  var colA = sh.getRange(1, cols.id, lastRow, 1).getDisplayValues().map(function (r) { return r[0]; });
  return {
    opts: opts, sheet: sh, cols: cols, lastRow: lastRow,
    sections: buildSections_(colA),
    idCounts: countIds_(colA),
    year: new Date().getFullYear()
  };
}

function normHeader_(h) { return String(h || '').toLowerCase().replace(/[\s_]+/g, ' ').trim(); }

function mapHeaders_(header) {
  var cols = {};
  var normed = header.map(normHeader_);
  Object.keys(FIELD_PATTERNS).forEach(function (field) {
    for (var c = 0; c < normed.length; c++) {
      if (!normed[c]) continue;
      if (FIELD_PATTERNS[field].some(function (re) { return re.test(normed[c]); })) {
        if (!cols[field]) { cols[field] = c + 1; break; }
      }
    }
  });
  // "Generic Caption" must not be mistaken for the main caption column.
  if (cols.caption && cols.generic && cols.caption === cols.generic) {
    for (var c2 = 0; c2 < normed.length; c2++) {
      if (/^instagram/.test(normed[c2])) { cols.caption = c2 + 1; break; }
    }
  }
  return cols;
}

function ensureColumn_(sh, header, title) {
  var col = header.length + 1;
  sh.getRange(1, col).setValue(title).setFontWeight('bold');
  header.push(title);
  return col;
}

/** For each row: label of the nearest section row above it (e.g. "Jatt Girls"). */
function buildSections_(colA) {
  var out = [], cur = '';
  for (var i = 0; i < colA.length; i++) {
    var a = String(colA[i] || '').trim();
    if (i > 0 && a && !/SM\d+/i.test(a) && !/^registration/i.test(a)) cur = a;
    out.push(cur);
  }
  return out;
}

function countIds_(colA) {
  var c = {};
  colA.forEach(function (a) { var m = String(a).match(/SM\d+/i); if (m) c[m[0].toUpperCase()] = (c[m[0].toUpperCase()] || 0) + 1; });
  return c;
}

var AD_LABELS = { dob: 'Date of Birth', place: '(?:Residence|Birth Place|Place of Residence)', height: 'Height', caste: 'Caste',
  education: 'Education', schooling: 'Schooling', college: 'College / University', occupation: 'Occupation / Job',
  father: 'Father', mother: 'Mother', hobbies: 'Hobbies / Interests' };

/** Value of "N. Label: value" in an existing ad (the old script's primary source). */
function adField_(ads, field) {
  var re = new RegExp('^\\s*\\d+\\.\\s*' + AD_LABELS[field] + '\\s*:\\s*(.+)$', 'im');
  var m = String(ads || '').match(re);
  var v = m ? m[1].trim() : '';
  return /^(—|-|n\/a|date of birth|residence|height|caste)$/i.test(v) ? '' : v;
}

/** Profile rows without an ID get the next SM number (like the original script). */
function nextId_(ctx) {
  if (!ctx.maxId) {
    var max = 196366;                                   // first generated ID = SM196367
    Object.keys(ctx.idCounts).forEach(function (k) { var n = parseInt(k.slice(2), 10); if (n > max) max = n; });
    ctx.maxId = max;
  }
  ctx.maxId++;
  return 'SM' + ctx.maxId;
}

function profileFieldCount_(get) {
  return ['dob', 'place', 'education', 'occupation', 'father', 'mother', 'hobbies', 'college']
    .filter(function (f) { return get(f); }).length;
}

function readProfile_(ctx, row, assignId) {
  var sh = ctx.sheet, lastCol = sh.getLastColumn();
  var vals = sh.getRange(row, 1, 1, lastCol).getDisplayValues()[0];
  var get = function (f) { return ctx.cols[f] ? String(vals[ctx.cols[f] - 1] || '').trim() : ''; };
  var rawId = get('id');
  var m = rawId.match(/SM\d+/i);
  var id = m ? m[0].toUpperCase() : '';
  if (!m) {
    if (rawId || profileFieldCount_(get) < 3) return null;   // header / section / blank row
    if (!assignId) return null;
    id = nextId_(ctx);
    sh.getRange(row, ctx.cols.id).setValue(id);
    rawId = id; ctx.idCounts[id] = 1;
  }
  var p = {
    row: row, rawId: rawId, id: id,
    dob: get('dob'), place: get('place'), height: get('height'), caste: get('caste'),
    education: get('education'), schooling: get('schooling'), college: get('college'),
    occupation: get('occupation'), background: get('background'), father: get('father'),
    hobbies: get('hobbies'), mother: get('mother'),
    existingAds: get('ads'), existingCaption: get('caption'), genderCell: get('gender'),
    section: ctx.sections[row - 1] || ''
  };
  Object.keys(AD_LABELS).forEach(function (f) { if (!p[f]) p[f] = adField_(p.existingAds, f); });
  p.gender = detectGender_(p, ctx.opts.defaultGender);
  p.notes = [];
  if (ctx.opts.cleanData) cleanProfile_(p);
  p.community = communityOf_(p.caste);
  p.category = categoryOf_(p);
  return p;
}

function detectGender_(p, fallback) {
  var g = p.genderCell.toLowerCase();
  if (/^(m|male|boy|groom)$/.test(g)) return 'M';
  if (/^(f|female|girl|bride)$/.test(g)) return 'F';
  if (/\b(boy|groom|male)\b/i.test(p.rawId)) return 'M';
  if (/\b(girl|bride|female)\b/i.test(p.rawId)) return 'F';
  if (/\b(boys?|grooms?|male)\b/i.test(p.section)) return 'M';
  if (/\b(girls?|brides?|female)\b/i.test(p.section)) return 'F';
  if (fallback === 'M' || fallback === 'F') return fallback;
  return 'M';   // reference section (rows 2–53) is boys
}

// ─────────────────────────── Data cleaning ─────────────────────────────────
var SPELLING_FIXES = [
  [/\bBu[si]{1,3}n[ei]ss?\s*man\b/gi, 'Businessman'],
  [/\bBu[si]{1,3}n[ei]ss\b/gi, 'Business'],
  [/\(\s+/g, '('], [/\s+\)/g, ')'], [/,(?=\S)/g, ', '],
  [/^chool\b/i, 'School'],
  [/\bKharti\b/g, 'Khatri'],
  [/\s{2,}/g, ' ']
];

function fixSpelling_(s) {
  s = String(s || '');
  SPELLING_FIXES.forEach(function (f) {
    s = s.replace(f[0], function (w) { return /^[a-z]/.test(w) && /^[A-Z]/.test(f[1]) && /\w/.test(w) ? f[1].toLowerCase() : f[1]; });
  });
  return s.replace(/\s+,/g, ',').trim();
}

function normalizeHeight_(h) {
  var s = String(h || '').trim();
  var m = s.match(/(\d)\s*(?:'|’|ft|feet|‘)\s*(\d{1,2})?/i);
  if (!m) return s;
  var inch = m[2] ? parseInt(m[2], 10) : 0;
  if (inch > 11) return s;
  return m[1] + '\'' + inch + '"';
}

function cleanProfile_(p) {
  ['place', 'caste', 'education', 'schooling', 'college', 'occupation', 'father', 'mother', 'hobbies']
    .forEach(function (f) { p[f] = fixSpelling_(p[f]); });
  p.height = normalizeHeight_(p.height);
  if (/^(mother|father|n\/?a|-|—)$/i.test(p.mother)) { p.notes.push('Mother field is a placeholder'); p.mother = ''; }
  if (/^(mother|father|n\/?a|-|—)$/i.test(p.father)) { p.notes.push('Father field is a placeholder'); p.father = ''; }
  // Education copied from a lookup list: "X or Y", "No formal degree required…"
  if (/no formal degree/i.test(p.education)) {
    p.notes.push('Education is a placeholder ("No formal degree…")');
    p.education = p.education.replace(/no formal degree required\s*\(?/i, '').replace(/optional\)?/i, '').trim();
  }
  if (/\s(or)\s/i.test(p.education)) {
    p.notes.push('Education lists options – pick one');
    p.education = p.education.split(/\s+or\s+/i)[0].replace(/[\/→+,\s]+$/, '').trim();
  }
  if (/\(\w{2,5}\d{3,}(\.\d+)?\)/.test(p.education)) p.notes.push('Education looks like a course code');
  if (/^\d+-/.test(p.education)) p.education = p.education.replace(/^\d+-/, '');
}

// ─────────────────────────────── QA checks ─────────────────────────────────
var SENIOR_ROLE = /\b(CEO|CFO|CTO|COO|Chief|Partner|Managing Director|MD\b|VP|Vice President|Director|Captain|Surgeon|Neuro|Head of|General Counsel|Professor|Principal)\b/i;

function qaCheck_(p, ctx) {
  var issues = p.notes.slice();
  if ((ctx.idCounts[p.id] || 0) > 1) issues.push('Duplicate ID (' + ctx.idCounts[p.id] + '×)');
  var missing = ['dob', 'place', 'height', 'caste', 'education', 'occupation', 'father', 'mother', 'hobbies']
    .filter(function (f) { return !p[f]; });
  if (missing.length) issues.push('Missing: ' + missing.join(', '));
  var yr = parseInt(p.dob, 10);
  if (p.dob && (isNaN(yr) || yr < 1950 || yr > ctx.year - 18)) issues.push('Check Date of Birth: "' + p.dob + '"');
  if (!isNaN(yr) && ctx.year - yr < 28 && SENIOR_ROLE.test(p.occupation)) issues.push('Role looks senior for age ' + (ctx.year - yr));
  if (!isNaN(yr) && ctx.year - yr < 22 && /\b(MBA|MD|MS|PhD|LL\.?M|M\.Tech)\b/i.test(p.education)) issues.push('Postgraduate degree for age ' + (ctx.year - yr));
  var cap = p.existingCaption || '';
  if (cap) {
    var wrong = pronounMismatch_(cap, p.gender);
    if (wrong) issues.push('Existing caption uses ' + wrong + ' pronouns');
    if (/\bage[:\s]*\d{2}\b/i.test(cap)) issues.push('Existing caption hard-codes an age');
    if (/customhashtag/i.test(cap)) issues.push('Placeholder hashtag in caption');
    if ((cap.match(/💖 Seeking/g) || []).length > 1) issues.push('Caption has duplicate "Seeking"');
  }
  return issues;
}

function pronounMismatch_(text, gender) {
  var t = String(text || '').split(/#/)[0];
  var male = (t.match(/\b(he|him|his|himself|son|groom|alumnus)\b/gi) || []).length;
  var fem = (t.match(/\b(she|her|hers|herself|daughter|bride|alumna)\b/gi) || []).length;
  // "her/his" can describe the partner being sought, so allow a small amount.
  if (gender === 'M' && fem >= 3 && fem > male) return 'female';
  if (gender === 'F' && male >= 3 && male > fem) return 'male';
  return '';
}

// ───────────────────────────── Communities ─────────────────────────────────
var COMMUNITY = {
  Jatt: ['gill', 'sidhu', 'sandhu', 'dhillon', 'brar', 'bajwa', 'cheema', 'virk', 'randhawa', 'grewal', 'chahal', 'sekhon', 'aulakh', 'bal', 'bains', 'bhullar', 'deol', 'mahal', 'maan', 'mann', 'pannu', 'toor', 'waraich', 'dhaliwal', 'sran', 'sohal', 'sangha', 'kooner', 'mangat', 'kahlon', 'hundal', 'johal', 'kang', 'basra', 'bath', 'atwal', 'cheema', 'dhindsa', 'gharu', 'jakhar', 'dahiya', 'hooda', 'malik', 'sangwan', 'jat', 'jatt'],
  Khatri: ['kapoor', 'khanna', 'malhotra', 'mehra', 'arora', 'ahuja', 'anand', 'bahl', 'behl', 'bajaj', 'bakshi', 'chopra', 'kohli', 'kalra', 'juneja', 'jaitley', 'kapila', 'marwah', 'puri', 'sethi', 'seth', 'sahni', 'sawhney', 'tandon', 'talwar', 'uppal', 'vadehra', 'vadera', 'vij', 'vig', 'narang', 'nangia', 'narula', 'nayyar', 'oberoi', 'saluja', 'trehan', 'vaid', 'chadha', 'dhawan', 'khatri', 'suri', 'sood', 'bhasin', 'mehrotra', 'tuli', 'grover'],
  Agarwal: ['agarwal', 'agrawal', 'aggarwal', 'aggrawal', 'bansal', 'gupta', 'goel', 'goyal', 'garg', 'mittal', 'singhal', 'jindal', 'poddar', 'baniya', 'bania', 'goenka', 'kansal', 'singla'],
  Jain: ['jain', 'dugar', 'oswal', 'jainism']
};

function communityOf_(caste) {
  var c = String(caste || '').toLowerCase();
  var pre = c.match(/^([a-z]+)\s*\(/);            // "Jat(Sandhu)" / "Baniya(Agarwal)"
  var probe = pre ? pre[1] : c;
  if (/^jain/.test(probe)) return 'Jain';
  if (/^(baniya|bania|agarwal|agrawal)/.test(probe)) return 'Agarwal';
  if (/^khatri/.test(probe)) return 'Khatri';
  if (/^jatt?/.test(probe)) return 'Jatt';
  var words = c.replace(/[()]/g, ' ').split(/[^a-z]+/).filter(String);
  for (var k in COMMUNITY) {
    if (words.some(function (w) { return COMMUNITY[k].indexOf(w) > -1; })) return k;
  }
  return '';
}

function surnameOf_(caste) {
  var s = String(caste || '');
  var m = s.match(/\(([^)]+)\)/);
  var name = (m ? m[1] : s).split(/[\/,(]/)[0].trim();
  return name;
}

// ────────────────────────────── Hashtags ───────────────────────────────────
function camelTag_(s) {
  var words = String(s || '').replace(/[’'\x60]/g, '').replace(/&/g, ' and ')
    .split(/[^A-Za-z0-9]+/).filter(String);
  if (!words.length) return '';
  var t = words.map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join('');
  return t.length > 3 && t.length <= 40 ? '#' + t : '';
}

function placeTags_(place) {
  var p = String(place || '').toLowerCase(), t = [];
  if (/chandigarh|mohali|panchkula|tricity/.test(p)) t.push('#ChandigarhMatrimony');
  if (/delhi|gurugram|gurgaon|noida|ghaziabad|faridabad|ncr/.test(p)) t.push('#EliteMatrimonyServicesInDelhi');
  if (/gurugram|gurgaon/.test(p)) t.push('#MatrimonyServicesInGurgaon');
  if (/noida/.test(p)) t.push('#MatrimonyServicesInNoida');
  if (/mumbai|bombay|juhu|bandra|worli|powai|colaba|malabar/.test(p)) t.push('#HighProfileMatrimonyInMumbai');
  if (/amritsar|ludhiana|jalandhar|patiala|bathinda|punjab|moga|barnala|faridkot|ferozepur|gurdaspur|hoshiarpur|kapurthala|mansa|pathankot|rupnagar|sangrur|fazilka|muktsar|fatehgarh/.test(p)) t.push('#PunjabiMatrimony');
  if (/uae|dubai|abu dhabi|sharjah/.test(p)) t.push('#NRIMatrimony', '#IndianMatrimonyServicesInDubai');
  if (/canada|ontario|toronto|brampton|alberta|vancouver|british columbia|mississauga|abbotsford|calgary|edmonton|winnipeg|montreal|surrey|ottawa|manitoba|quebec/.test(p)) t.push('#NRIMatrimony', '#CanadaMatrimony');
  if (/\buk\b|london|england|birmingham|bradford|leeds|leicester|manchester|wolverhampton|coventry|southall|slough|glasgow|edinburgh|scotland|wales|gravesend|hounslow|essex/.test(p)) t.push('#NRIMatrimony', '#UKMatrimony');
  if (/\busa\b|united states|new york|new jersey|california|texas|chicago|seattle|boston|houston|san francisco|\((nj|ca|ny|tx|wa|il|ma|ga|fl|va|md|pa|mi|nc|az)\)|jersey city|edison|yuba city|fremont|san jose|sacramento|fresno|bakersfield/.test(p)) t.push('#NRIMatrimony', '#USAMatrimony');
  if (/australia|sydney|melbourne|brisbane|perth|adelaide/.test(p)) t.push('#NRIMatrimony', '#AustraliaMatrimony');
  if (/singapore|new zealand|auckland|germany|hong kong|kenya|nairobi|qatar|doha|oman|muscat|kuwait|bahrain|saudi|manama|riyadh|jeddah|italy|milan|rome|brescia|latina|spain|barcelona|madrid|netherlands|rotterdam|amsterdam|france|paris|berlin|frankfurt/.test(p)) t.push('#NRIMatrimony');
  return t;
}

function communityTags_(community) {
  return ({
    Jatt: ['#JattMatrimony', '#PunjabiMatrimony'],
    Khatri: ['#KhatriMatrimony', '#PunjabiMatrimony'],
    Agarwal: ['#AgarwalMatrimony', '#BusinessFamilyMatrimony'],
    Jain: ['#JainMatrimony']
  })[community] || [];
}

function professionTags_(p) {
  var o = (p.occupation + ' ' + p.education).toLowerCase(), t = [];
  if (/doctor|surgeon|mbbs|\bmd\b|physician|dent|cardio|ologist|psychiatr/.test(o)) t.push('#DoctorMatrimony');
  if (/lawyer|llb|ll\.b|counsel|advocate|legal|litigation/.test(o)) t.push('#LawyerMatrimony');
  if (/engineer|b\.?tech|software|developer|architect \(|data|cloud|\bai\b|machine learning/.test(o)) t.push('#EngineerMatrimony');
  if (/chartered accountant|\bca\b/.test(o)) t.push('#CAMatrimony');
  if (/business|entrepreneur|founder|industrialist/.test(o)) t.push('#BusinessFamilyMatrimony');
  if (/pilot|captain/.test(o)) t.push('#PilotMatrimony');
  if (/\bias\b|\bips\b|\bifs\b|civil serv/.test((p.father + ' ' + p.mother + ' ' + p.occupation).toLowerCase())) t.push('#IASIPSMatrimony');
  if (/army|air force|navy|defence|defense/.test((p.father + ' ' + p.occupation).toLowerCase())) t.push('#DefenceFamilyMatrimony');
  return t;
}

var BLOCKED_TAG = /customhashtag|placeofresidence|hashtag\d|example/i;

// Approved SEO hashtags (from the original Shaadi Bells script). SEO slots use ONLY these.
var APPROVED_SEO = ['#HighProfileMatrimonyInMumbai', '#MatrimonyInIndia', '#BrahminMatrimonyInDelhi', '#EliteMatrimonyServicesInDelhi',
  '#AgarwalMatrimonyInDelhi', '#PunjabiMatrimonyInDelhi', '#JainMatrimonyInDelhi', '#DivorceMatrimony', '#DivorceeMatrimony',
  '#DivorceeMatrimonyInDelhi', '#BestMatrimonyInMumbai', '#SindhiMatrimonyInMumbai', '#JainMatrimonyInMumbai', '#MarwadiMatrimonyInMumbai',
  '#PremiumMatrimonyServices', '#MatrimonyServices', '#BestMatrimonyServicesInIndia', '#MatrimonyServicesInGurgaon',
  '#MatrimonyServicesInFaridabad', '#MatrimonyServicesInNoida', '#NRIMatrimony', '#MatrimonyServicesForBaniyaCommunity',
  '#MaheshwariMatrimonyServices', '#DigambarJainMatrimony', '#RajputMatrimony', '#HighProfileMatrimony', '#SecondMarriageMatrimony',
  '#MarwariMatrimonyServices', '#ShwetambarJainMatrimony', '#HumadJainMatrimony', '#OswalJainMatrimony', '#HNIMatrimonyServices',
  '#SikhMatrimonyServices', '#SindhiMatrimonyServices', '#DoctorMatrimony', '#PoliticiansMatrimonyServices', '#IASIPSMatrimony',
  '#RemarriageMatrimonyServices', '#BusinessFamilyMatrimony', '#IndianMatrimonyServicesInDubai', '#EliteMatrimonyDubai',
  '#PremiumMatrimonyInIndia', '#PremiumMatrimonyInDubai', '#PremiumMatrimonyInCanada', '#PremiumMatrimonyInAustralia',
  '#BillionaireMatrimony', '#MillionaireMatrimony', '#BillionaireMatrimonyInDubai'];
var SEO_FILLERS = ['#PremiumMatrimonyServices', '#HighProfileMatrimony', '#HNIMatrimonyServices', '#BestMatrimonyServicesInIndia',
  '#PremiumMatrimonyInIndia', '#MatrimonyInIndia', '#MatrimonyServices'];
var CUSTOM_FILLERS = ['#MatrimonialProfile', '#ShaadiJourney', '#IndianMatrimony', '#FamilyValues', '#LifePartnerSearch',
  '#MeaningfulConnections', '#PerfectMatch', '#RishtaAlert'];

function isApproved_(t) {
  var k = String(t).toLowerCase();
  return APPROVED_SEO.some(function (a) { return a.toLowerCase() === k; }) ||
    BRAND.baseTags.some(function (a) { return a.toLowerCase() === k; });
}

/** ["Divorce"|"Remarriage", "NRI"] – used for tags and the prompt. */
function categoryOf_(p) {
  var t = (p.rawId + ' ' + p.section + ' ' + p.place + ' ' + p.background).toLowerCase();
  var c = [];
  if (/divorc|second marriage/.test(t)) c.push('Divorce');
  else if (/remarri|re-marri/.test(t)) c.push('Remarriage');
  if (placeTags_(p.place).indexOf('#NRIMatrimony') > -1 || /\bnri\b|overseas|abroad/.test(t)) c.push('NRI');
  return c;
}

/** Ordered list of relevant approved SEO tags for this profile. */
function seoTags_(p) {
  var place = String(p.place || '').toLowerCase();
  var caste = (p.caste + ' ' + p.community).toLowerCase();
  var job = (p.occupation + ' ' + p.education).toLowerCase();
  var fam = (p.father + ' ' + p.mother).toLowerCase();
  var delhi = /delhi|ncr/.test(place), mumbai = /mumbai|bombay|juhu|bandra|worli|powai|colaba|malabar/.test(place);
  var t = [], cat = p.category || [];
  if (cat.indexOf('Divorce') > -1) t.push(delhi ? '#DivorceeMatrimonyInDelhi' : '#DivorceeMatrimony', '#SecondMarriageMatrimony', '#DivorceMatrimony');
  if (cat.indexOf('Remarriage') > -1) t.push('#RemarriageMatrimonyServices', '#SecondMarriageMatrimony');
  if (/dubai|uae|abu dhabi|sharjah/.test(place)) t.push('#IndianMatrimonyServicesInDubai', '#EliteMatrimonyDubai', '#PremiumMatrimonyInDubai');
  if (/canada|ontario|toronto|brampton|alberta|vancouver|mississauga|abbotsford|calgary|edmonton|winnipeg|montreal|surrey|ottawa|manitoba|quebec/.test(place)) t.push('#PremiumMatrimonyInCanada');
  if (/australia|sydney|melbourne|brisbane|perth|adelaide/.test(place)) t.push('#PremiumMatrimonyInAustralia');
  if (cat.indexOf('NRI') > -1) t.push('#NRIMatrimony');
  if (/digambar/.test(caste)) t.push('#DigambarJainMatrimony');
  if (/shwetambar|svetambar/.test(caste)) t.push('#ShwetambarJainMatrimony');
  if (/oswal/.test(caste)) t.push('#OswalJainMatrimony');
  if (/humad/.test(caste)) t.push('#HumadJainMatrimony');
  if (p.community === 'Jain') t.push(mumbai ? '#JainMatrimonyInMumbai' : '#JainMatrimonyInDelhi');
  if (p.community === 'Agarwal') { if (delhi) t.push('#AgarwalMatrimonyInDelhi'); t.push('#MatrimonyServicesForBaniyaCommunity'); }
  if (p.community === 'Jatt' && !/jakhar|dahiya|hooda|malik|sangwan|jat\(/.test(caste)) t.push('#SikhMatrimonyServices');
  if ((p.community === 'Jatt' || p.community === 'Khatri') && delhi) t.push('#PunjabiMatrimonyInDelhi');
  if (/maheshwari/.test(caste)) t.push('#MaheshwariMatrimonyServices');
  if (/marwa(r|d)i/.test(caste)) t.push(mumbai ? '#MarwadiMatrimonyInMumbai' : '#MarwariMatrimonyServices');
  if (/sindhi/.test(caste)) t.push(mumbai ? '#SindhiMatrimonyInMumbai' : '#SindhiMatrimonyServices');
  if (/rajput/.test(caste)) t.push('#RajputMatrimony');
  if (/brahmin|sharma|tiwari|mishra|pandit/.test(caste) && delhi) t.push('#BrahminMatrimonyInDelhi');
  if (/doctor|surgeon|mbbs|\bmd\b|physician|cardio|ologist|dent/.test(job)) t.push('#DoctorMatrimony');
  if (/\bias\b|\bips\b|\bifs\b/.test(job + ' ' + fam)) t.push('#IASIPSMatrimony');
  if (/politic|\bmla\b|\bmp\b|minister/.test(job + ' ' + fam)) t.push('#PoliticiansMatrimonyServices');
  if (/business|entrepreneur|founder|industrialist|industrial house/.test(job + ' ' + fam)) t.push('#BusinessFamilyMatrimony');
  if (mumbai) t.push('#HighProfileMatrimonyInMumbai', '#BestMatrimonyInMumbai');
  if (delhi) t.push('#EliteMatrimonyServicesInDelhi');
  if (/gurugram|gurgaon/.test(place)) t.push('#MatrimonyServicesInGurgaon');
  if (/noida/.test(place)) t.push('#MatrimonyServicesInNoida');
  if (/faridabad/.test(place)) t.push('#MatrimonyServicesInFaridabad');
  return t;
}

/** 4 brand + 6 approved SEO + the rest profile-specific (default total 18). */
function buildHashtags_(p, aiTags, limit) {
  limit = Math.max(12, Number(limit) || 18);
  var seen = {}, core = [], seo = [], custom = [];
  function norm(t) {
    t = String(t || '').trim(); if (!t) return '';
    t = '#' + t.replace(/^#+/, '').replace(/[^A-Za-z0-9_]/g, '');
    return (t.length < 4 || t.length > 31 || BLOCKED_TAG.test(t)) ? '' : t;
  }
  function push(list, t, max) {
    t = norm(t); if (!t || list.length >= max) return;
    var k = t.toLowerCase(); if (seen[k]) return; seen[k] = 1; list.push(t);
  }
  BRAND.baseTags.forEach(function (t) { push(core, t, 4); });
  seoTags_(p).forEach(function (t) { push(seo, t, 6); });
  var nri = (p.category || []).indexOf('NRI') > -1;
  SEO_FILLERS.forEach(function (t) { if (!(nri && /InIndia$/.test(t))) push(seo, t, 6); });
  var nCustom = limit - core.length - seo.length;   // keeps the total at the limit even if fewer SEO tags fit
  (aiTags || []).filter(function (t) { return !isApproved_(norm(t)) && tagFitsProfile_(t, p); })
    .slice(0, 4).forEach(function (t) { push(custom, t, nCustom); });
  push(custom, camelTag_(p.college), nCustom);
  push(custom, camelTag_(p.schooling), nCustom);
  var hob = String(p.hobbies || '').split(/,|\//)[0];
  if (hob) push(custom, camelTag_(hob + ' lovers'), nCustom);
  var city = String(p.place || '').split(',').pop().trim();
  if (city) push(custom, camelTag_(city + ' profiles'), nCustom);
  CUSTOM_FILLERS.forEach(function (t) { push(custom, t, nCustom); });
  return core.concat(seo, custom);
}

var COMMUNITY_WORDS = /(brahmin|sindhi|rajput|jain|agarwal|aggarwal|baniya|khatri|jatt?|sikh|marwari|gujarati|bengali|tamil|telugu|maratha|muslim|christian|kayastha|arora)/i;
var PLACE_WORDS = /(delhi|mumbai|gurgaon|gurugram|noida|chandigarh|dubai|canada|london|uk|usa|punjab|bangalore|pune|hyderabad|kolkata|chennai)/i;

function tagFitsProfile_(tag, p) {
  var t = String(tag || '');
  if (t.replace(/^#/, '').length > 28) return false;
  if (/nri|dubai|canada|uk|usa|abroad|overseas/i.test(t) && placeTags_(p.place).indexOf('#NRIMatrimony') < 0) return false;
  if (/divorc|second ?marriage|remarriage/i.test(t) && !/divorc/i.test(p.rawId + ' ' + p.section)) return false;
  if (/millionaire|billionaire|rich/i.test(t)) return false;
  var cm = t.match(COMMUNITY_WORDS);
  if (cm) {
    var want = (p.community + ' ' + p.caste).toLowerCase();
    var w = cm[1].toLowerCase();
    if (want.indexOf(w.replace(/t$/, '')) < 0 && !(w === 'sikh' && p.community === 'Jatt')) return false;
  }
  var pm = t.match(PLACE_WORDS);
  if (pm) {
    var place = p.place.toLowerCase();
    var w2 = pm[1].toLowerCase();
    var alias = { gurgaon: 'gurugram', gurugram: 'gurgaon', uk: 'london', usa: 'united states' };
    if (place.indexOf(w2) < 0 && (!alias[w2] || place.indexOf(alias[w2]) < 0)) return false;
  }
  return true;
}

// ───────────────────────── Pronouns & voice ────────────────────────────────
function pr_(p) {
  return p.gender === 'F'
    ? { he: 'she', He: 'She', his: 'her', His: 'Her', him: 'her', child: 'daughter', alum: 'alumna', partnerHe: 'he' }
    : { he: 'he', He: 'He', his: 'his', His: 'His', him: 'him', child: 'son', alum: 'alumnus', partnerHe: 'she' };
}

function voiceRules_(p, voice) {
  var x = pr_(p);
  if (voice === 'first') return 'Write in FIRST PERSON as the candidate ("I", "my"). Never use "he/she" for the candidate. If gendered nouns are needed use "' + x.alum + '".';
  if (voice === 'parent') return 'Write in the PARENTS\' VOICE: "Our ' + x.child + '…", then "' + x.he + '/' + x.his + '". Never use "I"/"my" for the candidate.';
  return 'Write in THIRD PERSON using "' + x.he + '/' + x.his + '" for the candidate (who is a ' + (p.gender === 'F' ? 'woman' : 'man') + '). Never "I"/"my", never "our ' + x.child + '".';
}

// ───────────────────────── Generic (no-AI) text ────────────────────────────
function hashIdx_(s, n) {
  var h = 0; s = String(s);
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % n;
}

function joinNice_(parts) {
  parts = parts.filter(String);
  if (parts.length < 2) return parts.join('');
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

/** Lower-case ordinary words but keep acronyms (IAS, CA, NGO). */
function softLower_(s) {
  return String(s || '').split(/(\s+)/).map(function (w) {
    return /^[A-Z0-9&.\/]{2,}$/.test(w) ? w : w.toLowerCase();
  }).join('');
}

function article_(s) { return /^(an?\s|the\s)/i.test(String(s)) ? '' : (/^[aeiou]/i.test(String(s)) && !/^(uni|eu|one)/i.test(String(s)) ? 'an ' : 'a '); }

var BUSINESS_NOUN = /(mill|plant|unit|press|factory|industr|manufactur|business|company|brand|distribut|dealership|agency|works|store|showroom|firm|farm|trading|exports?|imports?|hotel|restaurant|hospital|clinic|school|transport|fleet|construction)/i;
var PERSON_WORD = /^(.*(ist|er|or|man|woman|owner|ant|ent|ian|eur|wife|maker|officer|head|director|partner|ceo|md|principal|secretary|cs|agent|trader|clerk|staff|nurse|teacher|lecturer|professor|doctor|chef|pilot|official)|ias|ips)$/i;

/** "his father runs a rice mill" / "his father is an IAS officer" */
function parentPhrase_(who, job) {
  job = String(job || '').trim();
  if (!job) return '';
  var main = job.split(/\s*\/\s*/)[0].replace(/\s*\([^)]*\)?/g, '').trim();   // drop "(details)"
  if (!main) main = job;
  var words = main.split(/[^A-Za-z]+/).filter(String);
  if (/^retired\b/i.test(main)) return who + ' is ' + article_(main) + softLower_(main);
  if (/^(ias|ips|ifs|irs|pcs)$/i.test(main)) return who + ' is an ' + main.toUpperCase() + ' officer';
  if (/^family business$/i.test(main)) return who + ' is part of the family business';
  var isPerson = words.some(function (w) { return PERSON_WORD.test(w); });
  if (BUSINESS_NOUN.test(main) && !isPerson) {
    var noun = softLower_(main);
    if (words.length === 1 && !/business|company|firm|brand|agency|store|showroom|hotel|restaurant|hospital|clinic|school|farm|mill|plant|press|factory|unit/i.test(noun)) noun += ' business';
    return who + ' runs ' + article_(noun) + noun;
  }
  return who + ' is ' + article_(main) + softLower_(main);
}

/** "works as a Brand Manager" / "manages the family business (cement manufacturing)" */
function jobPhrase_(occ, verbS) {
  occ = String(occ || '').trim();
  var fam = occ.match(/^family\s+business\s*(?:\(([^)]*)\))?/i);
  if (fam) return (verbS ? 'manages' : 'manage') + ' the family business' + (fam[1] ? ' (' + softLower_(fam[1].trim()) + ')' : '');
  if (/^businessman$/i.test(occ)) return (verbS ? 'is' : 'am') + ' an established businessman';
  if (/^(entrepreneur|startup founder|founder)/i.test(occ)) return (verbS ? 'is' : 'am') + ' ' + article_(occ) + occ;
  var main = occ.split(/\s+\/\s+/)[0];
  var words = main.replace(/\([^)]*\)/g, '').split(/[^A-Za-z]+/).filter(String);
  if (BUSINESS_NOUN.test(main) && !words.some(function (w) { return PERSON_WORD.test(w); })) {
    return (verbS ? 'is' : 'am') + ' associated with ' + article_(main) + softLower_(main);
  }
  return (verbS ? 'works' : 'work') + ' as ' + article_(main) + main;
}

function genericParts_(p, voice) {
  var x = pr_(p), surname = surnameOf_(p.caste);
  var fam = surname ? 'the ' + surname + ' family' : 'a respected family';
  var city = String(p.place || '').split(',').slice(-2).join(',').trim() || 'India';
  var first = voice === 'first';
  var subj = first ? 'I' : (voice === 'parent' ? 'Our ' + x.child : x.He);
  var pron = first ? 'I' : x.He;                  // pronoun for follow-up sentences
  var poss = first ? 'my' : x.his;
  var edu = p.education && p.college && p.education.indexOf(p.college) < 0 ? p.education + ' from ' + p.college : (p.education || p.college);
  var hobbyList = String(p.hobbies || '').split(/\s*,\s*/).filter(String).map(softLower_);
  var hobbies = joinNice_(hobbyList);
  var parents = joinNice_([
    p.father ? parentPhrase_(poss + ' father', p.father) : '',
    p.mother ? parentPhrase_(poss + ' mother', p.mother) : ''
  ]);
  var Parents = parents ? parents.charAt(0).toUpperCase() + parents.slice(1) + '.' : '';
  var eduS = edu ? pron + (first ? ' completed ' : ' completed ') + edu + (p.schooling ? ', after schooling at ' + p.schooling : '') + '.' : '';
  var jobS = p.occupation ? pron + ' ' + jobPhrase_(p.occupation, !first) + '.' : '';
  var hobS = hobbies ? 'Away from work, ' + (first ? 'I enjoy ' : x.he + ' enjoys ') + hobbies + '.' : '';

  var seekingOpts = [
    'Looking for a life partner who values family, respects ambition and is ready to build a warm, balanced home together.',
    'Seeking a well-educated, family-oriented partner who believes in honesty, growth and ' + (hobbyList[0] ? 'shared interests like ' + hobbyList[0] : 'life\'s simple joys') + '.',
    'Looking for a kind, grounded partner from a cultured family who blends tradition with a modern outlook.'
  ];
  var openers = [
    (first ? 'I was born' : subj + ' was born') + ' into ' + fam + ' in ' + city + '.',
    'Born and raised in ' + city + ', ' + (first ? 'I belong' : (voice === 'parent' ? 'our ' + x.child : x.he) + ' belongs') + ' to ' + fam + '.',
    (first ? 'I come' : subj + ' comes') + ' from ' + fam + ', based in ' + city + '.'
  ];
  var k = hashIdx_(p.id, 3);
  var intro = [openers[k], eduS, jobS, Parents, hobS].filter(String).join(' ');

  var background = [
    'Born and raised in ' + city + ', ' + (first ? 'I belong' : x.he + ' belongs') + ' to ' + fam + '.',
    Parents ? Parents.replace(/\.$/, '') + ', providing a grounded and supportive home.' : '',
    p.occupation ? (first ? 'Today I ' : 'Today ' + x.he + ' ') + jobPhrase_(p.occupation, !first) + '.' : ''
  ].filter(String).join(' ');

  return {
    seeking: seekingOpts[hashIdx_(p.id + 's', seekingOpts.length)],
    introduction: intro.replace(/\s+/g, ' ').trim(),
    background: background,
    hashtags: []
  };
}

// ───────────────────────── Assemble final text ─────────────────────────────
function buildCaption_(p, parts, opts) {
  var e = opts.emojis;
  var edu = p.education && p.college && p.education.indexOf(p.college) < 0 ? p.education + ', ' + p.college : (p.education || p.college);
  var lines = [];
  lines.push((e ? '💖 ' : '') + 'Seeking');
  lines.push(parts.seeking);
  lines.push((e ? '✨ ' : '') + 'Introduction');
  lines.push(parts.introduction);
  lines.push((e ? '✨ ' : '') + 'Key Highlights');
  if (edu) lines.push('Education: ' + edu);
  if (p.schooling) lines.push('Schooling: ' + p.schooling);
  if (p.occupation) lines.push('Profession: ' + p.occupation);
  if (p.height) lines.push('Height: ' + p.height);
  if (p.hobbies) lines.push('Interests: ' + p.hobbies);
  if (p.place) lines.push('Based in: ' + p.place);
  lines.push((e ? '💌 ' : '') + 'About ' + BRAND.name);
  lines.push(BRAND.about);
  lines.push((e ? '📞 ' : '') + 'Contact ' + BRAND.name);
  lines.push('Call / WhatsApp: ' + BRAND.phone);
  lines.push(buildHashtags_(p, parts.hashtags, opts.hashtagCount).join(' '));
  return lines.join('\n');
}

var EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;

function stripEmoji_(s) { return String(s || '').replace(EMOJI_RE, '').replace(/[ \t]{2,}/g, ' ').trim(); }

/** The printed ad: plain text, no emojis, always exactly these 13 points. */
function buildAds_(p, parts) {
  var edu = p.education && p.college && p.education.indexOf(p.college) < 0 ? p.education + ', ' + p.college : (p.education || p.college);
  var lines = [
    '1. Registration ID: ' + p.id,
    '2. Date of Birth: ' + p.dob,
    '3. Residence: ' + p.place,
    '4. Height: ' + p.height,
    '5. Caste: ' + p.caste,
    '6. Education: ' + edu,
    '7. Schooling: ' + p.schooling,
    '8. College / University: ' + p.college,
    '9. Occupation / Job: ' + p.occupation,
    '10. Background (Family / Area): ' + String(parts.background || '').replace(/\s+/g, ' ').trim(),
    '11. Father: ' + p.father,
    '12. Mother: ' + p.mother,
    '13. Hobbies / Interests: ' + p.hobbies
  ];
  return lines.map(stripEmoji_).join('\n');
}

// ────────────────────────── Reference examples ─────────────────────────────
/** Clean examples from the reference rows, cached for 6 h. */
function getReferences_(ctx) {
  var cache = CacheService.getDocumentCache();
  var key = 'sb_ref_v3';
  var hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var o = ctx.opts, sh = ctx.sheet;
  var from = Math.max(2, Number(o.refFrom) || 2), to = Math.min(ctx.lastRow, Number(o.refTo) || 101);
  if (to < from) return [];
  var lastCol = sh.getLastColumn();
  var vals = sh.getRange(from, 1, to - from + 1, lastCol).getDisplayValues();
  var refs = [];
  vals.forEach(function (v, i) {
    var cap = ctx.cols.caption ? v[ctx.cols.caption - 1] : '';
    var ads = ctx.cols.ads ? v[ctx.cols.ads - 1] : '';
    var id = String(v[ctx.cols.id - 1] || '');
    if (!/SM\d+/i.test(id) || !cap || !ads) return;
    if (/customhashtag|Date of Birth: Date of Birth|: —|\bage[:\s]*\d{2}\b/i.test(cap + ads)) return;
    if ((cap.match(/Seeking/g) || []).length !== 1) return;
    var seek = (cap.match(/Seeking\s*\n([\s\S]*?)\n[^\n]*Introduction/) || [])[1];
    var intro = (cap.match(/Introduction\s*\n([\s\S]*?)\n[^\n]*Key Highlights/) || [])[1];
    var bg = extractBackground_(ads);
    if (!seek || !intro || !bg || bg.length < 40) return;
    var tags = (cap.match(/#\w+/g) || []).slice(4);
    var section = ctx.sections[from + i - 1] || '';
    refs.push({ seeking: seek.trim(), introduction: intro.trim(), background: bg.trim(),
      tags: tags.slice(0, 8), section: section,
      place: ctx.cols.place ? v[ctx.cols.place - 1] : '' });
  });
  try { cache.put(key, JSON.stringify(refs).slice(0, 99000), 21600); } catch (e) {}
  return refs;
}

function pickReferences_(refs, p, n) {
  if (!refs.length) return [];
  var scored = refs.map(function (r, i) {
    var s = 0;
    var city = String(p.place).split(',').pop().trim().toLowerCase();
    if (city && String(r.place).toLowerCase().indexOf(city) > -1) s += 2;
    if (p.section && r.section === p.section) s += 1;
    s += ((hashIdx_(p.id + i, 100)) / 100);                // rotate for variety
    return { r: r, s: s };
  }).sort(function (a, b) { return b.s - a.s; });
  return scored.slice(0, n).map(function (x) { return x.r; });
}

// ───────────────────────────── Prompting ───────────────────────────────────
var STYLE_GUIDE = [
  'You write matrimonial profile copy for Shaadi Bells Matrimonial Solutions (premium HNI/NRI Indian matchmaking).',
  'Match the STRUCTURE, LENGTH and WARMTH of the reference examples, but never copy their facts or pronouns.',
  'Rules:',
  '- Use ONLY facts from the profile. Never invent awards, salaries, cities, degrees or family details.',
  '- NEVER state an age or a number of years old. Mention birth year only if asked (it is not).',
  '- Do not repeat the Registration ID, phone number or brand name – the template adds them.',
  '- If the education field lists options (e.g. "X or Y"), mention only the first.',
  '- Write job titles naturally (e.g. "works as a Brand Manager"); do not exaggerate seniority.',
  '- Plain hyphens are fine ("close-knit", "well-educated"). No markdown, no emojis inside the text, no hashtags inside sentences.',
  '- seeking: 1–2 sentences describing the partner sought (starts like "Looking for…" / "Seeking…").',
  '- introduction: family surname + city, parents\' professions, education, profession, one personal touch from hobbies.',
  '- background: 2–3 plain sentences for the printed ad (family, upbringing, path to career). No emojis.',
  '- hashtags: 4–6 specific CamelCase hashtags about profession, institutions, hobbies or city. No community/religion tags that are not in the profile. No generic tags like #love.'
].join('\n');

var TONE = {
  warm: 'Tone: warm, relatable and conversational, like a trusted family matchmaker.',
  premium: 'Tone: elegant and premium, refined vocabulary, understated confidence.',
  concise: 'Tone: crisp and factual, minimal adjectives.'
};
var LENGTH = {
  short: 'Introduction 35–50 words, seeking 15–25 words, background 35–50 words.',
  standard: 'Introduction 50–80 words, seeking 20–40 words, background 45–70 words.',
  long: 'Introduction 80–120 words, seeking 30–50 words, background 60–90 words.'
};

function profileForPrompt_(p) {
  return {
    gender: p.gender === 'F' ? 'Female (bride)' : 'Male (groom)',
    birth_year: p.dob, residence: p.place, height: p.height,
    community_or_surname: p.caste, family_surname: surnameOf_(p.caste),
    education: p.education, schooling: p.schooling, college_university: p.college,
    occupation: p.occupation, background_notes: p.background,
    father: p.father, mother: p.mother, hobbies: p.hobbies
  };
}

function buildPrompt_(p, refs, opts, n, extra) {
  var ex = refs.map(function (r, i) {
    return 'Example ' + (i + 1) + ':\n' + JSON.stringify({
      seeking: r.seeking, introduction: r.introduction, background: r.background, hashtags: r.tags.slice(0, 5)
    });
  }).join('\n\n');
  var schema = n > 1
    ? 'Return JSON: {"options":[{"angle":"<2–4 word label>","seeking":"","introduction":"","background":"","hashtags":["#..."]}, …]} with exactly ' + n + ' DIFFERENT options (different angle: e.g. family values, career, lifestyle/hobbies).'
    : 'Return JSON: {"seeking":"","introduction":"","background":"","hashtags":["#..."]}';
  return [
    'REFERENCE EXAMPLES (style only – voice may differ from what is required):', ex || '(none)',
    '', 'PROFILE:', JSON.stringify(profileForPrompt_(p), null, 1),
    '', voiceRules_(p, opts.voice), TONE[opts.tone] || TONE.warm, LENGTH[opts.length] || LENGTH.standard,
    (p.category || []).indexOf('Divorce') > -1 || (p.category || []).indexOf('Remarriage') > -1
      ? 'Second-marriage profile: frame Seeking around a fresh start / new chapter, warmly and respectfully. Never discuss the previous marriage.' : '',
    (p.category || []).indexOf('NRI') > -1 ? 'NRI profile: mention the life abroad naturally (city/country from the profile).' : '',
    extra ? '\nFIX THESE PROBLEMS FROM YOUR LAST ATTEMPT: ' + extra : '',
    '', schema
  ].join('\n');
}

function validateParts_(parts, p, voice) {
  var issues = [];
  ['seeking', 'introduction', 'background'].forEach(function (k) {
    if (!parts || !parts[k] || String(parts[k]).trim().length < 15) issues.push(k + ' is missing/too short');
  });
  if (issues.length) return issues;
  var text = [parts.introduction, parts.background].join(' ');
  var wrong = pronounMismatch_(text, p.gender);
  if (wrong) issues.push('uses ' + wrong + ' pronouns but the candidate is ' + (p.gender === 'F' ? 'female' : 'male'));
  var all = text + ' ' + parts.seeking;
  if (/\b\d{2}\s*(years?|yrs)\s*old\b|\bage[:\s]*\d{2}\b|\baged\s*\d{2}\b/i.test(all)) issues.push('states an age');
  if (/customhashtag|lorem|\[|\]|\{|\}|\bN\/A\b|:\s*—/i.test(all)) issues.push('contains placeholders/brackets');
  if (voice === 'third' && /\b(I|my|our son|our daughter)\b/.test(parts.introduction)) issues.push('must be third person');
  if (voice === 'first' && /\b(he|she) (is|was|works|belongs)\b/i.test(parts.introduction)) issues.push('must be first person');
  if (/\+?91\s?\d{5}|shaadi bells/i.test(all)) issues.push('repeats phone/brand');
  return issues;
}

// ─────────────────────────────── LLM call ──────────────────────────────────
function callLLM_(opts, system, user, temperature, seed) {
  var provider = opts.provider || 'gemini';
  var key = PropertiesService.getUserProperties().getProperty('sb_key_' + provider);
  if (!key) throw new Error('No API key saved for ' + provider + '. Add it in the panel (Connection) or menu ▸ Settings.');
  var model = opts.model || DEFAULT_MODELS[provider];
  var req;
  if (provider === 'gemini') {
    req = {
      url: 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
      headers: { 'x-goog-api-key': key },
      payload: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: seed == null ? { temperature: temperature, responseMimeType: 'application/json' }
          : { temperature: temperature, responseMimeType: 'application/json', seed: seed }
      }
    };
  } else if (provider === 'openai') {
    req = {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { Authorization: 'Bearer ' + key },
      payload: { model: model, temperature: temperature, response_format: { type: 'json_object' }, seed: seed == null ? undefined : seed,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }
    };
  } else {
    req = {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: { model: model, max_tokens: 3000, temperature: Math.min(1, temperature), system: system,
        messages: [{ role: 'user', content: user + '\nRespond with the JSON object only.' }] }
    };
  }
  var res, code, body;
  for (var attempt = 0; attempt < 4; attempt++) {
    res = UrlFetchApp.fetch(req.url, {
      method: 'post', contentType: 'application/json', headers: req.headers,
      payload: JSON.stringify(req.payload), muteHttpExceptions: true
    });
    code = res.getResponseCode(); body = res.getContentText();
    if (code === 200) break;
    if (code === 429 || code >= 500) { Utilities.sleep(1500 * Math.pow(2, attempt)); continue; }
    throw new Error(provider + ' error ' + code + ': ' + body.slice(0, 300));
  }
  if (code !== 200) throw new Error(provider + ' error ' + code + ' after retries: ' + body.slice(0, 200));
  var j = JSON.parse(body), text;
  if (provider === 'gemini') text = j.candidates && j.candidates[0] && j.candidates[0].content.parts.map(function (x) { return x.text || ''; }).join('');
  else if (provider === 'openai') text = j.choices && j.choices[0].message.content;
  else text = j.content && j.content.map(function (x) { return x.text || ''; }).join('');
  return parseJsonLoose_(text);
}

/** Same profile ID → same seed → same wording on re-runs. */
function seedFor_(id) { return hashIdx_(String(id), 2147483); }

function parseJsonLoose_(text) {
  text = String(text || '').trim().replace(/^\x60{3}(?:json)?/i, '').replace(/\x60{3}$/, '').trim();
  try { return JSON.parse(text); } catch (e) {}
  var a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a > -1 && b > a) return JSON.parse(text.slice(a, b + 1));
  throw new Error('AI reply was not JSON');
}

/** Returns {parts, source:'ai'|'generic', issues:[]} */
function aiParts_(ctx, p) {
  var refs = pickReferences_(getReferences_(ctx), p, 3);
  var issues = [];
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      var out = callLLM_(ctx.opts, STYLE_GUIDE, buildPrompt_(p, refs, ctx.opts, 1, issues.join('; ')), ctx.opts.temperature + attempt * 0.2, seedFor_(p.id));
      issues = validateParts_(out, p, ctx.opts.voice);
      if (!issues.length) return { parts: tidyParts_(out), source: 'ai', issues: [] };
    } catch (e) {
      issues = [String(e.message || e)];
      if (/API key|error 4\d\d/.test(issues[0]) && !/429/.test(issues[0])) throw e;
    }
  }
  return { parts: genericParts_(p, ctx.opts.voice), source: 'generic', issues: ['AI fallback → generic: ' + issues.join('; ')] };
}

function tidyParts_(o) {
  var t = function (s) { return String(s || '').replace(/\s+/g, ' ').replace(/\s([,.])/g, '$1').trim(); };
  return { seeking: t(o.seeking), introduction: t(o.introduction), background: stripEmoji_(t(o.background)),
    hashtags: Array.isArray(o.hashtags) ? o.hashtags : [] , angle: o.angle || '' };
}

// ───────────────────────────── Row processing ──────────────────────────────
function writeCell_(ctx, row, field, value, force) {
  var c = ctx.cols[field];
  if (!c) return false;
  var cell = ctx.sheet.getRange(row, c);
  if (!force && !ctx.opts.overwrite && String(cell.getDisplayValue()).trim()) return false;
  cell.setValue(value);
  return true;
}

/** Processes one row. Returns a short status string for the panel log. */
function processRow_(ctx, row) {
  var p = readProfile_(ctx, row, true);
  if (!p) return 'Row ' + row + ': skipped (not a profile row)';
  var o = ctx.opts;
  var qa = qaCheck_(p, ctx);
  var required = ['occupation', 'education'].filter(function (f) { return !p[f]; });
  if (required.length >= 2 && !p.place) {
    if (o.writeQA) writeCell_(ctx, row, 'qa', 'Not generated – profile data is empty. ' + qa.join('; '), true);
    return p.id + ': skipped (empty profile)';
  }
  var needAI = o.captionType !== 'generic';
  var res = needAI ? aiParts_(ctx, p) : { parts: genericParts_(p, o.voice), source: 'generic', issues: [] };
  var wrote = [];
  if (o.generate !== 'ads') {
    if (writeCell_(ctx, row, 'caption', buildCaption_(p, res.parts, o))) wrote.push('caption');
    if (o.captionType === 'both') {
      if (writeCell_(ctx, row, 'generic', buildCaption_(p, genericParts_(p, o.voice), o))) wrote.push('generic');
    }
  }
  if (o.generate !== 'caption') {
    if (writeCell_(ctx, row, 'ads', buildAds_(p, res.parts))) wrote.push('ad');
  }
  if (o.writeGender) writeCell_(ctx, row, 'gender', p.gender === 'F' ? 'Female' : 'Male', true);
  if (o.writeQA) writeCell_(ctx, row, 'qa', qa.concat(res.issues).join('; ') || 'OK', true);
  return p.id + ' (row ' + row + '): ' + (wrote.length ? wrote.join(' + ') + ' [' + res.source + ']' : 'kept existing (overwrite off)') +
    (res.issues.length ? ' ⚠ ' + res.issues[0].slice(0, 80) : '');
}

// ─────────────────────────── Row selection ─────────────────────────────────
function selectedRows_(ctx) {
  var rl = ctx.sheet.getActiveRangeList();
  var rows = {};
  (rl ? rl.getRanges() : [ctx.sheet.getActiveRange()]).forEach(function (r) {
    for (var i = r.getRow(); i < r.getRow() + r.getNumRows(); i++) if (i >= 2) rows[i] = 1;
  });
  return Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
}

function targetRows_(ctx) {
  var o = ctx.opts;
  if (o.rows === 'selected') return selectedRows_(ctx);
  var from = 2, to = ctx.lastRow;
  if (o.rows === 'range') { from = Math.max(2, Number(o.rangeFrom) || 2); to = Math.min(ctx.lastRow, Number(o.rangeTo) || ctx.lastRow); }
  var sh = ctx.sheet;
  var ids = sh.getRange(from, ctx.cols.id, to - from + 1, 1).getDisplayValues();
  var n = to - from + 1;
  var caps = sh.getRange(from, ctx.cols.caption, n, 1).getDisplayValues();
  var ads = sh.getRange(from, ctx.cols.ads, n, 1).getDisplayValues();
  var out = [];
  var block = sh.getRange(from, 1, n, sh.getLastColumn()).getDisplayValues();
  for (var i = 0; i < ids.length; i++) {
    if (!/SM\d+/i.test(ids[i][0])) {
      if (String(ids[i][0]).trim()) continue;                              // section / header label
      var rowVals = block[i];
      if (profileFieldCount_(function (f) { return ctx.cols[f] ? String(rowVals[ctx.cols[f] - 1] || '').trim() : ''; }) < 3) continue;
    }
    if (o.rows === 'empty') {
      var capEmpty = !String(caps[i][0]).trim(), adEmpty = !String(ads[i][0]).trim();
      var need = o.generate === 'ads' ? adEmpty : o.generate === 'caption' ? capEmpty : (capEmpty || adEmpty);
      if (!need) continue;
    }
    out.push(from + i);
  }
  return out;
}

// ───────────────────────── Sidebar endpoints ───────────────────────────────
/** Returns the list of rows the panel will loop over. */
function planRun(opts) {
  saveOptions(opts);
  var ctx = getContext_(opts);
  var rows = targetRows_(ctx);
  return { rows: rows, sheet: ctx.sheet.getName() };
}

/** Process a small batch (panel calls this repeatedly – avoids the 6-min limit). */
function runBatch(opts, rows) {
  var ctx = getContext_(opts);
  var log = [];
  rows.forEach(function (r) {
    try { log.push(processRow_(ctx, r)); }
    catch (e) { log.push('Row ' + r + ': ERROR ' + (e.message || e)); if (/API key|error 40[13]/.test(String(e.message))) throw e; }
  });
  SpreadsheetApp.flush();
  return log;
}

/** Up to 3 caption options for the active row, for the panel to show. */
function previewActiveRow(opts) {
  saveOptions(opts);
  var ctx = getContext_(opts);
  var row = ctx.sheet.getActiveRange().getRow();
  var p = readProfile_(ctx, row);
  if (!p) throw new Error('Row ' + row + ' is not a profile row – click a cell in a profile row (SM… ID).');
  var options = [];
  var generic = genericParts_(p, ctx.opts.voice);
  if (ctx.opts.captionType !== 'generic') {
    var refs = pickReferences_(getReferences_(ctx), p, 3);
    var out = callLLM_(ctx.opts, STYLE_GUIDE, buildPrompt_(p, refs, ctx.opts, ctx.opts.variants, ''), Math.max(0.7, ctx.opts.temperature));
    (out.options || [out]).forEach(function (o) {
      var issues = validateParts_(o, p, ctx.opts.voice);
      var parts = tidyParts_(o);
      options.push({ label: (parts.angle || 'Profile-specific') + (issues.length ? ' ⚠' : ''), issues: issues,
        caption: buildCaption_(p, parts, ctx.opts), ads: buildAds_(p, parts) });
    });
  }
  options.push({ label: 'Generic (brand template)', issues: [], caption: buildCaption_(p, generic, ctx.opts), ads: buildAds_(p, generic) });
  return {
    row: row, id: p.id, gender: p.gender === 'F' ? 'Female' : 'Male', community: p.community || '—',
    qa: qaCheck_(p, ctx), options: options
  };
}

/** Writes the option the user picked in the panel. */
function applyOption(row, caption, ads, which) {
  var ctx = getContext_(getOptions());
  if (which !== 'ads' && ctx.cols.caption) ctx.sheet.getRange(row, ctx.cols.caption).setValue(caption);
  if (which !== 'caption' && ctx.cols.ads) ctx.sheet.getRange(row, ctx.cols.ads).setValue(ads);
  return 'Row ' + row + ' updated';
}

function refreshReference(opts) {
  saveOptions(opts);
  CacheService.getDocumentCache().remove('sb_ref_v3');
  return getReferences_(getContext_(opts)).length;
}

// ───────────────────────────────── REPAIR ──────────────────────────────────
// Keeps the row's existing wording where it is good, fixes the errors, and
// rebuilds the 13-point ad (no emojis) + the emoji caption in the house format.

var HYPHEN_FIXES = {
  closeknit: 'close-knit', likeminded: 'like-minded', welleducated: 'well-educated', forwardthinking: 'forward-thinking',
  warmhearted: 'warm-hearted', kindhearted: 'kind-hearted', familyoriented: 'family-oriented', wellrounded: 'well-rounded',
  openminded: 'open-minded', wellsettled: 'well-settled', downtoearth: 'down-to-earth', funloving: 'fun-loving',
  softspoken: 'soft-spoken', wellestablished: 'well-established', wellmannered: 'well-mannered', goodnatured: 'good-natured',
  highlyeducated: 'highly educated', selfmade: 'self-made', worldclass: 'world-class', godfearing: 'God-fearing',
  careeroriented: 'career-oriented', valuedriven: 'value-driven', modernday: 'modern-day', wellread: 'well-read'
};
var GENERIC_SEEKING = /^seeking a compatible life partner for a respectful and fulfilling future\.?$/i;

/** Background text of an existing ad (works for the 13- and 15-point layouts). */
function extractBackground_(ads) {
  var m = String(ads || '').match(/10\.\s*Background[^:\n]*:\s*([\s\S]*?)\n\s*11\./);
  if (!m) return '';
  var bg = m[1].replace(/\s+/g, ' ').trim();
  if (/^(father:.*mother:.*|—|-|n\/a)?$/i.test(bg)) return '';       // "Father: X. Mother: Y." is not a background
  return bg;
}

/** Splits an existing caption into its personal parts. Returns null if it can't. */
function extractCaptionParts_(cap) {
  var lines = String(cap || '').split(/\r?\n/);
  var HEAD = /^\s*[^\w\s#]*\s*(Seeking|Introduction|Key Highlights)\s*:?\s*$/i;
  var TAIL = /^\s*[^\w\s#]*\s*(About|Contact)\s+Shaadi/i;
  var cur = '', buckets = { seeking: [], introduction: [] }, seekHeads = 0;
  lines.forEach(function (ln) {
    var h = ln.match(HEAD);
    if (h) { cur = h[1].toLowerCase(); if (cur === 'seeking') seekHeads++; return; }
    if (TAIL.test(ln)) { cur = 'tail'; return; }
    if (!ln.trim()) return;
    if (cur === 'seeking') buckets.seeking.push(ln.trim());
    else if (cur === 'introduction') buckets.introduction.push(ln.trim());
  });
  var seek = buckets.seeking.filter(function (l) { return !/^#/.test(l); });
  if (seek.length > 1) seek = seek.filter(function (l) { return !GENERIC_SEEKING.test(l); });
  var out = {
    seeking: seek.join(' '),
    introduction: buckets.introduction.filter(function (l) { return !/^#/.test(l); }).join(' '),
    hashtags: String(cap || '').match(/#[A-Za-z0-9_]+/g) || [],
    duplicateSeeking: seekHeads > 1
  };
  return out.introduction ? out : null;
}

function keepCase_(orig, repl) {
  if (orig === orig.toUpperCase() && orig.length > 1) return repl.toUpperCase();
  if (orig.charAt(0) === orig.charAt(0).toUpperCase()) return repl.charAt(0).toUpperCase() + repl.slice(1);
  return repl;
}

/** Cleans a sentence block; pushes what it fixed into 'fixed'. */
function cleanText_(s, fixed) {
  var t = String(s || ''), before;
  before = t; t = stripEmoji_(t); if (t !== before) fixed.add('emojis removed from text');
  before = t; t = t.replace(/\s#[A-Za-z0-9_]+/g, ''); if (t !== before) fixed.add('hashtags removed from sentences');
  before = t;
  t = t.replace(/\b(a|an)\s+(\w+\s+)?\d{2}[- ]years?[- ]old\s+(?=(from|in|who|with|based)\b)/gi,
                function (m, art, adj) { return keepCase_(art, 'a') + ' ' + (adj || '') + 'young professional '; })
       .replace(/\b(a|an)\s+(\w+\s+)?\d{2}[- ]years?[- ]old\s+/gi, function (m, art, adj, off, str) {
         var next = adj || str.slice(off + m.length);
         return keepCase_(art, /^[aeiou]/i.test(next) ? 'an' : 'a') + ' ' + (adj || '');
       })
       .replace(/,?\s*\b\d{2}[- ]years?[- ]old\b/gi, '')
       .replace(/,?\s*\(?\b(age|aged)[:\s]*\d{2}\)?(\s*years?( old)?)?/gi, '')
       .replace(/,?\s*\b\d{2}\s*(years?|yrs)\s*(old|of age)\b/gi, '');
  if (t !== before) fixed.add('hard-coded age removed');
  before = t;
  t = t.replace(/\b[A-Za-z]+\b/g, function (w) { var f = HYPHEN_FIXES[w.toLowerCase()]; return f ? keepCase_(w, f) : w; });
  if (t !== before) fixed.add('hyphens restored');
  before = t; t = fixSpelling_(t); if (t !== before) fixed.add('spellings fixed');
  t = t.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/([.!?])\1+/g, '$1').replace(/\.\s*,/g, '.').trim();
  if (t && !/[.!?]$/.test(t)) t += '.';
  return t;
}

/** Rewrites the CANDIDATE's pronouns to the right gender. */
function swapPronouns_(s, toGender) {
  var map = toGender === 'F'
    ? [[/\bhe\b/gi, 'she'], [/\bhimself\b/gi, 'herself'], [/\bhim\b/gi, 'her'], [/\bhis\b/gi, 'her'], [/\bson\b/gi, 'daughter'],
       [/\bgroom\b/gi, 'bride'], [/\balumnus\b/gi, 'alumna'], [/\bbusinessman\b/gi, 'businesswoman'], [/\bboy\b/gi, 'girl']]
    : [[/\bshe\b/gi, 'he'], [/\bherself\b/gi, 'himself'], [/\bhers\b/gi, 'his'], [/\bdaughter\b/gi, 'son'], [/\bbride\b/gi, 'groom'],
       [/\balumna\b/gi, 'alumnus'], [/\bbusinesswoman\b/gi, 'businessman'], [/\bgirl\b/gi, 'boy']];
  var t = String(s || '');
  map.forEach(function (m) { t = t.replace(m[0], function (w) { return keepCase_(w, m[1]); }); });
  if (toGender === 'M') {   // "her" → "his" before a noun, otherwise "him"
    t = t.replace(/\bher\b(\s+)(\w+)?/gi, function (w, sp, next) {
      var obj = !next || /^(and|to|for|with|in|on|at|as|by|from|of|is|was|the|a|an)$/i.test(next);
      return keepCase_(w.slice(0, 3), obj ? 'him' : 'his') + sp + (next || '');
    });
  }
  return t;
}

/** Repairs one row. Returns a log line. */
function repairRow_(ctx, row) {
  var p = readProfile_(ctx, row);
  if (!p) return 'Row ' + row + ': skipped (not a profile row)';
  var o = ctx.opts, qa = qaCheck_(p, ctx);
  if (!p.education && !p.occupation && !p.place) {
    if (o.writeQA) writeCell_(ctx, row, 'qa', 'Not repaired – profile data is empty. Fill the row, then use Generate.', true);
    return p.id + ': skipped (empty profile) ⚠';
  }
  var fixed = { list: [], add: function (x) { if (this.list.indexOf(x) < 0) this.list.push(x); } };
  var old = extractCaptionParts_(p.existingCaption) || { seeking: '', introduction: '', hashtags: [] };
  var gen = genericParts_(p, o.voice);
  if (old.duplicateSeeking) fixed.add('duplicate "Seeking" merged');
  if (/customhashtag|placeofresidence/i.test(p.existingCaption)) fixed.add('placeholder hashtags removed');
  if (/^\s*1[45]\./m.test(p.existingAds)) fixed.add('ad reduced to 13 points');

  var parts = {
    seeking: cleanText_(old.seeking, fixed),
    introduction: cleanText_(old.introduction, fixed),
    background: cleanText_(extractBackground_(p.existingAds), fixed),
    hashtags: old.hashtags
  };
  if (!parts.seeking || parts.seeking.length < 15) { parts.seeking = gen.seeking; if (p.existingCaption) fixed.add('Seeking written'); }
  if (!parts.introduction || parts.introduction.length < 30) { parts.introduction = gen.introduction; fixed.add('Introduction written from row data'); }
  if (!parts.background || parts.background.length < 30) { parts.background = gen.background; fixed.add('ad background written from row data'); }

  // Wrong gender → swap the candidate's pronouns everywhere they describe the candidate.
  var wrongChild = p.gender === 'F' ? /\bour son\b/gi : /\bour daughter\b/gi;
  var whole = parts.introduction + ' ' + parts.background + ' ' + (parts.seeking.match(wrongChild) || []).join(' ');
  var wrongIntro = pronounMismatch_(parts.introduction + ' ' + (parts.seeking.match(wrongChild) || []).join(' '), p.gender);
  if (pronounMismatch_(whole, p.gender) || wrongIntro) {
    parts.introduction = swapPronouns_(parts.introduction, p.gender);
    parts.background = swapPronouns_(parts.background, p.gender);
    parts.seeking = parts.seeking.replace(wrongChild, function (w) { return keepCase_(w, p.gender === 'F' ? 'our daughter' : 'our son'); });
    fixed.add('pronouns corrected to ' + (p.gender === 'F' ? 'female' : 'male') + ' – VERIFY gender (text said otherwise)');
  }

  var source = 'quick';
  if (o.repairAI) {
    var ai = aiRepair_(ctx, p, parts);
    if (ai.parts) { parts = ai.parts; source = 'AI'; } else fixed.add('AI repair failed – quick repair used (' + ai.error.slice(0, 60) + ')');
  }

  var leftover = validateParts_(parts, p, o.repairAI ? o.voice : 'any');
  var cap = buildCaption_(p, parts, o);
  var ad = buildAds_(p, parts);
  writeCell_(ctx, row, 'caption', cap, true);
  writeCell_(ctx, row, 'ads', ad, true);
  if (o.writeGender) writeCell_(ctx, row, 'gender', p.gender === 'F' ? 'Female' : 'Male', true);
  var dataNotes = qa.filter(function (q) { return !/^Existing caption|^Caption has|^Placeholder hashtag/.test(q); });
  var note = ['Repaired (' + source + '): ' + (fixed.list.join(', ') || 'format rebuilt')].concat(dataNotes)
    .concat(leftover.length ? ['CHECK: ' + leftover.join(', ')] : []).join('; ');
  if (o.writeQA) writeCell_(ctx, row, 'qa', note, true);
  return p.id + ' (row ' + row + '): repaired [' + source + ']' + (leftover.length ? ' ⚠ ' + leftover[0] : '');
}

/** AI rewrite that keeps facts + wording, fixes gender/voice/age/grammar. */
function aiRepair_(ctx, p, parts) {
  var refs = pickReferences_(getReferences_(ctx), p, 2);
  var user = [
    'REPAIR this existing profile text. Keep every correct fact and as much of the original wording as possible.',
    'Fix: wrong gender/pronouns, wrong voice, any stated age, facts that contradict the PROFILE, grammar, missing hyphens.',
    'Do not add new facts.',
    '', 'EXISTING TEXT:', JSON.stringify({ seeking: parts.seeking, introduction: parts.introduction, background: parts.background }),
    '', buildPrompt_(p, refs, ctx.opts, 1, '')
  ].join('\n');
  var err = '';
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      var out = callLLM_(ctx.opts, STYLE_GUIDE, user + (err ? '\nFIX: ' + err : ''), 0.2 + attempt * 0.2, seedFor_(p.id));
      var issues = validateParts_(out, p, ctx.opts.voice);
      if (!issues.length) {
        var t = tidyParts_(out);
        if (!t.hashtags.length) t.hashtags = parts.hashtags;
        else t.hashtags = t.hashtags.concat(parts.hashtags);
        return { parts: t };
      }
      err = issues.join('; ');
    } catch (e) {
      err = String(e.message || e);
      if (/API key|error 40[13]/.test(err)) throw e;
    }
  }
  return { parts: null, error: err };
}

// Sidebar endpoint for repair batches.
function runRepairBatch(opts, rows, useAI) {
  opts = opts || {}; opts.repairAI = !!useAI;
  var ctx = getContext_(opts);
  var log = [];
  rows.forEach(function (r) {
    try { log.push(repairRow_(ctx, r)); }
    catch (e) { log.push('Row ' + r + ': ERROR ' + (e.message || e)); if (/API key|error 40[13]/.test(String(e.message))) throw e; }
  });
  SpreadsheetApp.flush();
  return log;
}

function planSelected(opts) {
  var ctx = getContext_(opts);
  return { rows: selectedRows_(ctx) };
}
