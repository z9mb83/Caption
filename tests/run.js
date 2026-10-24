/**
 * Test suite for apps-script/Code.gs — run with:  node tests/run.js
 * Uses synthetic profiles only (tests/fixtures/sample-sheet.json).
 */
'use strict';
const assert = require('assert');
const { createEnv } = require('./mock-apps-script');
const rows = require('./fixtures/sample-sheet.json');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
const COL = { id: 0, ads: 13, cap: 14, qa: 15 };
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const AD_LABELS = ['Registration ID', 'Date of Birth', 'Residence', 'Height', 'Caste', 'Education', 'Schooling',
  'College / University', 'Occupation / Job', 'Background (Family / Area)', 'Father', 'Mother', 'Hobbies / Interests'];
const tagsOf = cap => cap.match(/#[A-Za-z0-9_]+/g) || [];
const introOf = cap => (cap.split('✨ Introduction')[1] || '').split('✨ Key Highlights')[0].trim();

function checkAd(ad) {
  const lines = ad.split('\n');
  assert.strictEqual(lines.length, 13, 'ad should have 13 lines, got ' + lines.length);
  AD_LABELS.forEach((l, i) => assert.ok(lines[i].startsWith((i + 1) + '. ' + l + ':'), 'line ' + (i + 1) + ' label: ' + lines[i]));
  assert.ok(!EMOJI.test(ad), 'ad must not contain emojis');
}
function checkCaption(cap) {
  ['💖 Seeking', '✨ Introduction', '✨ Key Highlights', '💌 About Shaadi Bells', '📞 Contact Shaadi Bells'].forEach(h =>
    assert.ok(cap.includes(h), 'missing section ' + h));
  assert.strictEqual((cap.match(/💖 Seeking/g) || []).length, 1, 'exactly one Seeking');
  assert.ok(cap.includes('Call / WhatsApp: +917770000559'), 'phone line');
  const t = tagsOf(cap);
  assert.strictEqual(t.length, 18, '18 hashtags, got ' + t.length + ': ' + t.join(' '));
  assert.deepStrictEqual(t.slice(0, 4), ['#shaadibells', '#matrimonialsolutions', '#jeevansathi', '#shaadi']);
  assert.strictEqual(new Set(t.map(x => x.toLowerCase())).size, t.length, 'no duplicate tags');
  assert.ok(!/\bage[:\s]*\d{2}\b|\d{2}[- ]years?[- ]old/i.test(cap), 'no stated age');
}

console.log('\nGenerate empty rows (no AI, template)');
{
  const env = createEnv(rows);
  env.setOptions({ rows: 'empty', generate: 'both', captionType: 'generic', overwrite: false, writeQA: true });
  const target = env.run('targetRows_(getContext_(getOptions()))');
  test('targets rows with an empty ad or caption, incl. the ID-less profile row', () =>
    assert.deepStrictEqual(Array.from(target), [4, 5, 7, 8, 9, 10]));
  env.call('runBatch', JSON.parse(env.props['u:sb_opts']), Array.from(target));
  const d = env.data;
  test('ID-less profile row gets the next SM number', () => assert.strictEqual(d[8][COL.id], 'SM100007'));
  test('row with a caption keeps it (overwrite off) but gets an ad', () => {
    assert.ok(d[3][COL.cap].includes('Our daughter grew up in Amritsar'));
    checkAd(d[3][COL.ads]);
  });
  for (const r of [4, 6, 7, 8]) {
    test('row ' + (r + 1) + ': 13-point ad, no emojis', () => checkAd(d[r][COL.ads]));
    test('row ' + (r + 1) + ': caption format + 18 hashtags', () => checkCaption(d[r][COL.cap]));
  }
  test('NRI city-only place (Mississauga) gets NRI tags, no "InIndia" tags', () => {
    const t = tagsOf(d[4][COL.cap]);
    assert.ok(t.includes('#NRIMatrimony') && t.includes('#PremiumMatrimonyInCanada'), t.join(' '));
    assert.ok(!t.some(x => /InIndia$/.test(x)), t.join(' '));
  });
  test('"X or Y" education uses the first option and is flagged in QA', () => {
    assert.ok(d[6][COL.ads].includes('6. Education: BA LL.B (Hons), GLC Mumbai'), d[6][COL.ads].split('\n')[5]);
    assert.ok(/Education lists options/.test(d[6][COL.qa]));
  });
  test('divorce row gets second-marriage tags', () => {
    const t = tagsOf(d[7][COL.cap]);
    assert.ok(t.includes('#DivorceeMatrimonyInDelhi') && t.includes('#SecondMarriageMatrimony'), t.join(' '));
  });
  test('family-business occupation reads naturally', () =>
    assert.ok(/manages the family business \(garments export\)/.test(d[7][COL.cap]), introOf(d[7][COL.cap])));
  test('parent business job reads "runs a rice mill"', () => assert.ok(/father runs a rice mill/.test(d[6][COL.cap])));
  test('girls section gets she/her', () => assert.ok(/\bShe\b|\bshe\b/.test(introOf(d[6][COL.cap]))));
  test('stub row without profile data is skipped and noted', () => {
    assert.strictEqual(d[9][COL.cap] || '', '');
    assert.ok(/Not generated/.test(d[9][COL.qa]));
  });
}

console.log('\nRepair (quick, no AI)');
{
  const env = createEnv(rows);
  env.setOptions({ writeQA: true });
  env.call('runRepairBatch', {}, [3, 4], false);
  const cap = env.data[2][COL.cap], ad = env.data[2][COL.ads], qa = env.data[2][COL.qa];
  test('15-point ad rebuilt as 13 points', () => checkAd(ad));
  test('caption rebuilt in house format', () => checkCaption(cap));
  test('duplicate Seeking merged, generic fallback line dropped', () => {
    assert.ok(!/compatible life partner/.test(cap));
    assert.ok(/duplicate "Seeking" merged/.test(qa));
  });
  test('age removed, hyphens restored, spelling fixed, emoji removed from sentence', () => {
    assert.ok(!/Age: 28/.test(cap));
    assert.ok(/close-knit/.test(cap) && !/closeknit/.test(cap + ad));
    assert.ok(/well-educated/.test(cap));
    assert.ok(!/Bussinessman/.test(cap + ad) && /Businessman/.test(cap));
    assert.ok(!EMOJI.test(introOf(cap)));
  });
  test('placeholder + wrong-community hashtags dropped, relevant ones kept', () => {
    const t = tagsOf(cap);
    assert.ok(!t.some(x => /customhashtag|Brahmin/i.test(x)), t.join(' '));
    assert.ok(t.includes('#GolfLovers'), t.join(' '));
    assert.ok(t.includes('#IASIPSMatrimony'), t.join(' '));
  });
  test('wrong gender corrected (Boys section) and flagged for review', () => {
    const c2 = env.data[3][COL.cap];
    assert.ok(/Our son grew up/.test(c2) && /\bHe studied/.test(c2) && !/\bShe\b/.test(introOf(c2)), introOf(c2));
    assert.ok(/for our son/.test(c2));
    assert.ok(/VERIFY gender/.test(env.data[3][COL.qa]));
  });
}

console.log('\nAI path (mocked OpenAI)');
{
  const env = createEnv(rows);
  env.setKey('openai', 'test-key');
  env.setOptions({ writeQA: true, overwrite: true, captionType: 'specific' });
  let n = 0;
  env.state.fetchReply = () => {
    n++;
    return JSON.stringify(n === 1
      ? { seeking: 'Looking for a kind, grounded partner.', introduction: 'She is a software engineer and she loves her family and her work.', background: 'She grew up in Mississauga with her parents.', hashtags: ['#BrahminMatrimony'] }
      : { seeking: 'Looking for a kind, grounded partner who values family.', introduction: 'Born into the Brar family in Mississauga, he studied Computer Science at the University of Toronto and works as a Software Engineer.', background: 'Born and raised in Mississauga, he grew up in a close-knit Brar family before joining the tech industry.', hashtags: ['#UofTAlumni', '#HockeyLovers'] });
  };
  env.call('runBatch', JSON.parse(env.props['u:sb_opts']), [5]);
  const calls = env.state.calls;
  test('wrong-gender AI reply is rejected and retried once', () => assert.strictEqual(calls.length, 2));
  test('uses OpenAI gpt-4o with a fixed seed and low temperature', () => {
    assert.ok(calls[0].url.includes('api.openai.com'));
    assert.strictEqual(calls[0].payload.model, 'gpt-4o');
    assert.strictEqual(typeof calls[0].payload.seed, 'number');
    assert.strictEqual(calls[0].payload.seed, calls[1].payload.seed);
    assert.ok(Math.abs(calls[0].payload.temperature - 0.3) < 1e-9, String(calls[0].payload.temperature));
  });
  test('API key travels only in the Authorization header', () => {
    assert.strictEqual(calls[0].headers.Authorization, 'Bearer test-key');
    assert.ok(!JSON.stringify(calls[0].payload).includes('test-key'));
  });
  test('accepted AI text lands in caption and ad', () => {
    const d = env.data[4];
    assert.ok(introOf(d[COL.cap]).startsWith('Born into the Brar family'));
    assert.ok(d[COL.ads].includes('10. Background (Family / Area): Born and raised in Mississauga'));
    checkCaption(d[COL.cap]); checkAd(d[COL.ads]);
    assert.ok(tagsOf(d[COL.cap]).includes('#UofTAlumni'));
  });
}

console.log('\nHelpers');
{
  const env = createEnv(rows);
  const p = { place: 'Chandigarh', caste: 'Gill', community: 'Jatt', rawId: '', section: '' };
  test('tag filter rejects other communities and false NRI tags', () => {
    assert.strictEqual(env.call('tagFitsProfile_', '#BrahminMatrimonyInDelhi', p), false);
    assert.strictEqual(env.call('tagFitsProfile_', '#NRIMatrimony', p), false);
    assert.strictEqual(env.call('tagFitsProfile_', '#GolfLovers', p), true);
  });
  test('age phrases are removed cleanly', () => {
    const f = { add: () => {} };
    assert.strictEqual(env.call('cleanText_', 'A vibrant 20-year-old from Gurugram, he is great.', f), 'A vibrant young professional from Gurugram, he is great.');
    assert.strictEqual(env.call('cleanText_', 'She is a 23-year-old doctor who loves art.', f), 'She is a doctor who loves art.');
    assert.strictEqual(env.call('cleanText_', 'Meet Riya, aged 26, a lawyer.', f), 'Meet Riya, a lawyer.');
  });
  test('heights are normalised', () => {
    assert.strictEqual(env.call('normalizeHeight_', "6'00"), '6\'0"');
    assert.strictEqual(env.call('normalizeHeight_', '5’11”'), '5\'11"');
  });
  test('AI JSON inside code fences is parsed', () =>
    assert.strictEqual(env.call('parseJsonLoose_', '```json\n{"a":1}\n```').a, 1));
  test('NRI detection by city', () => {
    ['Montreal', 'Fremont (CA)', 'Riyadh', 'Milan', 'Gravesend', 'Perth'].forEach(pl =>
      assert.ok(env.call('categoryOf_', { place: pl, rawId: '', section: '', background: '' }).indexOf('NRI') > -1, pl));
    assert.deepStrictEqual(Array.from(env.call('categoryOf_', { place: 'New Delhi', rawId: '', section: '', background: '' })), []);
  });
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
