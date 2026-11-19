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
  const { esc } = window.G6Speech;
  const { SETS, TEACHERS, ALL_SETS, setLabel, itemsOf, typeLabel, questionText, multi, gradeFor, normName, show } = A;
  const $ = sel => document.querySelector(sel);

  let tTeacher = '';   // whose class is showing
  let tPin = '';       // kept in memory only, for Refresh
  let tSample = false;
  let heatSet = 'W';
  let heatMode = 'latest';   // the switch: each student's 'first' or 'latest' finished try (the heat maps, picks, Top 3)
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
  function liveStrip(r) {
    const a = answersOf(r);
    return `<span class="t-strip" aria-label="Each question so far">${itemsOf(r.set).map((it, i) => {
      const x = a[it.id];
      const mark = !x ? '' : x[0] ? '✓' : '✗';
      return `<span class="ts-q ${!x ? 'ts-wait' : x[0] ? 'ts-ok' : 'ts-miss'}" title="Question ${i + 1}: ${!x ? 'not answered yet' : x[0] ? 'right' : 'wrong'}"><i>${i + 1}</i>${mark}</span>`;
    }).join('')}</span>`;
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
    const cell = ({ right, of, pct }) => `<td class="${heatClass(pct)}" title="${right} of ${of} right">${right}/${of}</td>`;
    const body = done.map(d => `<tr><th scope="row">${esc(d.name)}</th>${cols.map(c => cell(score(d, c.qs))).join('')}</tr>`).join('');
    const foot = cols.map(c => {
      const right = done.reduce((n, d) => n + score(d, c.qs).right, 0);
      const pct = Math.round((right / (done.length * c.qs.length)) * 100);
      return `<td class="${heatClass(pct)}">${pct}</td>`;
    }).join('');
    return `<h3 class="t-sub">Skill heat map <span>(${esc(setLabel(set))} · each student's ${tryWord()} · right out of the questions in that skill)</span></h3>
      <div class="t-wrap"><table class="t-heat t-skill"><thead><tr><th scope="col">Student</th>${cols.map(c => (c.std
        ? `<th scope="col" class="sk-std" title="${esc(STD_WORDS[c.label].full)}">${esc(c.label)}<span class="sk-name">${esc(STD_WORDS[c.label].short)}</span><span class="sk-sub">${esc(c.sub)}</span></th>`
        : `<th scope="col" class="">${esc(c.label)}<span class="sk-sub">${esc(c.sub)}</span></th>`)).join('')}</tr></thead>
      <tbody>${body}</tbody><tfoot><tr><th scope="row">% right</th>${foot}</tr></tfoot></table></div>
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
    const working = students.flatMap(st => ALL_SETS.filter(s => st.sets[s] && st.sets[s].now).map(s => ({ name: st.name, r: st.sets[s].now })))
      .sort((a, b) => rowTime(b.r) - rowTime(a.r));
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
      <h3 class="t-sub">In progress <span>(saved after every answer${tSample ? ' · sample' : ` · updates by itself every ${AUTO_MS / 1000} seconds`})</span></h3>
      ${tSample ? '' : `<p id="t-updated" class="t-updated">Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</p>`}
      ${working.length ? `<ul class="t-working">${working.map(w => `<li><b>${esc(w.name)}</b> · ${setLabel(w.r.set)} · ${liveText(w.r)}
        <span class="t-ago">${ago(w.r.updatedAt)}</span>${liveStrip(w.r)}</li>`).join('')}</ul>` : '<p class="t-msg">No one is in the middle of a set.</p>'}
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
    const rankHTML = list => `<ol class="t-rank">${list.map(s => `<li><div class="t-rank-head"><b>Question ${s.i + 1}</b>
      <span class="t-pill ${heatClass(s.pct)}">${s.right} of ${done.length} right · ${s.pct}%</span></div>
      <div class="t-q"><i>${esc(s.it.skill)}:</i> ${esc(questionText(s.it))}</div></li>`).join('')}</ol>`;
    return `<p class="t-legend">${esc(setLabel(set))} · each student's <b>${tryWord()}</b> · <span class="h-ok">✓</span> right · <span class="h-miss">✗</span> missed · bottom row = % of the ${done.length} ${done.length === 1 ? 'student' : 'students'} who got that question right · <b>tap a question number</b> to see that question and what students picked · <b>tap a ✓ or ✗</b> to see that student's answer</p>
      <div class="t-wrap"><table class="t-heat"><thead><tr><th scope="col">Student</th>${items.map((it, i) => `<th scope="col"><button type="button" class="h-qbtn" data-q="${i}" aria-expanded="false" aria-controls="t-qbox" title="${esc(it.skill)}">${i + 1}</button></th>`).join('')}<th scope="col">Score</th><th scope="col" title="Clock time, start to finish, for that try">Time</th></tr></thead>
      <tbody>${body}</tbody><tfoot><tr><th scope="row">% right</th>${stats.map(s => `<td class="${heatClass(s.pct)}">${s.pct}</td>`).join('')}<td></td><td></td></tr></tfoot></table></div>
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
    if (text == null) return `<div class="t-student"><p><b>${esc(d.name)}</b> <span class="t-take">(${tryWord()})</span>: ${right ? '✓ right' : '✗ missed'} · no answer saved for this question.</p></div>`;
    return `<div class="t-student ${right ? 'ok' : 'no'}"><p><b>${esc(d.name)}</b> picked ${right ? '✓' : '✗'} <span class="t-take">(${tryWord()})</span></p>
      <p class="t-student-pick">${esc(text)}</p>
      <p class="t-student-why"><b>What ${esc(d.name.split(' ')[0])} heard:</b> ${pickedWhys(it, picked).map(esc).join(' ')}</p></div>`;
  }

  /** The box under the heat map for question number i (0-based) of the showing set; si = a student's row (a ✓/✗ tapped). */
  function qBoxHTML(i, si) {
    const s = heatStats[i];
    const it = s.it;
    const asked = it.type === 'ebsr'
      ? `<p class="t-qbox-q"><b>Part A:</b> ${esc(it.partA.q)}</p><p class="t-qbox-q"><b>Part B:</b> ${esc(it.partB.q)}</p>`
      : it.box ? `<p class="t-qbox-q">${esc(it.lead)}</p><div class="sum-box t-qbox-sum">${esc(it.box)}</div><p class="t-qbox-q">${esc(it.stem)}</p>`
      : `<p class="t-qbox-q">${esc(it.stem)}</p>`;
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
    document.querySelectorAll('.h-qbtn').forEach(b => {
      const on = !same && !who && b.dataset.q === String(i);
      b.classList.toggle('on', on);
      b.setAttribute('aria-expanded', String(on));
    });
    document.querySelectorAll('.h-cell').forEach(b => {
      const on = !same && Boolean(who) && b.dataset.q === String(i) && b.dataset.s === who;
      b.classList.toggle('on', on);
      b.setAttribute('aria-expanded', String(on));
    });
    if (same) { box.hidden = true; box.dataset.q = ''; box.dataset.s = ''; return; }
    box.innerHTML = qBoxHTML(i, si);
    box.dataset.q = String(i);
    box.dataset.s = who;
    box.hidden = false;
  }

  function showHeat(set) {
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
  }

  function showClass(rows, sample) {
    tSample = sample;
    students = groupStudents(rows);
    $('#t-title').textContent = `Class Scores · ${TEACHERS[tTeacher]}`;
    $('#t-sample').hidden = !sample;
    $('#t-refresh').hidden = sample;
    show('teacher');
    fillFix();
    if (!students.length) { $('#t-body').innerHTML = '<p class="t-msg">No work yet. Rows show up here after each answer a student checks.</p>'; return; }
    $('#t-body').innerHTML = classHTML();
    const hasDone = s => students.some(st => st.sets[s] && st.sets[s].latest);
    if (!hasDone(heatSet)) heatSet = ALL_SETS.find(hasDone) || 'W';
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
    const box = $('#t-qbox');
    const open = box && !box.hidden ? { q: box.dataset.q, s: box.dataset.s } : null;
    const y = window.scrollY;
    if (!quiet) $('#t-body').innerHTML = '<p class="t-msg">Loading…</p>';
    try {
      const r = await Sheet.loadScores(tTeacher, tPin);
      if (r.ok) {
        showClass(r.rows, false);
        if (quiet) {
          if (open && heatStats[Number(open.q)]) toggleQ(Number(open.q), open.s === '' || open.s == null ? undefined : Number(open.s));
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
    if (it.type === 'mc') answer = `${box}<p class="kq-stem">${esc(it.stem)}</p>${keyChoices(it.choices, it.answer)}`;
    else if (multi(it)) {
      const right = it.type === 'ms' ? '✓ Correct answer' : '✓ Correct section';
      answer = `<p class="kq-stem">${esc(it.stem)}</p><div class="kq-choices${it.type === 'ms' ? ' kq-ms' : ' kq-sents'}">${it.pieces.map((p, k) => `<div class="kq-choice${it.answer.includes(k) ? ' right' : ''}">
        <span class="letter">${k + 1}</span><div class="kq-body">${esc(p.t)}${it.answer.includes(k) ? `<div class="kq-note ok">${right}</div>` : ''}
        <div class="kq-note"><b>Why:</b> ${esc(p.why)}</div></div></div>`).join('')}</div>`;
    } else {
      const ex = it.excerpt ? `<div class="kq-excerpt"><b>The question shows these paragraphs:</b>${it.excerpt.map(t => `<p>${esc(t)}</p>`).join('')}</div>` : '';
      answer = `${ex}<p class="kq-stem"><b>Part A:</b> ${esc(it.partA.q)}</p>${keyChoices(it.partA.choices, it.partA.answer)}
        <p class="kq-stem"><b>Part B:</b> ${esc(it.partB.q)}</p>${keyChoices(it.partB.choices, it.partB.answer)}`;
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
    const c = e.target.closest('.h-cell');
    if (c) { toggleQ(Number(c.dataset.q), Number(c.dataset.s)); return; }
    const q = e.target.closest('.h-qbtn');
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
