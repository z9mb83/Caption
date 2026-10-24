/**
 * Minimal in-memory stand-in for the Apps Script services Code.gs uses,
 * so the script can be tested with Node (no Google account needed).
 *
 *   const env = createEnv(rows);          // rows = 2-D array, row 1 = headers
 *   env.call('functionName', arg1, ...);  // call any Code.gs function
 *   env.data                              // the "sheet" after writes
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createEnv(rows, opts) {
  opts = opts || {};
  const data = JSON.parse(JSON.stringify(rows));
  const props = {};
  const state = { active: { r: 2, n: 1 }, fetchReply: null, calls: [], triggers: [] };

  function Range(r, c, nr, nc) {
    const self = {
      getDisplayValues: () => {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = [];
          for (let j = 0; j < nc; j++) row.push(String((data[r - 1 + i] || [])[c - 1 + j] || ''));
          out.push(row);
        }
        return out;
      },
      getDisplayValue: () => String((data[r - 1] || [])[c - 1] || ''),
      setValue: v => { while (data.length < r) data.push([]); data[r - 1][c - 1] = v; return self; },
      setFontWeight: () => self,
      getRow: () => r,
      getNumRows: () => nr
    };
    return self;
  }

  const sheet = {
    getName: () => 'Sheet1',
    getLastRow: () => data.length,
    getLastColumn: () => Math.max.apply(null, data.map(r => r.length)),
    getRange: (r, c, nr = 1, nc = 1) => Range(r, c, nr, nc),
    getActiveRange: () => Range(state.active.r, 1, state.active.n, 1),
    getActiveRangeList: () => ({ getRanges: () => [Range(state.active.r, 1, state.active.n, 1)] })
  };

  const ss = { getActiveSheet: () => sheet, getSheetByName: () => sheet, toast: () => {} };

  const ctx = {
    console, JSON, Math, Date, String, Number, Array, Object, RegExp, Error, isNaN, parseInt, encodeURIComponent,
    SpreadsheetApp: { getActive: () => ss, getActiveSheet: () => sheet, flush: () => {}, getUi: () => ({ alert: () => {} }) },
    PropertiesService: {
      getUserProperties: () => ({ getProperty: k => props['u:' + k] || null, setProperty: (k, v) => { props['u:' + k] = v; }, deleteProperty: k => { delete props['u:' + k]; } }),
      getDocumentProperties: () => ({ getProperty: k => props['d:' + k] || null, setProperty: (k, v) => { props['d:' + k] = v; } })
    },
    CacheService: { getDocumentCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: name => ({ timeBased: () => ({ after: () => ({ create: () => state.triggers.push(name) }) }) })
    },
    Utilities: { sleep: () => {} },
    HtmlService: { createHtmlOutputFromFile: () => ({ setTitle: () => ({}) }) },
    UrlFetchApp: {
      fetch: (url, o) => {
        const payload = JSON.parse(o.payload);
        state.calls.push({ url, payload, headers: o.headers });
        const text = state.fetchReply ? state.fetchReply(payload, url) : '{}';
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            choices: [{ message: { content: text } }],                 // OpenAI shape
            candidates: [{ content: { parts: [{ text: text }] } }],    // Gemini shape
            content: [{ text: text }]                                  // Anthropic shape
          })
        };
      }
    }
  };
  vm.createContext(ctx);
  const src = fs.readFileSync(opts.codePath || path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'Code.gs' });

  return {
    data, props, state, ctx,
    call: (name, ...args) => ctx[name](...args),
    run: expr => vm.runInContext(expr, ctx),
    setOptions: o => { props['u:sb_opts'] = JSON.stringify(o); },
    setKey: (provider, key) => { props['u:sb_key_' + provider] = key; },
    select: (r, n) => { state.active = { r, n: n || 1 }; }
  };
}

module.exports = { createEnv };
