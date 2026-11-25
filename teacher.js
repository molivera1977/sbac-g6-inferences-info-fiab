/* Teacher Access, ported from the Grade 5 Inferences site and split by class: each teacher has her own PIN
   and sees only her own class's rows. The PIN goes to the score sheet's script and is checked THERE (it
   is never in a page file); the script locks a computer out after 5 wrong PINs in 10 minutes.

   The class screen: the in-progress list, live (the question each student is on, right and wrong so far, a strip
   of every question); the finished list (each set: 1st try → latest try, how many tries, the best); a set picker; a question heat map (student × Q1–9, each student's 1st try or
   latest try of that set (a switch), ⏱ the time each try took, ✓/✗, bottom row % right, colored at 80 / 60 / 40); ⭐ Top 3 and 🔁 Bottom 3 questions with their
   text; a skill heat map under it; and an answer key (each passage plus every question, all choices, the right one
   green, every Why).

   No score sheet yet (11/18): the PIN screen offers "See sample data": invented students, labeled "Sample data",
   so the screen can be checked before anything is connected. */
(function () {
  'use strict';

  const A = window.G6App;
  const Sheet = window.G6Sheet;
  const { esc, cue } = window.G6Speech;
  const { SETS, TEACHERS, ALL_SETS, setLabel, itemsOf, typeLabel, questionText, multi, gradeFor, normName, show } = A;
  const $ = sel => document.querySelector(sel);

  let tTeacher = '';   // whose class is showing
  let tPin = '';       // kept in memory only, for Refresh
  let tSample = false;
  let heatSet = 'W';
  let heatMode = 'latest';   // the switch: each student's 'first' or 'latest' finished try (the heat maps, picks, Top 3)
  // the rows' order (asked 11/25: "the scores on the right should be sortable"): 'name' A–Z, or by score. Tap Score:
  // highest first, tap again: lowest first; tap Student: back to A–Z. Kept through the 20-second updates and the set tabs.
  let heatSort = 'name';
  const SORTS = { 'score-down': (a, b) => b.pct - a.pct, 'score-up': (a, b) => a.pct - b.pct };
  let students = [];
  let heatStats = [];  // the showing heat map's per-question numbers, for the question box
  let heatTotal = 0;   // how many students finished the showing set
  let heatDone = [];   // the showing heat map's students (the try the switch shows) with what they picked, for the box

  /* ------------------------------------------------------------ the PIN screen */
  function pickClass(code) {
    tTeacher = code;
    document.querySelectorAll('.tpin-class').forEach(b => {
      const on = b.dataset.teacher === code;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
  }
  function note(text) {
    $('#tpin-note').textContent = text;
    $('#tpin-note').hidden = !text;
  }
  // a class link: Teacher Access shows only that class
  if (A.CLASS) document.querySelectorAll('.tpin-class').forEach(b => { b.hidden = b.dataset.teacher !== A.CLASS; });
  function openPin() {
    pickClass(A.CLASS || '');
    tPin = '';
    heatMode = 'latest';   // each visit starts on the latest try
    $('#tpin-input').value = '';
    note('');
    $('#tpin-sample').hidden = Sheet.connected;
    show('tpin');
  }
  const ERRORS = {
    'Wrong PIN': 'That PIN did not work.',
    Locked: 'Too many wrong PINs on this computer. Try again in 10 minutes.',
    'PIN not set': "This class's PIN is not set up in the score sheet yet (apps-script/README.md)."
  };
  async function openScores() {
    if (!tTeacher) { note('Pick your class first.'); return; }
    const pin = $('#tpin-input').value.trim();
    if (!Sheet.connected) { note("No score sheet is connected yet, so a PIN can't be checked. Press See sample data."); return; }
    if (!pin) { note('Type your PIN.'); return; }
    note('Checking…');
    try {
      const r = await Sheet.loadScores(tTeacher, pin);
      if (!r.ok) { note(ERRORS[r.error] || `The score sheet answered: ${r.error}`); return; }
      tPin = pin;
      $('#tpin-input').value = '';
      showClass(r.rows, false);
      autoRefresh();
    } catch (e) {
      note("Couldn't reach the score sheet. Check the internet, then try again.");
    }
  }

  /* ------------------------------------------------------------ sample data (preview only)
     Eight invented students, every one named "… Sample", made up the same way each time from the
     questions themselves. Nothing here comes from, or goes to, a real class. */
  function sampleRows() {
    const plan = [
      ['Ava Sample', 0.95, ['W', 'W2', 'R', 'R2', 'TA', 'TB']],
      ['Ben Sample', 0.88, ['W', 'W2', 'R', 'R2', 'TA', 'TB']],
      ['Cora Sample', 0.8, ['W', 'W2', 'R', 'R2', 'TA']],
      ['Dev Sample', 0.72, ['W', 'W2', 'R', 'TA']],
      ['Eli Sample', 0.64, ['W', 'W2', 'R', 'TA:5']],
      ['Fay Sample', 0.56, ['W', 'R']],
      ['Gus Sample', 0.48, ['W', 'W2', 'R:4']],
      ['Hana Sample', 0.4, ['W', 'W2', 'W']],
      // a teacher let these take a set again (Class Scores: 1st try → latest try)
      ['Dev Sample', 0.9, ['W']],
      ['Gus Sample', 0.25, ['W']],
      ['Fay Sample', 0.75, ['R']]
    ];
    const TOOK = [14, 22, 9, 31, 18, 0.5, 26, 12, 85, 7, 41];   // ⏱ minutes each sample try took (85: stopped and came back)
    const harder = { W: 0, W2: 0.02, R: 0.08, R2: 0.1, TA: 0.16, TB: 0.16 };
    const spot = [0, 0.1, 0.16, 0.04, 0.14, 0.06, 0.2, 0.02, 0.12];   // one per question
    let seed = 20261117;
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
    // a wrong answer, not always the same one (so "what students picked" has something to count), made up the same way each time
    const oneOf = list => list[Math.floor(rnd() * list.length)];
    const others = (n, keep) => Array.from({ length: n }, (_, k) => k).filter(k => !keep.includes(k));
    const wrongPick = it => {
      if (it.type === 'mc') return oneOf(others(4, [it.answer]));
      if (multi(it)) {
        const wrong = others(it.pieces.length, it.answer);
        if (it.pick === 1) return [oneOf(wrong)];
        const one = oneOf(wrong);   // two: one right + one wrong, or two wrong
        const two = rnd() < 0.5 ? oneOf(it.answer) : oneOf(wrong.filter(k => k !== one));
        return [one, two].sort((a, b) => a - b);
      }
      return [oneOf(others(4, [it.partA.answer])), oneOf([0, 1, 2, 3])];
    };
    const rightPick = it => (it.type === 'ebsr' ? [it.partA.answer, it.partB.answer] : it.answer);
    const start = Date.now() - 4 * 864e5;
    let tick = 0;
    const rows = [];
    plan.forEach(([name, skill, sets]) => sets.forEach(entry => {
      const [set, upTo] = entry.split(':');
      const items = itemsOf(set);
      const answered = upTo ? Number(upTo) : items.length;
      const answers = {};
      const missed = [];
      items.slice(0, answered).forEach((it, i) => {
        const ok = rnd() < skill - harder[set] - spot[i];
        answers[it.id] = [ok ? 1 : 0, ok ? rightPick(it) : wrongPick(it)];
        if (!ok) missed.push(it.id);
      });
      const pts = answered - missed.length;
      const finished = answered === items.length;
      tick += 1;
      const at = new Date(start + tick * 37 * 60000 + (finished ? 0 : 3 * 864e5)).toISOString();
      rows.push({
        savedAt: at, saveId: `S-sample-${rows.length + 1}`, name, set, pts, tot: items.length,
        pct: Math.round((pts / (finished ? items.length : answered)) * 100), grade: '', missed: missed.join(', '),
        finishedAt: finished ? at : '', status: finished ? 'Finished' : 'In progress', answered,
        answers: JSON.stringify(answers), startedAt: new Date(Date.parse(at) - TOOK[tick % TOOK.length] * 60000).toISOString(), updatedAt: at
      });
    }));
    return rows;
  }

  /* ------------------------------------------------------------ the class screen */
  const rowTime = r => Date.parse(r.updatedAt || r.finishedAt || r.savedAt) || 0;
  const pctOf = r => Math.round(Number(r.pct)) || 0;   // a score from the sheet, as a number only
  const tidyName = n => String(n).trim().replace(/\s+/g, ' ').replace(/(^|\s)(\S)/g, (m, sp, c) => sp + c.toUpperCase());

  // One entry per student; per set: every finished try (first = the oldest, latest = the newest, best = the highest),
  // and a try still in progress
  function groupStudents(rows) {
    const out = {};
    rows.forEach(r => {
      const key = normName(r.name);
      if (!key || !SETS[r.set]) return;
      const st = out[key] || (out[key] = { name: '', sets: {} });
      st.name = tidyName(r.name);
      const c = st.sets[r.set] || (st.sets[r.set] = { tries: [], first: null, latest: null, best: null, now: null });
      if (r.status === 'In progress') { if (!c.now || rowTime(r) > rowTime(c.now)) c.now = r; return; }
      if (r.status !== 'Finished') return;
      c.tries.push(r);
      if (!c.first || rowTime(r) < rowTime(c.first)) c.first = r;
      if (!c.latest || rowTime(r) >= rowTime(c.latest)) c.latest = r;
      if (!c.best || pctOf(r) > pctOf(c.best)) c.best = r;
    });
    Object.values(out).forEach(st => Object.keys(st.sets).forEach(s => {
      const c = st.sets[s];
      if (c.now && c.latest && rowTime(c.latest) >= rowTime(c.now)) c.now = null;
      if (!c.latest && !c.now) delete st.sets[s];
    }));
    return Object.values(out).filter(st => Object.keys(st.sets).length)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  function ago(iso) {
    const mins = Math.round((Date.now() - (Date.parse(iso) || 0)) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    if (mins < 24 * 60) return `${Math.round(mins / 60)} hr ago`;
    return new Date(iso).toLocaleDateString();
  }

  const heatClass = pct => (pct >= 80 ? 'h-hi' : pct >= 60 ? 'h-mid' : pct >= 40 ? 'h-low' : 'h-bad');

  /* A student in the middle of a set, live: the question they are on (their own count: each student meets the passages
     in their own order), how many right and how many wrong so far, and a strip with every question of the set by its
     real number (✓ right · ✗ wrong · blank = not answered yet). Saved after every answer; the screen updates by itself. */
  const AUTO_MS = 20000;
  function liveText(r) {
    const tot = Number(r.tot) || itemsOf(r.set).length;
    const answered = Number(r.answered) || 0;
    const right = Number(r.pts) || 0;
    return `on question ${Math.min(answered + 1, tot)} of ${tot} · ${right} right · ${answered - right} wrong`;
  }
  // 📍 Right Now (11/21, from the class dashboard): the questions missed so far in this try, in words; and the share right
  // so far (nothing answered yet counts as all right, so it sorts last)
  function liveShare(r) {
    const answered = Number(r.answered) || 0;
    return answered ? (Number(r.pts) || 0) / answered : 1;
  }
  /* The misses so far, easy to read (Marcos 11/23, after Mrs. Wright's copy): one question a line, what the student
     picked and the right answer after it. */
  function liveMissed(r) {
    const a = answersOf(r);
    const missed = itemsOf(r.set).map((it, i) => ({ it, i })).filter(({ it }) => a[it.id] && !a[it.id][0]);
    if (!missed.length) return '';
    return `<div class="t-live-miss"><p class="lm-h">Missed so far:</p><ol class="lm-list">${missed.map(({ it, i }) => {
      const picked = pickedText(it, a[it.id][1]);
      return `<li><b class="lm-n">${i + 1}.</b><span class="lm-line"><span class="lm-q">${cue(questionText(it))}</span>`
        + `${picked == null ? '' : ` <span class="lm-pick">✗ picked <b>${esc(picked)}</b></span>`}`
        + ` <span class="lm-right">✓ right answer <b>${esc(rightAnswerText(it))}</b></span></span></li>`;
    }).join('')}</ol></div>`;
  }
  /* 🔎 TAP A BOX (Marcos 11/23, from Mrs. Wright's copy: "im suppose to be able to click on them"): every box is a
     button; it opens a box right under that student's row — the heat map's "what this student picked" box for a ✓ or ✗
     (the pick and what they heard), "has not answered it yet" for an empty one — with the question and its right answer.
     One box at a time; the 20-second update keeps it open with its student (found by name and set, not by place). */
  const liveKey = w => `${normName(w.name)}|${w.r.set}`;
  let workingList = [];   // the In progress list on the screen: { name, r }
  let liveOpen = null;    // the open box: { key, q } (q = 0-based question)
  function liveStrip(w) {
    const r = w.r, a = answersOf(r), k = esc(liveKey(w));
    return `<span class="t-strip" role="group" aria-label="${esc(w.name)}: each question so far. Tap one to see it.">${itemsOf(r.set).map((it, i) => {
      const x = a[it.id];
      const mark = !x ? '' : x[0] ? '✓' : '✗';
      return `<button type="button" class="ts-q ${!x ? 'ts-wait' : x[0] ? 'ts-ok' : 'ts-miss'}" data-live="${k}" data-q="${i}" aria-expanded="false" title="${esc(w.name)} · question ${i + 1}: ${!x ? 'not answered yet' : x[0] ? 'right' : 'wrong'}"><i>${i + 1}</i>${mark}</button>`;
    }).join('')}</span><div class="t-qbox t-livebox" data-live-box="${k}" hidden></div>`;
  }
  // The box for question i (0-based) of one student working now
  function liveBoxHTML(w, i) {
    const it = itemsOf(w.r.set)[i];
    const answers = answersOf(w.r);
    const x = answers[it.id];
    const who = Array.isArray(x)
      ? studentHTML(it, { name: w.name, answers, missed: new Set(x[0] ? [] : [it.id]), take: 'working now' })
      : `<div class="t-student wait"><p><b>${esc(w.name)}</b> has not answered it yet.</p></div>`;
    const asked = askedHTML(it);
    return `<div class="t-qbox-head"><b>Question ${i + 1}</b><span class="kq-skill">${esc(it.skill)}</span>
        <button type="button" class="t-qbox-x" data-live-close aria-label="Close question ${i + 1}">✕</button></div>
      ${who}
      ${asked}
      <p class="t-qbox-a t-live-right"><b>Right answer:</b> ${esc(rightAnswerText(it))}</p>`;
  }
  // Open the box for one student's question i, or close it when that one is already open
  function toggleLive(key, i) {
    liveOpen = liveOpen && liveOpen.key === key && liveOpen.q === i ? null : { key, q: i };
    drawLive();
  }
  // Show the open box (if its student is still working) under that student; mark its button
  function drawLive() {
    const w = liveOpen ? workingList.find(x => liveKey(x) === liveOpen.key) : null;
    if (!w || !itemsOf(w.r.set)[liveOpen.q]) liveOpen = null;
    document.querySelectorAll('#t-body .t-livebox').forEach(box => {
      const on = !!liveOpen && box.dataset.liveBox === liveOpen.key;
      box.innerHTML = on ? liveBoxHTML(w, liveOpen.q) : '';
      box.hidden = !on;
    });
    document.querySelectorAll('#t-body .ts-q[data-live]').forEach(b => {
      const on = !!liveOpen && b.dataset.live === liveOpen.key && b.dataset.q === String(liveOpen.q);
      b.classList.toggle('on', on);
      b.setAttribute('aria-expanded', String(on));
    });
  }
  /* 📊 SCORE SO FAR (Marcos 11/23: "there's no score so far like a percentage"): right ÷ the questions answered so far as
     a % (his dashboard's rule), colored like the heat map. The row says what the % means — "4 of 6 right so far 67%",
     like Mrs. Wright's Base Ten (his pick, 11/23); none answered = "no answers yet", no %. The list's order (liveShare)
     uses the same share. */
  function soFarHTML(r) {
    const answered = Math.max(0, Math.floor(Number(r.answered)) || 0), right = Math.max(0, Math.floor(Number(r.pts)) || 0);
    const tot = Number(r.tot) || itemsOf(r.set).length;
    const where = `on question ${Math.min(answered + 1, tot)} of ${tot}`;
    if (!answered) return `${where} · no answers yet`;
    const pct = Math.round(right / answered * 100);
    return `${where} · ${right} of ${answered} right so far <span class="t-pill ${heatClass(pct)}" title="Right out of the questions answered so far">${pct}%</span>`;
  }

  /* Skill heat map, under the question heat map (which stays as it is): the questions grouped by skill, each skill
     under the standard it practices — the FIAB covers two (the map names both, not one per question), so this grouping
     is ours: central idea and summary = RI.6.2; inferences and the evidence that supports them = RI.6.1. Grade 6 has
     one skill per standard, so a standard's own column (all its skills together) is added only when a standard holds
     more than one skill (Grade 5 had two under RI.5.1); here it would repeat the skill's numbers. */
  const SKILL_GROUPS = [
    { name: 'Central idea and summary', std: 'RI.6.2', qs: [1, 2, 5, 8] },
    { name: 'Inferences and the evidence that supports them', std: 'RI.6.1', qs: [3, 4, 6, 7, 9] }
  ];
  const STANDARDS = [...new Set(SKILL_GROUPS.map(g => g.std))].sort().filter(std => SKILL_GROUPS.filter(g => g.std === std).length > 1);
  /* What each standard says (asked 11/18: "the standards should say what they are"): a short plain name, and the
     official wording from thecorestandards.org (on hover over a standard column, and in a list under the map). */
  const STD_WORDS = {
    'RI.6.1': { short: "Cite text evidence for inferences", full: "Cite textual evidence to support analysis of what the text says explicitly as well as inferences drawn from the text." },
    'RI.6.2': { short: "Central idea and summary", full: "Determine a central idea of a text and how it is conveyed through particular details; provide a summary of the text distinct from personal opinions or judgments." }
  };
  function skillHTML(set, done, items) {
    const byN = Object.fromEntries(items.map((it, i) => [i + 1, it]));
    const cols = [...SKILL_GROUPS.map(g => ({ label: g.name, sub: `${g.std} · Q${g.qs.join(', ')}`, qs: g.qs })),
      ...STANDARDS.map(std => ({ label: std, sub: 'all its questions', qs: SKILL_GROUPS.filter(g => g.std === std).flatMap(g => g.qs), std: true }))];
    const score = (d, qs) => {
      const right = qs.filter(n => byN[n] && !d.missed.has(byN[n].id)).length;
      return { right, of: qs.length, pct: Math.round((right / qs.length) * 100) };
    };
    skCols = cols;
    // every box, every skill or standard name and every % is a button: it opens the box under this map (asked 11/25)
    const cell = (d, si, c, ci) => {
      const { right, of, pct } = score(d, c.qs);
      const what = `${esc(d.name)} · ${esc(c.label)}: ${right} of ${of} right`;
      return `<td class="${heatClass(pct)}"><button type="button" class="sk-cell" data-c="${ci}" data-s="${si}" aria-expanded="false" aria-controls="t-skbox" aria-label="${what}. Show the answers." title="${what} · tap to see the answers">${right}/${of}</button></td>`;
    };
    const body = done.map((d, si) => `<tr><th scope="row">${esc(d.name)}</th>${cols.map((c, ci) => cell(d, si, c, ci)).join('')}</tr>`).join('');
    const foot = cols.map((c, ci) => {
      const right = done.reduce((n, d) => n + score(d, c.qs).right, 0);
      const pct = Math.round((right / (done.length * c.qs.length)) * 100);
      return `<td class="${heatClass(pct)}"><button type="button" class="sk-pbtn" data-c="${ci}" aria-expanded="false" aria-controls="t-skbox" aria-label="${esc(c.label)}: ${pct}% right. Show its questions." title="${esc(c.label)} · tap to see its questions">${pct}</button></td>`;
    }).join('');
    return `<h3 class="t-sub">Skill heat map <span>(${esc(setLabel(set))} · each student's ${tryWord()} · right out of the questions in that skill)</span></h3>
      <p class="t-legend"><b>tap a box</b> to see that student's answers in that skill or standard · <b>tap a skill, a standard or its %</b> to see its questions</p>
      <div class="t-wrap"><table class="t-heat t-skill"><thead><tr><th scope="col">Student</th>${cols.map((c, ci) => (c.std
        ? `<th scope="col" class="sk-std" title="${esc(STD_WORDS[c.label].full)}"><button type="button" class="sk-head" data-c="${ci}" aria-expanded="false" aria-controls="t-skbox">${esc(c.label)}<span class="sk-name">${esc(STD_WORDS[c.label].short)}</span><span class="sk-sub">${esc(c.sub)}</span></button></th>`
        : `<th scope="col" class=""><button type="button" class="sk-head" data-c="${ci}" aria-expanded="false" aria-controls="t-skbox">${esc(c.label)}<span class="sk-sub">${esc(c.sub)}</span></button></th>`)).join('')}</tr></thead>
      <tbody>${body}</tbody><tfoot><tr><th scope="row">% right</th>${foot}</tr></tfoot></table></div>
      <div id="t-skbox" class="t-qbox t-skbox" role="region" aria-live="polite" hidden></div>
      <ul class="t-stds" aria-label="What each standard says">${[...new Set(SKILL_GROUPS.map(g => g.std))].sort().map(std => `<li><b>${esc(std)} · ${esc(STD_WORDS[std].short)}:</b> ${esc(STD_WORDS[std].full)}</li>`).join('')}</ul>`;
  }
  const pctHTML = r => `<span class="${gradeFor(pctOf(r)).c}">${pctOf(r)}%</span>`;
  const tryWord = () => (heatMode === 'first' ? '1st try' : 'latest try');

  /* ⏱ Time on a try (asked 11/18): its "Finished at" minus its "Started at". Clock time, so a student who stopped and
     came back later shows the whole span. Numbers only: each time is read as a date (the ISO text the site saves, or a
     date the sheet gave back), and no sheet text is ever shown; "—" when a time is missing, can't be read, or comes out
     backwards. */
  const timeOf = v => {
    const s = String(v == null ? '' : v).trim();
    const readable = /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s) || /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{4} \d\d:\d\d:\d\d GMT[+-]\d{4}/.test(s);
    return readable ? Date.parse(s) : NaN;
  };
  function tookText(r) {
    const ms = timeOf(r.finishedAt) - timeOf(r.startedAt);
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'under 1 min';
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)} hr ${mins % 60} min`;
  }

  function classHTML() {
    // 📍 Right Now (11/21, from the class dashboard): the student with the lowest share right comes first, then the newest
    const working = students.flatMap(st => ALL_SETS.filter(s => st.sets[s] && st.sets[s].now).map(s => ({ name: st.name, r: st.sets[s].now })))
      .sort((a, b) => liveShare(a.r) - liveShare(b.r) || rowTime(b.r) - rowTime(a.r));
    workingList = working;
    const finished = students.reduce((n, st) => n + Object.values(st.sets).reduce((k, c) => k + c.tries.length, 0), 0);
    const cell = c => {
      if (!c) return '<span class="t-none">—</span>';
      // 1st try → latest try, how many tries and the best (one try: its score and "1 try")
      const n = c.tries.length;
      const done = !n ? '' : n === 1 ? `<b>${pctHTML(c.first)}</b><span>1 try</span>`
        : `<b>${pctHTML(c.first)} → ${pctHTML(c.latest)}</b><span>${n} tries · best ${pctOf(c.best)}%</span>`;
      const now = c.now ? `<span class="t-now">▶ ${liveText(c.now)}</span>` : '';
      return done + now;
    };
    return `<p class="t-sum">${students.length} ${students.length === 1 ? 'student' : 'students'} · ${finished} finished ${finished === 1 ? 'set' : 'sets'} · ${working.length} in progress</p>
      <h3 class="t-sub">In progress <span>(saved after every answer · lowest share right first${tSample ? ' · sample' : ` · updates by itself every ${AUTO_MS / 1000} seconds`})</span></h3>
      ${tSample ? '' : `<p id="t-updated" class="t-updated">Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</p>`}
      ${working.length ? `<p class="t-hint">🔎 Tap a numbered box to see that question: what the student picked and the right answer.</p><ul class="t-working">${working.map(w => `<li><b>${esc(w.name)}</b> · ${setLabel(w.r.set)} · ${soFarHTML(w.r)}
        <span class="t-ago">${ago(w.r.updatedAt)}</span>${liveStrip(w)}${liveMissed(w.r)}</li>`).join('')}</ul>` : '<p class="t-msg">No one is in the middle of a set.</p>'}
      <h3 class="t-sub">Finished <span>(1st try → latest try · ▶ = working on it now)</span></h3>
      <div class="t-wrap"><table class="t-table"><thead><tr><th>Student</th>${ALL_SETS.map(s => `<th>${setLabel(s)}</th>`).join('')}</tr></thead>
        <tbody>${students.map(st => `<tr><td>${esc(st.name)}</td>${ALL_SETS.map(s => `<td>${cell(st.sets[s])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <h3 class="t-sub">Question heat map <span>(pick a try and a set)</span></h3>
      <div class="key-tabs t-tabs t-modes" role="group" aria-label="Which try">${[['first', '1st try'], ['latest', 'Latest try']].map(([m, w]) => `<button type="button" class="key-tab" data-mode="${m}" aria-pressed="false">${w}</button>`).join('')}</div>
      <div class="key-tabs t-tabs" role="tablist" aria-label="Set">${ALL_SETS.map(s => `<button type="button" class="key-tab" data-heat="${s}">${setLabel(s)}</button>`).join('')}</div>
      <div id="t-heat"></div>
      <div id="t-skillmap"></div>`;
  }

  // The students who finished a set, one row each: their 1st or latest finished try (mode 'first' | 'latest')
  const doneOf = (set, mode) => students.filter(st => st.sets[set] && st.sets[set][mode]).map(st => {
    const r = st.sets[set][mode];
    return { name: st.name, pct: pctOf(r), tries: st.sets[set].tries.length, took: tookText(r), answers: answersOf(r),
      missed: new Set(String(r.missed).split(',').map(x => x.trim()).filter(Boolean)) };
  });

  // One row per student who has finished this set (the try the switch shows: 1st or latest), one column per question
  function heatHTML(set) {
    const items = itemsOf(set);
    const done = doneOf(set, heatMode);
    if (!done.length) { heatDone = []; return `<p class="t-msg">No one has finished ${setLabel(set)} yet.</p>`; }
    if (SORTS[heatSort]) done.sort(SORTS[heatSort]);   // a new list (doneOf); equal scores stay A–Z
    const stats = items.map((it, i) => {
      const right = done.filter(d => !d.missed.has(it.id)).length;
      return { it, i, right, pct: Math.round((right / done.length) * 100) };
    });
    // every ✓ / ✗ is a button: it opens the question's box with what that student picked
    const cell = (d, si, it, i) => {
      const miss = d.missed.has(it.id);
      const what = `${esc(d.name)} · question ${i + 1}: ${miss ? 'missed' : 'right'}`;
      return `<td class="${miss ? 'h-miss' : 'h-ok'}"><button type="button" class="h-cell" data-s="${si}" data-q="${i}" aria-expanded="false" aria-controls="t-qbox" aria-label="${what}. Show the answer picked." title="${what} · tap to see the answer picked">${miss ? '✗' : '✓'}</button></td>`;
    };
    const body = done.map((d, si) => `<tr><th scope="row">${esc(d.name)}${d.tries > 1 ? ` <span class="t-take">${heatMode === 'first' ? '1st' : 'latest'} of ${d.tries}</span>` : ''}</th>${items.map((it, i) => cell(d, si, it, i)).join('')}<td class="h-score ${gradeFor(d.pct).c}">${d.pct}%</td><td class="h-time">${d.took}</td></tr>`).join('');
    // most right first for the top 3, fewest right first for the bottom 3; ties go to the earlier question
    const top = stats.slice().sort((a, b) => b.right - a.right || a.i - b.i).slice(0, 3);
    const bottom = stats.slice().sort((a, b) => a.right - b.right || a.i - b.i).slice(0, 3);
    heatStats = stats;
    heatTotal = done.length;
    heatDone = done;
    // the bottom row's % opens the same box as the question number at the top (asked 11/25)
    const foot = `<tr><th scope="row">% right</th>${stats.map(s => `<td class="${heatClass(s.pct)}"><button type="button" class="h-pbtn" data-q="${s.i}" aria-expanded="false" aria-controls="t-qbox" aria-label="Question ${s.i + 1}: ${s.pct}% right. Show what students picked." title="Question ${s.i + 1} · ${s.right} of ${done.length} right · tap to see what students picked">${s.pct}</button></td>`).join('')}<td></td><td></td></tr>`;
    // Student and Score are buttons that set the rows' order; aria-sort says which order is on
    const sortHead = (key, label, on) => `<th scope="col" class="h-sorth"${on ? ` aria-sort="${on}"` : ''}><button type="button" class="h-sort${on ? ' on' : ''}" data-sort="${key}" title="${key === 'name' ? 'Sort by name, A to Z' : 'Sort by score (tap again to flip)'}">${label}<span class="h-arrow" aria-hidden="true">${on === 'descending' ? ' ▼' : on === 'ascending' ? ' ▲' : key === 'name' ? '' : ' ↕'}</span></button></th>`;
    const scoreOn = heatSort === 'score-down' ? 'descending' : heatSort === 'score-up' ? 'ascending' : null;
    const rankHTML = list => `<ol class="t-rank">${list.map(s => `<li><div class="t-rank-head"><b>Question ${s.i + 1}</b>
      <span class="t-pill ${heatClass(s.pct)}">${s.right} of ${done.length} right · ${s.pct}%</span></div>
      <div class="t-q"><i>${esc(s.it.skill)}:</i> ${cue(questionText(s.it))}</div></li>`).join('')}</ol>`;
    return `<p class="t-legend">${esc(setLabel(set))} · each student's <b>${tryWord()}</b> · <span class="h-ok">✓</span> right · <span class="h-miss">✗</span> missed · bottom row = % of the ${done.length} ${done.length === 1 ? 'student' : 'students'} who got that question right · <b>tap a question number or its %</b> to see that question and what students picked · <b>tap a ✓ or ✗</b> to see that student's answer · <b>tap Score</b> to sort by score (again to flip; tap Student for A–Z)</p>
      <div class="t-wrap"><table class="t-heat"><thead><tr>${sortHead('name', 'Student', heatSort === 'name' ? 'ascending' : null)}${items.map((it, i) => `<th scope="col"><button type="button" class="h-qbtn" data-q="${i}" aria-expanded="false" aria-controls="t-qbox" title="${esc(it.skill)}">${i + 1}</button></th>`).join('')}${sortHead('score', 'Score', scoreOn)}<th scope="col" title="Clock time, start to finish, for that try">Time</th></tr></thead>
      <tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div>
      <p class="t-note">⏱ Time = clock time, start to finish, for that try. If a student stopped and came back later, the time in between counts too. — means a time is missing.</p>
      <div id="t-qbox" class="t-qbox" role="region" aria-live="polite" hidden></div>
      <div class="t-rank-grid">
        <div class="t-rank-box t-top"><h4>⭐ Top 3 questions <span>most students right · ${tryWord()}</span></h4>${rankHTML(top)}</div>
        <div class="t-rank-box t-bottom"><h4>🔁 Bottom 3 questions <span>reteach these first · ${tryWord()}</span></h4>${rankHTML(bottom)}</div>
      </div>`;
  }

  /** The right answer of one question, in words (two-part: both parts; select-two: both sections). */
  function rightAnswerText(it) {
    if (it.type === 'mc') return it.choices[it.answer].t;
    if (it.type === 'ms') return it.answer.map(k => `${k + 1}. ${it.pieces[k].t}`).join(' · ');
    if (it.type === 'hottext') return it.answer.map(k => it.pieces[k].t).join(' · ');
    return `Part A: ${it.partA.choices[it.partA.answer].t} · Part B: ${it.partB.choices[it.partB.answer].t}`;
  }

  /* ------------------------------------------------------------ what students picked (asked 11/17: "can the teachers
     see what each student answered, not just right or wrong?"). The sheet keeps every pick: answers = { id: [ok, picked] }. */
  const answersOf = r => {
    try { const a = JSON.parse(r.answers || '{}'); return a && typeof a === 'object' ? a : {}; } catch (e) { return {}; }
  };
  const L = i => 'ABCD'[i];
  const pieceLabel = (it, k) => (it.type === 'ms' ? `${k + 1}. ` : `Section ${k + 1}: `) + it.pieces[k].t;
  /** What one student picked on one question, in words; null when nothing usable was saved for it. */
  function pickedText(it, picked) {
    if (picked == null) return null;
    if (it.type === 'mc') return Number.isInteger(picked) && it.choices[picked] ? `${L(picked)}. ${it.choices[picked].t}` : null;
    if (multi(it)) return Array.isArray(picked) && picked.length && picked.every(k => it.pieces[k]) ? picked.map(k => pieceLabel(it, k)).join(' · ') : null;
    if (!Array.isArray(picked) || !it.partA.choices[picked[0]] || !it.partB.choices[picked[1]]) return null;
    return `Part A: ${L(picked[0])}. ${it.partA.choices[picked[0]].t} · Part B: ${L(picked[1])}. ${it.partB.choices[picked[1]].t}`;
  }
  /** The Why for what was picked: the words the student heard after answering. */
  function pickedWhys(it, picked) {
    if (it.type === 'mc') return [it.choices[picked].why];
    if (multi(it)) return [...new Set(picked.map(k => it.pieces[k].why))];
    return [`Part A: ${it.partA.choices[picked[0]].why}`, `Part B: ${it.partB.choices[picked[1]].why}`];
  }
  /** How many of the showing students picked each choice, one group per part. */
  function pickCounts(it) {
    const saved = heatDone.map(d => (d.answers[it.id] || [])[1]).filter(p => pickedText(it, p) != null);
    if (it.type === 'mc') {
      return { saved: saved.length, groups: [{ title: '', rows: it.choices.map((c, i) => ({ label: `${L(i)}. ${c.t}`, n: saved.filter(p => p === i).length, right: i === it.answer })) }] };
    }
    if (multi(it)) {
      return { saved: saved.length, groups: [{ title: it.pick === 2 ? 'Each student picked 2.' : '',
        rows: it.pieces.map((c, k) => ({ label: pieceLabel(it, k), n: saved.filter(p => p.includes(k)).length, right: it.answer.includes(k) })) }] };
    }
    return { saved: saved.length, groups: ['A', 'B'].map((part, j) => {
      const d = it[`part${part}`];
      return { title: `Part ${part}`, rows: d.choices.map((c, i) => ({ label: `${L(i)}. ${c.t}`, n: saved.filter(p => p[j] === i).length, right: i === d.answer })) };
    }) };
  }
  function picksHTML(it) {
    const { saved, groups } = pickCounts(it);
    if (!saved) return '<p class="t-msg t-picks-none">No answers saved for this question yet.</p>';
    const row = (r, tops) => `<li class="pk-row${r.right ? ' pk-right' : ''}${tops.includes(r) ? ' pk-top' : ''}">
        <span class="pk-label">${r.right ? '✓ ' : ''}${esc(r.label)}${tops.includes(r) ? ` <em>${tops.length > 1 ? 'tied for most-picked wrong answer' : 'most-picked wrong answer'}</em>` : ''}</span>
        <span class="pk-bar" aria-hidden="true"><i style="width:${Math.round((r.n / saved) * 100)}%"></i></span><b class="pk-n">${r.n}</b></li>`;
    return `<div class="t-picks"><h5>What students picked <span>(${saved} ${saved === 1 ? 'student' : 'students'}, ${tryWord()})</span></h5>
      ${groups.map(g => {
        // the wrong answer(s) picked most (every one on a tie), when any wrong answer was picked
        const most = Math.max(0, ...g.rows.filter(r => !r.right).map(r => r.n));
        const tops = most > 0 ? g.rows.filter(r => !r.right && r.n === most) : [];
        return `${g.title ? `<p class="pk-title">${esc(g.title)}</p>` : ''}<ul class="pk-list">${g.rows.map(r => row(r, tops)).join('')}</ul>`;
      }).join('')}</div>`;
  }
  /** One student's answer to the question in the box: what they picked, right or wrong, and the Why they heard. */
  function studentHTML(it, d) {
    const a = d.answers[it.id];
    const picked = a ? a[1] : null;
    const text = pickedText(it, picked);
    const right = !d.missed.has(it.id);
    if (text == null) return `<div class="t-student"><p><b>${esc(d.name)}</b> <span class="t-take">(${d.take || tryWord()})</span>: ${right ? '✓ right' : '✗ missed'} · no answer saved for this question.</p></div>`;
    return `<div class="t-student ${right ? 'ok' : 'no'}"><p><b>${esc(d.name)}</b> picked ${right ? '✓' : '✗'} <span class="t-take">(${d.take || tryWord()})</span></p>
      <p class="t-student-pick">${esc(text)}</p>
      <p class="t-student-why"><b>What ${esc(d.name.split(' ')[0])} heard:</b> ${pickedWhys(it, picked).map(esc).join(' ')}</p></div>`;
  }

  /** The question as students see it (both parts of a two-part question). */
  function askedHTML(it) {
    return it.type === 'ebsr'
      ? `<p class="t-qbox-q t-live-ask"><b>Part A:</b> ${cue(it.partA.q)}</p><p class="t-qbox-q t-live-ask"><b>Part B:</b> ${cue(it.partB.q)}</p>`
        : `<p class="t-qbox-q t-live-ask">${cue(it.stem)}</p>`;
  }

  /** The box under the heat map for question number i (0-based) of the showing set; si = a student's row (a ✓/✗ tapped). */
  function qBoxHTML(i, si) {
    const s = heatStats[i];
    const it = s.it;
    const asked = it.type === 'ebsr'
      ? `<p class="t-qbox-q"><b>Part A:</b> ${cue(it.partA.q)}</p><p class="t-qbox-q"><b>Part B:</b> ${cue(it.partB.q)}</p>`
      : it.box ? `<p class="t-qbox-q">${esc(it.lead)}</p><div class="sum-box t-qbox-sum">${esc(it.box)}</div><p class="t-qbox-q">${cue(it.stem)}</p>`
      : `<p class="t-qbox-q">${cue(it.stem)}</p>`;
    return `<div class="t-qbox-head"><b>Question ${i + 1}</b><span class="kq-skill">${esc(it.skill)}</span>
        <span class="t-pill ${heatClass(s.pct)}">${s.right} of ${heatTotal} right · ${s.pct}%</span>
        <button type="button" class="t-qbox-x" data-qclose aria-label="Close question ${i + 1}">✕</button></div>
      ${si != null && heatDone[si] ? studentHTML(it, heatDone[si]) : ''}
      ${asked}
      <p class="t-qbox-a"><b>Right answer:</b> ${esc(rightAnswerText(it))}</p>
      ${picksHTML(it)}
      <button type="button" class="btn t-qbox-key" data-qkey>See every choice and why in the answer key</button>`;
  }

  /** Open the box for question i (and student si, when a ✓/✗ was tapped), or close it when that is already open. */
  function toggleQ(i, si) {
    const box = $('#t-qbox');
    if (!box) return;
    const who = si == null ? '' : String(si);
    const same = !box.hidden && box.dataset.q === String(i) && (box.dataset.s || '') === who;
    document.querySelectorAll('#t-heat .h-qbtn, #t-heat .h-pbtn').forEach(b => {   // the number and its % open the same box
      const on = !same && !who && b.dataset.q === String(i);
      b.classList.toggle('on', on);
      b.setAttribute('aria-expanded', String(on));
    });
    document.querySelectorAll('.h-cell').forEach(b => {
      const on = !same && Boolean(who) && b.dataset.q === String(i) && b.dataset.s === who;
      b.classList.toggle('on', on);
      b.setAttribute('aria-expanded', String(on));
    });
    if (same) { box.hidden = true; box.dataset.q = ''; box.dataset.s = ''; box.dataset.who = ''; return; }
    box.innerHTML = qBoxHTML(i, si);
    box.dataset.q = String(i);
    box.dataset.s = who;
    box.dataset.who = who ? heatDone[si].name : '';
    box.hidden = false;
  }
  // which box is open: the question and, for a ✓ / ✗, that student (by name, so a redraw in a new order finds them again)
  function openBox() {
    const box = $('#t-qbox');
    return box && !box.hidden ? { q: Number(box.dataset.q), who: box.dataset.who || '' } : null;
  }
  function reopen(keep) {
    if (!keep || !heatStats[keep.q]) return;
    const si = keep.who ? heatDone.findIndex(d => d.name === keep.who) : -1;
    if (!keep.who) toggleQ(keep.q);
    else if (si >= 0) toggleQ(keep.q, si);
  }

  /* The skill / standard map's box (asked 11/25: "wouldn't it be helpful that all these be clickable?"). A student's box →
     that student's answer on each question of that skill or standard (the question, the right answer, what they picked
     and heard). A skill or standard name, or its % → its questions, each with its % right and its most-picked wrong
     answer; a question's number opens its box under the heat map (what students picked). One box at a time; tap the
     same thing again to close it. Kept through the 20-second updates, the sort and 1st try / latest try. */
  let skCols = [];      // the map's columns as drawn: { label, sub, qs: question numbers, std }
  let skOpen = null;    // the open box: { c: column, who: a student's name, or '' for the whole group }
  const skItem = n => itemsOf(heatSet)[n - 1];
  const skScore = (d, qs) => { const right = qs.filter(n => skItem(n) && !d.missed.has(skItem(n).id)).length; return { right, of: qs.length, pct: Math.round((right / qs.length) * 100) }; };
  const skGroup = c => { const right = heatDone.reduce((n, d) => n + skScore(d, c.qs).right, 0), of = heatDone.length * c.qs.length; return { right, of, pct: Math.round((right / of) * 100) }; };
  // the wrong answer 2 or more students picked most (each part of a two-part question on its own; every one on a tie)
  function topWrong(it) {
    return pickCounts(it).groups.map(g => {
      const wrong = g.rows.filter(r => !r.right);
      const most = Math.max(0, ...wrong.map(r => r.n));
      const tops = most >= 2 ? wrong.filter(r => r.n === most) : [];
      return tops.length ? `${/^Part /.test(g.title) ? `${esc(g.title)}: ` : ''}${tops.map(r => esc(r.label)).join(' <i>or</i> ')} <span class="sk-n">(${most} students${tops.length > 1 ? ' each' : ''})</span>` : '';
    }).filter(Boolean);
  }
  function skBoxHTML(c, d) {
    const col = skCols[c];
    const title = `<span class="kq-skill">${esc(col.label)}${col.std && STD_WORDS[col.label] ? ` · ${esc(STD_WORDS[col.label].short)}` : ''}</span>`;
    const x = '<button type="button" class="t-qbox-x" data-skclose aria-label="Close">✕</button>';
    if (d) {
      const s = skScore(d, col.qs);
      return `<div class="t-qbox-head"><b>${esc(d.name)}</b>${title}<span class="t-pill ${heatClass(s.pct)}">${s.right} of ${s.of} right · ${s.pct}%</span>${x}</div>
        ${col.qs.filter(skItem).map(n => {
          const it = skItem(n);
          return `<div class="sk-q"><h5>Question ${n}</h5><div class="t-qbox-stem">${askedHTML(it)}</div>
            <p class="t-qbox-a"><b>Right answer:</b> ${esc(rightAnswerText(it))}</p>${studentHTML(it, d)}</div>`;
        }).join('')}`;
    }
    const g = skGroup(col);
    const line = n => {
      const s = heatStats[n - 1];
      if (!s) return '';
      const tw = topWrong(s.it);
      return `<li class="sk-line"><button type="button" class="h-qbtn sk-openq" data-q="${n - 1}" aria-controls="t-qbox" title="Question ${n}: tap to see what students picked">${n}</button>
        <div class="sk-line-body"><span class="t-pill ${heatClass(s.pct)}">${s.right} of ${heatDone.length} right · ${s.pct}%</span>
        <span class="sk-sum">${cue(questionText(s.it))}</span>
        <span class="sk-top">${tw.length ? `<b>Most-picked wrong answer:</b> ${tw.join(' · ')}` : 'No wrong answer was picked by 2 or more students.'}</span></div></li>`;
    };
    return `<div class="t-qbox-head"><b>${col.std ? 'Standard' : 'Skill'}</b>${title}<span class="t-pill ${heatClass(g.pct)}">${g.right} of ${g.of} answers right · ${g.pct}%</span>${x}</div>
      <p class="t-note sk-hint">Tap a question's number to see what students picked.</p>
      <ul class="sk-lines">${col.qs.map(line).join('')}</ul>`;
  }
  // draw the box for skOpen (or close it), and mark what is open
  function drawSk() {
    const box = $('#t-skbox');
    if (!box) return;
    const d = skOpen && skOpen.who ? heatDone.find(x => x.name === skOpen.who) : null;
    if (skOpen && (!skCols[skOpen.c] || (skOpen.who && !d))) skOpen = null;   // that column or student is not on the map now
    document.querySelectorAll('#t-skillmap .sk-cell, #t-skillmap .sk-head, #t-skillmap .sk-pbtn').forEach(b => {
      const cell = b.classList.contains('sk-cell');
      const on = Boolean(skOpen) && Number(b.dataset.c) === skOpen.c && (cell ? Boolean(d) && heatDone[Number(b.dataset.s)] === d : !skOpen.who);
      b.classList.toggle('on', on);
      b.setAttribute('aria-expanded', String(on));
    });
    box.innerHTML = skOpen ? skBoxHTML(skOpen.c, d) : '';
    box.hidden = !skOpen;
  }
  // a box (si = a student's row) or a name / % (si = null): open it, or close it when that one is open
  function toggleSk(c, si) {
    const who = si == null ? '' : heatDone[si].name;
    skOpen = skOpen && skOpen.c === c && skOpen.who === who ? null : { c, who };
    drawSk();
  }
  // a question's number in the skill box: open that question's box under the heat map (never close it) and go there
  function openQ(i) {
    const box = $('#t-qbox');
    if (!box || !heatStats[i]) return;
    if (box.hidden || box.dataset.q !== String(i) || box.dataset.s) toggleQ(i);
    box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // keepBox: the box to open again after drawing (undefined = the one open now, when the set stays the same)
  function showHeat(set, keepBox) {
    const keep = keepBox !== undefined ? keepBox : (set === heatSet ? openBox() : null);
    if (set !== heatSet) skOpen = null;   // another set: other questions
    heatSet = set;
    document.querySelectorAll('[data-heat]').forEach(t => t.classList.toggle('on', t.dataset.heat === set));
    document.querySelectorAll('[data-mode]').forEach(t => {   // the 1st try / Latest try switch
      const on = t.dataset.mode === heatMode;
      t.classList.toggle('on', on);
      t.setAttribute('aria-pressed', String(on));
    });
    $('#t-heat').innerHTML = heatHTML(set);
    // the skill heat map, right under the question heat map (which stays as it is)
    $('#t-skillmap').innerHTML = heatDone.length ? skillHTML(set, heatDone, itemsOf(set)) : '';
    drawSk();
    reopen(keep);
  }

  function showClass(rows, sample) {
    tSample = sample;
    students = groupStudents(rows);
    // the teacher/admin guest link with no class link shows a SAMPLE class, so it names both grade-level teachers
    // (Marcos 11/19: "should it specifically say Richardson? how about both grade level teachers")
    const whose = window.SHARE_TEACHER && !A.CLASS ? Object.values(TEACHERS).join(' & ') : TEACHERS[tTeacher];
    $('#t-title').textContent = `Class Scores · ${whose}`;
    $('#t-sample').hidden = !sample;
    // the teacher/admin guest view says how the real page works (Marcos 11/19: "mention about the pin so admin knows.
    // and how each teacher will only see their class data")
    const pinNote = $('#t-pin-note');
    pinNote.hidden = !(window.SHARE_TEACHER && sample);
    if (!pinNote.hidden) pinNote.textContent = `🔒 ${Object.values(TEACHERS).join(' and ')} each open this page with their own PIN in Teacher Access. Each PIN opens only that teacher's class, with real student names and scores. Admins see sample students only.`;
    $('#t-refresh').hidden = sample;
    show('teacher');
    fillFix();
    if (!students.length) { $('#t-body').innerHTML = '<p class="t-msg">No work yet. Rows show up here after each answer a student checks.</p>'; return; }
    $('#t-body').innerHTML = classHTML();
    drawLive();
    const hasDone = s => students.some(st => st.sets[s] && st.sets[s].latest);
    if (!hasDone(heatSet)) { heatSet = ALL_SETS.find(hasDone) || 'W'; skOpen = null; }
    showHeat(heatSet);
  }

  let autoTimer = null;
  function autoRefresh() {
    clearTimeout(autoTimer);
    if (tSample || !tPin) return;
    autoTimer = setTimeout(async () => {
      if (document.body.dataset.screen === 'teacher' && !document.hidden) await refresh(true);
      autoRefresh();
    }, AUTO_MS);
  }
  /* A misspelled name (asked 11/18): the class's names in a list; the right first and last name; the score sheet moves every
     row of that name (it checks the PIN again). The panel sits outside the part that updates itself, so typing is never lost. */
  function fillFix() {
    const sel = $('#fix-from');
    const keep = sel.value;
    sel.innerHTML = students.map(st => `<option>${esc(st.name)}</option>`).join('');
    if (students.some(st => st.name === keep)) sel.value = keep;
    $('#t-fix').hidden = tSample || !students.length;
  }
  async function fixName() {
    const from = $('#fix-from').value;
    const first = $('#fix-first').value.trim().replace(/\s+/g, ' '), last = $('#fix-last').value.trim().replace(/\s+/g, ' ');
    const msg = text => { $('#fix-msg').textContent = text; };
    if (!from) { msg('Pick the name to fix.'); return; }
    if (!first || !last) { msg('Type the right first name and last name.'); return; }
    const to = `${first} ${last}`.slice(0, 30).trim();
    if (normName(to) === normName(from)) { msg('That is the same name.'); return; }
    if (!window.confirm(`Move all of ${from}'s work to ${to}?`)) return;
    msg('Moving…');
    try {
      const r = await Sheet.renameStudent(tTeacher, tPin, from, to);
      if (!r.ok) { msg(ERRORS[r.error] || `The score sheet answered: ${r.error}`); return; }
      msg(`Moved ${r.moved} ${r.moved === 1 ? 'row' : 'rows'} from ${from} to ${to}.`);
      $('#fix-first').value = '';
      $('#fix-last').value = '';
      await refresh(true);
    } catch (e) {
      msg("Couldn't reach the score sheet. Check the internet, then try again.");
    }
  }

  async function refresh(quiet) {
    if (tSample || !tPin) return;
    if (!quiet) { liveOpen = null; skOpen = null; }   // ↻ Refresh starts closed; the 20-second update keeps the open boxes
    const open = openBox();   // by the student's name, so a new order finds them again
    const y = window.scrollY;
    if (!quiet) $('#t-body').innerHTML = '<p class="t-msg">Loading…</p>';
    try {
      const r = await Sheet.loadScores(tTeacher, tPin);
      if (r.ok) {
        showClass(r.rows, false);
        if (quiet) {
          reopen(open);
          window.scrollTo(0, y);
        }
      }
      else $('#t-body').innerHTML = `<p class="t-msg t-err">${esc(ERRORS[r.error] || r.error)}</p>`;
    } catch (e) {
      $('#t-body').innerHTML = `<p class="t-msg t-err">Couldn't reach the score sheet. Check the internet, then press Refresh.</p>`;
    }
  }

  /* ------------------------------------------------------------ answer key */
  function passageKeyHTML(ps, p) {
    let n = 0;
    const blocks = ps.blocks.map(b => {
      if (b.h) return `<h5 class="kp-h">${esc(b.h)}</h5>`;
      n += 1;
      return `<p class="kp-para"><span class="para-num">${n}</span><span>${esc(b.p).replace(/\*([^*]+)\*/g, '<i>$1</i>')}</span></p>`;
    }).join('');
    return `<div class="kp-passage">
        <h4 class="kp-title">Passage ${p + 1}: ${esc(ps.title)}</h4>
        ${ps.subtitle ? `<p class="kp-sub">${esc(ps.subtitle)}</p>` : ''}
        ${blocks}
        ${ps.footnotes.map(f => `<p class="kp-fn">${esc(`${f.mark} ${f.word}: ${f.meaning}`)}</p>`).join('')}
        <p class="kp-credit">${esc(ps.credit)}</p>
      </div>`;
  }
  const keyChoices = (list, answer) => `<div class="kq-choices">${list.map((c, i) => `<div class="kq-choice${i === answer ? ' right' : ''}">
      <span class="letter">${'ABCD'[i]}</span><div class="kq-body">${esc(c.t)}${i === answer ? '<div class="kq-note ok">✓ Correct answer</div>' : ''}
      <div class="kq-note"><b>Why:</b> ${esc(c.why)}</div></div></div>`).join('')}</div>`;

  function keyItemHTML(it) {
    let answer;
    const box = it.box ? `<p class="kq-stem">${esc(it.lead)}</p><div class="sum-box kq-box">${esc(it.box)}</div>` : '';
    if (it.type === 'mc') answer = `${box}<p class="kq-stem">${cue(it.stem)}</p>${keyChoices(it.choices, it.answer)}`;
    else if (multi(it)) {
      const right = it.type === 'ms' ? '✓ Correct answer' : '✓ Correct section';
      answer = `<p class="kq-stem">${cue(it.stem)}</p><div class="kq-choices${it.type === 'ms' ? ' kq-ms' : ' kq-sents'}">${it.pieces.map((p, k) => `<div class="kq-choice${it.answer.includes(k) ? ' right' : ''}">
        <span class="letter">${k + 1}</span><div class="kq-body">${esc(p.t)}${it.answer.includes(k) ? `<div class="kq-note ok">${right}</div>` : ''}
        <div class="kq-note"><b>Why:</b> ${esc(p.why)}</div></div></div>`).join('')}</div>`;
    } else {
      const ex = it.excerpt ? `<div class="kq-excerpt"><b>The question shows these paragraphs:</b>${it.excerpt.map(t => `<p>${esc(t)}</p>`).join('')}</div>` : '';
      answer = `${ex}<p class="kq-stem"><b>Part A:</b> ${cue(it.partA.q)}</p>${keyChoices(it.partA.choices, it.partA.answer)}
        <p class="kq-stem"><b>Part B:</b> ${cue(it.partB.q)}</p>${keyChoices(it.partB.choices, it.partB.answer)}`;
    }
    return `<article class="kq">
      <header class="kq-head"><span class="item-num">${it.n}</span><span class="kq-skill">${esc(it.skill)}</span><span class="kq-type">${typeLabel(it)}</span></header>
      ${it.hint ? `<div class="kq-reminder"><span aria-hidden="true">💡</span> <b>Reminder students hear:</b> ${esc(it.hint)}</div>` : ''}
      ${answer}
    </article>`;
  }

  /** One question's right answer only, for the one-page answers sheet. */
  function shortAnswer(it) {
    const letter = i => 'ABCD'[i];
    if (it.type === 'mc') return `${letter(it.answer)}. ${esc(it.choices[it.answer].t)}`;
    if (it.type === 'ms') return it.answer.map(k => `${k + 1}. ${esc(it.pieces[k].t)}`).join('<br>');
    if (it.type === 'hottext') return it.answer.map(k => `Section ${k + 1}: ${esc(it.pieces[k].t)}`).join('<br>');
    return `<b>Part A:</b> ${letter(it.partA.answer)}. ${esc(it.partA.choices[it.partA.answer].t)}<br>` +
      `<b>Part B:</b> ${letter(it.partB.answer)}. ${esc(it.partB.choices[it.partB.answer].t)}`;
  }

  /** The one-page answers sheet for a set: question, passage, skill, right answer. Printed by "Print answers only". */
  function shortKeyHTML(set) {
    const titles = SETS[set].passages.map(ps => ps.title);
    return `<h1>SBAC Practice: Inferences Answers Only — ${esc(setLabel(set))}</h1>
      <p>Make &amp; Support Inferences · Informational Text · Grade 6 · 9 questions · the full answer key has every choice and why</p>
      <table class="ks-table"><thead><tr><th>#</th><th>Passage</th><th>Skill</th><th>Right answer</th></tr></thead>
      <tbody>${itemsOf(set).map(it => `<tr><td class="ks-n">${it.n}</td><td>${it.p + 1}. ${esc(titles[it.p])}</td><td>${esc(it.skill)}</td><td>${shortAnswer(it)}</td></tr>`).join('')}</tbody></table>`;
  }

  function renderKey(set) {
    document.querySelectorAll('#key .key-tab').forEach(t => t.classList.toggle('on', t.dataset.set === set));
    $('#key-print-head').innerHTML = `<h1>SBAC Practice: Inferences Answer Key — ${esc(setLabel(set))}</h1>` +
      '<p>Make &amp; Support Inferences · Informational Text · Grade 6 · 3 passages, 9 questions · the right answer is green</p>';
    $('#key-body').innerHTML = SETS[set].passages.map((ps, p) => `<section class="kp" data-passage="${p + 1}">
      ${passageKeyHTML(ps, p)}
      ${itemsOf(set).filter(it => it.p === p).map(keyItemHTML).join('')}
    </section>`).join('');
    $('#key-short').innerHTML = shortKeyHTML(set);
  }
  $('#key .key-tabs').innerHTML = ALL_SETS.map(s => `<button type="button" class="key-tab" data-set="${s}">${setLabel(s)}</button>`).join('');

  /* ------------------------------------------------------------ wiring */
  $('#teacher-link').addEventListener('click', e => { e.preventDefault(); openPin(); });
  document.querySelectorAll('.tpin-class').forEach(b => b.addEventListener('click', () => { pickClass(b.dataset.teacher); note(''); }));
  $('#tpin-go').addEventListener('click', openScores);
  $('#tpin-input').addEventListener('keydown', e => { if (e.key === 'Enter') openScores(); });
  $('#tpin-sample-go').addEventListener('click', () => {
    if (!tTeacher) pickClass('lynk');
    showClass(sampleRows(), true);
  });
  $('#tpin-back').addEventListener('click', e => { e.preventDefault(); A.renderHome(); });
  $('#t-refresh').addEventListener('click', () => { refresh(); autoRefresh(); });
  $('#fix-go').addEventListener('click', fixName);
  $('#t-body').addEventListener('click', e => {
    const sq = e.target.closest('.ts-q[data-live]');
    if (sq) { toggleLive(sq.dataset.live, Number(sq.dataset.q)); return; }
    if (e.target.closest('[data-live-close]')) { liveOpen = null; drawLive(); return; }
    const t = e.target.closest('[data-heat]');
    if (t) { showHeat(t.dataset.heat); return; }
    const m = e.target.closest('[data-mode]');
    if (m) { heatMode = m.dataset.mode === 'first' ? 'first' : 'latest'; showHeat(heatSet); return; }
    // the box's own buttons first: the open box also carries data-q (which question it shows)
    if (e.target.closest('[data-qclose]')) {
      const box = $('#t-qbox');
      toggleQ(Number(box.dataset.q), box.dataset.s === '' || box.dataset.s == null ? undefined : Number(box.dataset.s));
      return;
    }
    if (e.target.closest('[data-qkey]')) { renderKey(heatSet); show('key'); return; }
    const so = e.target.closest('#t-heat [data-sort]');
    if (so) {   // Score: highest first, then lowest first, then highest again; Student: A–Z. The open box stays open.
      heatSort = so.dataset.sort === 'name' ? 'name' : heatSort === 'score-down' ? 'score-up' : 'score-down';
      showHeat(heatSet);
      return;
    }
    // the skill / standard map (11/25): a box, a name or a % opens its box; a question's number in it opens that question
    if (e.target.closest('[data-skclose]')) { skOpen = null; drawSk(); return; }
    const sk = e.target.closest('.sk-cell, .sk-head, .sk-pbtn');
    if (sk) { toggleSk(Number(sk.dataset.c), sk.classList.contains('sk-cell') ? Number(sk.dataset.s) : null); return; }
    const oq = e.target.closest('.sk-openq');
    if (oq) { openQ(Number(oq.dataset.q)); return; }
    const c = e.target.closest('.h-cell');
    if (c) { toggleQ(Number(c.dataset.q), Number(c.dataset.s)); return; }
    const q = e.target.closest('.h-qbtn, .h-pbtn');
    if (q) toggleQ(Number(q.dataset.q));
  });
  /* 👀 Try it as a student (asked 11/18, as on the other SBAC practice sites): pick a set and walk through it as a student
     sees it, with nothing saved (app.js tryIt). The screen's own updating rests meanwhile (nothing goes to the sheet);
     ← Teacher screen comes back here with no PIN: Try it never leaves this page, and tPin is still in memory. */
  $('#t-try-sets').innerHTML = ALL_SETS.map(s => `<button type="button" class="key-tab" data-try="${s}">${setLabel(s)}</button>`).join('');
  $('#t-try').addEventListener('click', () => {
    const open = $('#t-try-box').hidden;
    $('#t-try-box').hidden = !open;
    $('#t-try').setAttribute('aria-expanded', String(open));
  });
  $('#t-try-sets').addEventListener('click', e => {
    const b = e.target.closest('[data-try]');
    if (!b) return;
    clearTimeout(autoTimer);
    A.tryIt(b.dataset.try, tTeacher, () => { show('teacher'); autoRefresh(); });
  });
  $('#t-key').addEventListener('click', () => { renderKey('W'); show('key'); });
  $('#t-home').addEventListener('click', () => { tPin = ''; students = []; clearTimeout(autoTimer); A.renderHome(); });
  document.querySelectorAll('#key .key-tab').forEach(t => t.addEventListener('click', () => renderKey(t.dataset.set)));
  $('#key-print').addEventListener('click', () => window.print());
  // answers only: the page prints just the one-page sheet while body has .print-short
  $('#key-print-short').addEventListener('click', () => {
    document.body.classList.add('print-short');
    window.print();
    document.body.classList.remove('print-short');
  });
  window.addEventListener('afterprint', () => document.body.classList.remove('print-short'));
  $('#key-home').addEventListener('click', () => show('teacher'));

  /* Guest view (11/19, share.js): the teacher/admin guest link opens this screen with no PIN, on the sample students
     (invented, labeled "Sample data"), never a real class: real rows come only from the score sheet, with the PIN. */
  if (window.SHARE_TEACHER) {
    window.SHARE_OPEN_TEACHER = () => {
      pickClass(A.CLASS || Object.keys(TEACHERS)[0]);
      tPin = '';
      heatMode = 'latest';
      showClass(sampleRows(), true);
    };
  }

  // the site test checks the heat map against these rows, worked out on its own
  window.G6Teacher = { sampleRows };
})();
