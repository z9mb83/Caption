/**
 * Shaadi Bells – live sheet audit (read-only).
 *
 * How to use: open the Google Sheet in Chrome → press F12 (DevTools) → Console →
 * paste this whole file → Enter. It reads Sheet1 through the sheet's own
 * export endpoint (your login), runs every format/quality check and prints a
 * summary table plus the IDs behind each finding. Nothing is written.
 *
 * Checks mirror the rules in apps-script/Code.gs:
 *   Ad      – exactly 13 numbered points in the fixed order, no emojis, ID matches row
 *   Caption – 5 sections in order, phone line, exactly 18 hashtags starting with the
 *             4 brand tags, no duplicates, no stated ages / placeholders / squashed words,
 *             pronouns agree with the Boy/Girl label, NRI rows carry #NRIMatrimony
 */
(async () => {
  const SHEET_ID = location.pathname.split('/d/')[1].split('/')[0];
  const res = await fetch(`/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=Sheet1&range=A1:P2000&headers=1`, { credentials: 'include' });
  const txt = await res.text();
  const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
  const rows = j.table.rows.map(r => r.c.map(c => c ? (c.f != null ? c.f : (c.v == null ? '' : String(c.v))) : ''));

  const LABELS = ['Registration ID', 'Date of Birth', 'Residence', 'Height', 'Caste', 'Education', 'Schooling',
    'College / University', 'Occupation / Job', 'Background (Family / Area)', 'Father', 'Mother', 'Hobbies / Interests'];
  const HEADS = ['💖 Seeking', '✨ Introduction', '✨ Key Highlights', '💌 About Shaadi Bells Matrimonial Solutions', '📞 Contact Shaadi Bells Matrimonial Solutions'];
  const CORE = ['#shaadibells', '#matrimonialsolutions', '#jeevansathi', '#shaadi'];
  const EMO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const ABROAD = /canada|ontario|toronto|brampton|alberta|vancouver|mississauga|abbotsford|calgary|edmonton|winnipeg|montreal|surrey|\buk\b|london|england|birmingham|bradford|leeds|leicester|manchester|wolverhampton|coventry|southall|slough|glasgow|gravesend|usa|united states|new york|new jersey|california|texas|\((nj|ca|ny|tx)\)|jersey city|edison|yuba city|fremont|san jose|sacramento|fresno|bakersfield|australia|sydney|melbourne|brisbane|perth|adelaide|uae|dubai|abu dhabi|sharjah|singapore|qatar|oman|kuwait|bahrain|manama|riyadh|saudi|italy|milan|rome|brescia|latina|spain|barcelona|netherlands|rotterdam/i;

  const F = {}; const flag = (k, id) => (F[k] = F[k] || []).push(id);
  const ids = {}; let section = '', profiles = 0;
  const voice = { first: 0, third: 0, parent: 0, mixed: 0 };

  rows.forEach(r => { const m = (r[0] || '').match(/SM\d+/i); if (m) ids[m[0]] = (ids[m[0]] || 0) + 1; });
  for (const r of rows) {
    const a = (r[0] || '').trim();
    if (a && !/SM\d+/i.test(a) && !/^registration/i.test(a)) { section = a; continue; }
    const m = a.match(/SM\d+/i); if (!m) continue;
    profiles++;
    const id = m[0], ad = r[13] || '', cap = r[14] || '';
    const gender = /\b(boy|groom)\b/i.test(a) ? 'M' : /\bgirl\b/i.test(a) ? 'F' : /girls?\b/i.test(section) ? 'F' : 'M';
    if (ids[id] > 1) flag('Duplicate ID', id);
    if (!ad.trim()) flag('Ad empty', id);
    if (!cap.trim()) { flag('Caption empty', id); continue; }

    const lines = ad.split('\n');
    if (lines.length !== 13 || LABELS.some((l, i) => !(lines[i] || '').startsWith((i + 1) + '. ' + l + ':'))) flag('Ad not in 13-point format', id);
    if (EMO.test(ad)) flag('Ad contains emoji', id);
    if (!(lines[0] || '').includes(id)) flag('Ad ID ≠ row ID', id);

    let pos = -1; if (HEADS.some(h => { const k = cap.indexOf(h); const bad = k < 0 || k < pos; pos = k; return bad; })) flag('Caption sections missing/out of order', id);
    if ((cap.match(/💖 Seeking/g) || []).length > 1) flag('Duplicate Seeking', id);
    if (!cap.includes('Call / WhatsApp: +917770000559')) flag('Phone line missing', id);
    const tags = cap.match(/#[A-Za-z0-9_]+/g) || [];
    if (tags.length !== 18) flag('Hashtags ≠ 18', id);
    if (CORE.some((t, i) => tags[i] !== t)) flag('Brand tags not first', id);
    if (new Set(tags.map(t => t.toLowerCase())).size !== tags.length) flag('Duplicate hashtags', id);
    if (ABROAD.test(r[2] || '') && !tags.includes('#NRIMatrimony')) flag('NRI profile without #NRIMatrimony', id);
    if (!ABROAD.test(r[2] || '') && tags.includes('#NRIMatrimony')) flag('#NRIMatrimony on India profile', id);

    const body = cap.split('✨ Key Highlights')[0];
    const intro = (body.split('✨ Introduction')[1] || '').trim();
    if (/\b(age[:\s]*\d{2}|\d{2}[- ]years?[- ]old|aged \d{2})\b/i.test(body + ad)) flag('Age stated', id);
    if (/customhashtag|placeofresidence|lorem|undefined|\bnull\b|: —/i.test(cap + ad)) flag('Placeholder text', id);
    if (/\b(closeknit|likeminded|welleducated|familyoriented|warmhearted|kindhearted|openminded)\b/i.test(body + ad)) flag('Missing hyphen', id);
    if (/Bussiness|Buisness/i.test(cap + ad)) flag('Spelling (Business)', id);
    const t = intro + ' ' + (lines[9] || '');
    const male = (t.match(/\b(he|him|his|son|groom|alumnus)\b/gi) || []).length;
    const fem = (t.match(/\b(she|her|hers|daughter|bride|alumna)\b/gi) || []).length;
    if ((gender === 'M' && fem >= 3 && fem > male) || (gender === 'F' && male >= 3 && male > fem)) flag('Pronouns contradict Boy/Girl label', id);
    const fp = /\b(I|my)\b/.test(intro), par = /\bour (son|daughter)\b/i.test(intro), tp = /\b(he|she) (is|was|works|belongs|comes|completed|enjoys)\b/i.test(intro);
    if (fp + par + tp > 1) voice.mixed++; else if (fp) voice.first++; else if (par) voice.parent++; else voice.third++;
  }

  console.log(`Profiles: ${profiles}  ·  voice → first-person ${voice.first}, third-person ${voice.third}, parents' ${voice.parent}, mixed ${voice.mixed}`);
  console.table(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, { rows: v.length, ids: v.slice(0, 12).join(', ') + (v.length > 12 ? ' …' : '') }])));
  window.__shaadiAudit = F;   // full lists: copy(window.__shaadiAudit)
  if (!Object.keys(F).length) console.log('✅ No findings');
})();
