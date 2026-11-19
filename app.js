/* Grade 6 Reading Practice — Make and Support Inferences · Informational Texts (FIAB practice)
   For Ms. Lynk's and Mrs. Fitzsimmons's 6th-grade classes.

   Ported from the Grade 5 Inferences site (sbac-g5-inferences-info-fiab), the same engine: cover (first + last
   name, on the teacher's own class link) → "Is this your name?" → directions, read aloud and locked until heard →
   choose (levels in order, 2 takes of the Warm Up and the Review) → a set → feedback after every answer → score;
   progress kept after every answer and, once a score sheet is connected, on any device (no sheet yet: a preview,
   kept on this computer only).
   The passage sits on one side and its questions on the other: multiple choice, two-part (EBSR), hot text (click
   whole SECTIONS of the text: question 3, choose two of six), choose two of five numbered sentences (ms, question 4),
   and a multiple-choice question with a whole paragraph in a box above it (question 5: which sentence summarizes it).

   Each set: 3 passages, 9 questions (Q1–3 passage 1, Q4–6 passage 2, Q7–9 passage 3), one question at a time.
   A question is right when all of it is right: both parts of a two-part question, both sections of the hot-text
   question, both answers of the choose-two question. */
(function () {
  'use strict';

  const S = window.G6Speech;
  const { esc, sayHTML, wordSpan, sayBtn, readBox, readLines, spokenOf, stopReading } = S;
  const Sheet = window.G6Sheet;
  const SETS = window.SETS;
  /* GUEST VIEW (Marcos 11/19: an admin page with every SBAC site, "so they can see all of them in one place"): share.js,
     the same guest view as the 4th-grade practice sites, turns on for ?share=<code>. A guest is "Guest" (no name typed, no class
     needed), every set is open, no PIN is ever asked, and nothing is saved or sent: share.js keeps this visit's storage
     apart and wipes it, and this page sends nothing and looks nothing up. The teacher/admin guest link also opens the
     teacher screen with sample students and no PIN (teacher.js). A student's class link is unchanged. */
  const GUEST = Boolean(window.SHARE_MODE);
  const GUEST_NAME = 'Guest';
  if (GUEST) {
    // what each guest card offers, true of THIS site (share.js draws the cards from these lists; its words say "the
    // teacher", never another teacher's name: this site's share.js is the copy for the school's other teachers' sites)
    window.SHARE_CARDS = {
      student: [['🔓', 'Every set open', 'No name, no class link, nothing locked.'],
        ['📊', 'Right answers and score', 'The right answer and why after each question.'],
        ['🛡️', 'Nothing is saved', 'No scores go to the teacher.']],
      teacher: [['📊', 'Class scores', 'Sample students: the heat map, each pick, the time.'],
        ['👀', 'Try it as a student', 'Any set, start to score. ⏩ skips the waits.'],
        ['✅', 'Answer key', 'Every question, the right answer and why. Printable.']]
    };
  }

  const PLACES_KEY = 'g6InfInfo_places_v1';   // each student's unfinished sets on this device
  const SCORES_KEY = 'g6InfInfo_scores_v1';   // each student's finished sets on this device
  const HEARD_KEY = 'g6InfInfo_heard_v1';     // who has heard the directions on this device
  const TEACHERS = { lynk: 'Ms. Lynk', fitzsimmons: 'Mrs. Fitzsimmons' };
  const SET_NAMES = { W: 'Warm Up', R: 'Review', TA: 'Test A', TB: 'Test B' };
  // Takes per level and the set each take uses: take 2 of the Warm Up and the Review has new passages
  const TAKES = { W: ['W', 'W2'], R: ['R', 'R2'], TA: ['TA'], TB: ['TB'] };
  const ALL_SETS = ['W', 'W2', 'R', 'R2', 'TA', 'TB'];
  const levelOf = set => Object.keys(TAKES).find(l => TAKES[l].includes(set)) || set;
  const takeNo = set => TAKES[levelOf(set)].indexOf(set) + 1;
  const setLabel = set => `${SET_NAMES[levelOf(set)]}${takeNo(set) > 1 ? ' · take 2' : ''}`;
  const itemsOf = set => SETS[set].items;

  /* Each student's own order (asked 11/18: "rotate the order of the passages, keep the order for each set of passage
     questions, but rotate the answer choices per question"). The passages start at a different one per student
     (1-2-3, 2-3-1 or 3-1-2), each passage's questions stay in order, and every question's answer choices are mixed
     (hot-text sections stay in the text's order). All of it is worked out from the attempt's id (saved with every answer)
     and the set, so it is the same on every computer (pick up anywhere), survives a name fix, and nothing new is saved. A pick is kept as the choice's place in the
     data, never the letter on the student's screen, so the sheet and the teacher screens read it the same as before. */
  const hash32 = s => { let h = 0x811c9dc5; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
  function mixed(n, seed) {
    let x = (seed >>> 0) || 0x9e3779b9;
    const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // the attempt's own id (saved with every answer, so any computer has it, and a teacher's name fix keeps it); a page
  // with no attempt yet falls back to the name
  const seatKey = st => `${st.saveId || normName(st.name)}|${st.set}`;
  function passageOrder(st) {
    const n = SETS[st.set].passages.length;
    const first = hash32(seatKey(st)) % n;
    return Array.from({ length: n }, (_, i) => (first + i) % n);
  }
  const itemsFor = st => passageOrder(st).flatMap(p => itemsOf(st.set).filter(it => it.p === p));
  const choiceOrder = (st, it, part, n) => mixed(n, hash32(`${seatKey(st)}|${it.id}|${part || ''}`));
  const BOOK = (part, n) => Array.from({ length: n }, (_, i) => i);   // the data's own order: answer keys, teacher screens
  const ordFor = it => (part, n) => choiceOrder(state, it, part, n);  // the student on the page
  const $ = sel => document.querySelector(sel);

  /* 👀 Try it as a student (a teacher's preview, 11/18): set while a teacher walks through a set from the teacher
     screen. Every save checks it: store.set keeps nothing on this computer and toSheet sends nothing. */
  let trying = null;   // { set, back, st, ready } while a teacher tries a set; null for every student
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) {
      if (trying) return;   // Try it: a student's places, scores and "heard" stay exactly as they were
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private window: nothing is kept */ }
    }
  };

  /* ------------------------------------------------------------ words for an item */
  const TYPE_LABEL = { mc: 'Multiple choice', ebsr: 'Two parts', ms: 'Choose two' };
  // hot text (sections of the text) and choose-two both pick from a list (it.pieces) and are right when every pick is a key
  const multi = it => it.type === 'hottext' || it.type === 'ms';
  const typeLabel = it => (it.type === 'hottext' ? (it.pick === 2 ? 'Select two sections' : 'Click one section') : TYPE_LABEL[it.type]);
  const questionText = it => (it.type === 'ebsr' ? `Part A: ${it.partA.q} Part B: ${it.partB.q}`
    : it.box ? `${it.lead} ${it.box} ${it.stem}` : it.stem);
  function answerText(it, ord = BOOK) {
    const L = (part, d) => 'ABCD'[ord(part, d.choices.length).indexOf(d.answer)];
    if (it.type === 'mc') return `${L('', it)}. ${it.choices[it.answer].t}`;
    if (it.type === 'ms') return it.answer.map(k => it.pieces[k].t).join('  ·  ');   // unnumbered, as the student saw them
    if (it.type === 'hottext') return it.answer.map(k => it.pieces[k].t).join('  ·  ');
    return `Part A: ${L('A', it.partA)}. ${it.partA.choices[it.partA.answer].t}  ·  Part B: ${L('B', it.partB)}. ${it.partB.choices[it.partB.answer].t}`;
  }
  function isRight(it, picked) {
    if (it.type === 'mc') return picked === it.answer;
    if (multi(it)) return Array.isArray(picked) && picked.length === it.answer.length && it.answer.every(k => picked.includes(k));
    return Array.isArray(picked) && picked[0] === it.partA.answer && picked[1] === it.partB.answer;
  }

  const scoreSay = (pts, n, pct) => `You got ${pts} out of ${n} right. ${gradeFor(pct).m}`;
  function gradeFor(pct) {
    if (pct >= 90) return { c: 'g-a', m: 'Excellent reading!' };
    if (pct >= 80) return { c: 'g-b', m: 'Great job! You found the proof.' };
    if (pct >= 60) return { c: 'g-c', m: 'Good work. Look at the questions below again.' };
    return { c: 'g-d', m: 'Keep practicing. Answer first, then find the proof.' };
  }

  /* ------------------------------------------------------------ screens */
  function show(id) {
    stopReading();
    document.querySelectorAll('.screen').forEach(s => { s.hidden = s.id !== id; });
    document.body.dataset.screen = id;
    if (trying) syncTry(id);   // Try it: the teacher's bar follows the screen
    window.scrollTo(0, 0);
  }
  $('#preview-banner').hidden = Sheet.connected;

  /* ------------------------------------------------------------ the passage, beside its questions */
  function passageHTML(set, p, pos = p) {
    const ps = SETS[set].passages[p];
    let n = 0;
    const blocks = ps.blocks.map(b => {
      if (b.h) return `<h4 class="pp-h" data-read-box>${sayBtn('Read this heading')}<span>${sayHTML(b.h)}</span></h4>`;
      n += 1;
      return `<p class="pp-para" data-read-box>${sayBtn(`Read paragraph ${n}`)}<span class="para-num" aria-label="Paragraph ${n}">${n}</span><span class="para-text">${sayHTML(b.p)}</span></p>`;
    }).join('');
    const notes = ps.footnotes.length ? `<div class="pp-notes">${ps.footnotes.map(f =>
      `<p class="pp-fn" data-read-box>${sayBtn(`Read what ${f.word} means`)}<span>${sayHTML(`${f.mark} ${f.word}: ${f.meaning}`)}</span></p>`).join('')}</div>` : '';
    return `<div class="pp-head"><span>📖 Text ${pos + 1} of 3</span></div>
      <div class="pp-scroll">
        <h3 class="pp-title" data-read-box>${sayBtn('Read the title')}<span>${sayHTML(ps.title)}</span></h3>
        ${ps.subtitle ? `<p class="pp-sub" data-read-box>${sayBtn('Read this line')}<span>${sayHTML(ps.subtitle)}</span></p>` : ''}
        ${blocks}${notes}
        <p class="pp-credit">${esc(ps.credit)}</p>
      </div>`;
  }

  /* ------------------------------------------------------------ one question */
  const choiceHTML = (t, i, part, pos = i) => `<div class="choice" role="radio" aria-checked="false" tabindex="0" data-i="${i}"${part ? ` data-part="${part}"` : ''} data-read-box>
      <span class="letter">${'ABCD'[pos]}</span><span class="choice-body">${sayHTML(t)}</span>${sayBtn(`Read choice ${'ABCD'[pos]}`)}</div>`;
  const choicesHTML = (list, part, order = list.map((c, i) => i)) => `<div class="choices" role="radiogroup" aria-label="${part ? `Part ${part} choices` : 'Answer choices'}">${order.map((i, pos) => choiceHTML(list[i].t, i, part, pos)).join('')}</div>`;
  // As on the real Grade 6 test (seen 11/18): question 3's sections and question 4's five sentences each have a square
  // check box in front, with NO letter or number (the answer key and teacher screens still number them for the teacher)
  const SQ = '<span class="sq-box" aria-hidden="true"></span>';
  const sentHTML = (p, k, box = false) => `<span class="ht-sent" role="checkbox" aria-checked="false" tabindex="0" data-k="${k}">${box ? `${SQ}<span class="ht-text">${sayHTML(p.t)}</span>` : sayHTML(p.t)}</span>`;
  // choose two: five sentences with square boxes, unnumbered, each with its own 🔊
  const msHTML = (p, k, pos = k) => `<div class="choice ms-choice" role="checkbox" aria-checked="false" tabindex="0" data-k="${k}" data-read-box>
      ${SQ}<span class="choice-body">${sayHTML(p.t)}</span>${sayBtn(`Read answer ${pos + 1}`)}</div>`;

  function stemHTML(it) {
    if (it.type === 'ebsr') {
      const ex = it.excerpt ? ' Read these paragraphs from the text.' : '';
      return `<p class="ask">${sayHTML(`This question has two parts. Answer Part A and Part B.${ex}`)}</p>`;
    }
    const tip = it.type === 'ms' ? 'Tap 2 answers. Tap one again to take it back.'
      : it.type === 'hottext' ? (it.pick === 2 ? 'Tap 2 sections. Tap one again to take it back.' : 'Tap 1 section.') : '';
    // the paragraph question (Q5): "Read the paragraph.", the paragraph in its box, then the question
    const box = it.box ? `<p class="ask">${sayHTML(it.lead)}</p><div class="sum-box">${sayHTML(it.box)}</div>` : '';
    return `${box}<p class="ask">${sayHTML(it.stem)}</p>${tip ? `<p class="ht-tip">${sayHTML(tip)}</p>` : ''}`;
  }
  const reminderHTML = it => `${sayBtn('Read the reminder')}<span class="reminder-text"><span aria-hidden="true">💡</span> <b>${wordSpan('Reminder:', 'Reminder:')}</b> ${sayHTML(it.hint)}</span>`;

  function answerHTML(it, ord = BOOK) {
    if (it.type === 'mc') return choicesHTML(it.choices, '', ord('', it.choices.length));
    if (it.type === 'ms') {
      return `<div class="choices ms-list" role="group" aria-label="Answer choices">${ord('', it.pieces.length).map((k, pos) => msHTML(it.pieces[k], k, pos)).join('')}</div>
        <p id="ht-count" class="ht-count">Chosen: 0 of 2</p>`;
    }
    if (it.type === 'hottext') {
      const body = it.layout === 'para'
        ? `<div class="ht ht-para-row" data-read-box>${sayBtn('Read the paragraph')}<p class="ht-para">${it.pieces.map(sentHTML).join(' ')}</p></div>`
        : `<div class="ht ht-list">${it.pieces.map((p, k) => `<div class="ht-row" data-read-box>${sayBtn('Read this section')}${sentHTML(p, k, true)}</div>`).join('')}</div>`;
      return `${body}<p id="ht-count" class="ht-count">${it.pick === 2 ? 'Chosen: 0 of 2' : 'Chosen: 0 of 1'}</p>`;
    }
    const excerpt = it.excerpt ? `<div class="excerpt"><div class="excerpt-label">📄 From the text</div>${it.excerpt.map((t, i) =>
      `<p class="ex-para" data-read-box>${sayBtn(`Read paragraph ${i + 1} of the part`)}<span>${sayHTML(t)}</span></p>`).join('')}</div>` : '';
    const part = (label, d) => `<div class="ebsr-part" data-part="${label}">
        <div class="part-label part-${label}">Part ${label}</div>
        <div class="part-q" data-read-box>${sayBtn(`Read Part ${label}`)}<span>${sayHTML(d.q)}</span></div>
        ${choicesHTML(d.choices, label, ord(label, d.choices.length))}</div>`;
    return `${excerpt}${part('A', it.partA)}${part('B', it.partB)}`;
  }

  let state = null;    // { name, teacher, set, idx, results: { id: { ok, picked } }, started, saveId, updated }
  let pick = null;     // what is chosen on the question showing: { mc, picks, A, B }
  let locked = false;  // true once the question is checked
  let shownPassage = '';

  const current = () => itemsFor(state)[state.idx];
  function ready(it) {
    if (it.type === 'mc') return pick.mc != null;
    if (multi(it)) return pick.picks.length === it.pick;
    return pick.A != null && pick.B != null;
  }
  // what a student hears when Check Answer is pressed too soon, or a third section or answer is tapped
  const NEED = {
    mc: 'Pick an answer first.', two: 'Choose 2 sections first.', one: 'Tap a section first.', twoAnswers: 'Choose 2 answers first.',
    both: 'Answer Part A and Part B first.', a: 'Answer Part A too.', b: 'Now answer Part B.',
    only2: 'You can choose only 2. Tap one you chose to take it back.'
  };
  function needText(it) {
    if (it.type === 'mc') return NEED.mc;
    if (it.type === 'ms') return NEED.twoAnswers;
    if (it.type === 'hottext') return it.pick === 2 ? NEED.two : NEED.one;
    if (pick.A == null && pick.B == null) return NEED.both;
    return pick.A == null ? NEED.a : NEED.b;
  }
  function say(box, words) {
    box.innerHTML = sayHTML(words);
    box.hidden = false;
    readBox(box);
  }
  const syncCheck = it => {
    $('#check-btn').setAttribute('aria-disabled', String(!ready(it)));
    if (ready(it)) $('#need').hidden = true;
  };

  function renderItem() {
    const items = itemsFor(state);
    if (state.idx >= items.length) { showResults(); return; }
    const it = items[state.idx];
    pick = { mc: null, picks: [], A: null, B: null };
    locked = false;
    const b = $('#set-banner');
    b.textContent = setLabel(state.set);
    b.className = `set-pill set-${levelOf(state.set)}`;
    $('#q-count').textContent = `Question ${state.idx + 1} of ${items.length}`;
    const ppos = passageOrder(state).indexOf(it.p);
    $('#p-count').textContent = `Text ${ppos + 1} of 3`;
    $('#progress-fill').style.width = `${(state.idx / items.length) * 100}%`;

    // the passage stays where the student was reading while its questions go by
    const pid = `${state.set}:${it.p}`;
    if (pid !== shownPassage) {
      $('#passage').innerHTML = passageHTML(state.set, it.p, ppos);
      shownPassage = pid;
    }

    // Warm Up (both takes) only: a gray 💡 reminder under the question that opens and reads itself
    const remind = levelOf(state.set) === 'W' && it.hint;
    $('#item').dataset.id = it.id;   // which question is showing (the order is the student's own)
    $('#item').innerHTML = `
      <div class="item-head"><span class="item-num">${state.idx + 1}</span><span class="item-type">${typeLabel(it)}</span>${sayBtn('Read the question', '#item .stem')}</div>
      <div class="stem" data-read-box>${stemHTML(it)}</div>
      ${remind ? `<div class="reminder" data-read-box>${reminderHTML(it)}</div>` : ''}
      ${answerHTML(it, ordFor(it))}
      <p id="need" class="need" data-read-box hidden></p>
      <div id="feedback" class="feedback" hidden></div>
      <button type="button" id="check-btn" class="btn" aria-disabled="true">Check Answer</button>`;
    show('quiz');
    if (remind) {
      const shown = it;
      setTimeout(() => {
        const btn = document.querySelector('#item .reminder .say');
        if (btn && state && current() === shown && !locked) btn.click();
      }, 400);
    }
  }

  function choose(el) {
    const it = current();
    const part = el.dataset.part;
    const i = Number(el.dataset.i);
    if (part) pick[part] = i; else pick.mc = i;
    document.querySelectorAll(`#item .choice${part ? `[data-part="${part}"]` : ''}`).forEach(c => {
      const on = c === el;
      c.classList.toggle('picked', on);
      c.setAttribute('aria-checked', String(on));
    });
    syncCheck(it);
  }

  function toggleSentence(el) {
    const it = current();
    const k = Number(el.dataset.k);
    const at = pick.picks.indexOf(k);
    if (at >= 0) pick.picks.splice(at, 1);
    else if (it.pick === 1) pick.picks = [k];              // one section: a new tap moves the choice
    else if (pick.picks.length >= it.pick) {               // two: a third tap is refused, and told why
      say($('#need'), NEED.only2);   // (a one-section question moves the choice instead)
      return;
    } else pick.picks.push(k);
    document.querySelectorAll('#item .ht-sent, #item .ms-choice').forEach(s => {
      const on = pick.picks.includes(Number(s.dataset.k));
      s.classList.toggle('picked', on);
      s.setAttribute('aria-checked', String(on));
    });
    $('#ht-count').textContent = `Chosen: ${pick.picks.length} of ${it.pick}`;
    $('#ht-count').classList.toggle('done', pick.picks.length === it.pick);
    syncCheck(it);
  }

  function checkAnswer() {
    const it = current();
    if (!ready(it)) { say($('#need'), needText(it)); return; }
    const picked = it.type === 'mc' ? pick.mc : multi(it) ? pick.picks.slice().sort((a, b) => a - b) : [pick.A, pick.B];
    const ok = isRight(it, picked);
    locked = true;
    state.results[it.id] = { ok, picked };
    state.idx += 1;   // saved one ahead, so coming back never asks this question again
    state.updated = Date.now();
    if (state.idx >= itemsOf(state.set).length) recordFinish(state);
    else {
      savePlace(state);
      toSheet(attemptRecord(state, false));
    }
    showFeedback(it, ok, picked);
  }

  /* ------------------------------------------------------------ feedback after every answer */
  function markChoices(sel, answer, picked) {
    document.querySelectorAll(sel).forEach(c => {
      const i = Number(c.dataset.i);
      c.classList.add('locked');
      c.setAttribute('aria-disabled', 'true');
      if (i === answer) c.classList.add('is-right');
      else if (i === picked) c.classList.add('is-wrong');
    });
  }

  function feedbackHTML(it, ok, picked, ord = BOOK) {
    const head = `<div class="fb-head"><span>${ok ? '✅' : '❌'} ${sayHTML(ok ? 'Correct!' : 'Not quite.')}</span>${sayBtn('Read the feedback')}</div>`;
    if (it.type === 'mc') {
      const L = 'ABCD'[ord('', it.choices.length).indexOf(it.answer)];
      const answer = ok ? '' : `<p class="fb-answer">${sayHTML(`The correct answer is ${L}. ${it.choices[it.answer].t}`)}</p>`;
      return `${head}<p class="fb-why">${sayHTML(it.choices[picked].why)}</p>${answer}`;
    }
    if (multi(it)) {
      const whys = [...new Set(picked.map(k => it.pieces[k].why))];
      const where = it.type === 'ms' ? 'The right answers are green.' : it.pick === 2 ? 'The right sections are green.' : 'The right section is green.';
      return `${head}${whys.map(w => `<p class="fb-why">${sayHTML(w)}</p>`).join('')}${ok ? '' : `<p class="fb-answer">${sayHTML(where)}</p>`}`;
    }
    const part = (label, d, i) => {
      const right = i === d.answer;
      return `<p class="fb-part"><span aria-hidden="true">${right ? '✅' : '❌'}</span> <b>${wordSpan(`Part ${label}:`, `Part ${label}:`)}</b> ${sayHTML(d.choices[i].why)}${right ? '' : ` ${sayHTML(`The correct answer is ${'ABCD'[ord(label, d.choices.length).indexOf(d.answer)]}.`)}`}</p>`;
    };
    return `${head}${part('A', it.partA, picked[0])}${part('B', it.partB, picked[1])}`;
  }

  function showFeedback(it, ok, picked) {
    if (it.type === 'mc') markChoices('#item .choice', it.answer, picked);
    else if (it.type === 'ebsr') {
      markChoices('#item .choice[data-part="A"]', it.partA.answer, picked[0]);
      markChoices('#item .choice[data-part="B"]', it.partB.answer, picked[1]);
    } else {
      document.querySelectorAll('#item .ht-sent, #item .ms-choice').forEach(s => {
        const k = Number(s.dataset.k);
        s.classList.add('locked');
        s.setAttribute('aria-disabled', 'true');
        if (it.answer.includes(k)) s.classList.add('is-right');
        else if (picked.includes(k)) s.classList.add('is-wrong');
      });
    }
    $('#need').hidden = true;
    const fb = $('#feedback');
    fb.className = `feedback ${ok ? 'ok' : 'no'}`;
    fb.setAttribute('data-read-box', '');
    fb.innerHTML = feedbackHTML(it, ok, picked, ordFor(it));
    fb.hidden = false;

    const items = itemsFor(state);
    const btn = $('#check-btn');
    btn.textContent = state.idx >= items.length ? 'See My Score'
      : items[state.idx].p !== it.p ? 'Next Text →' : 'Next Question →';
    btn.setAttribute('aria-disabled', 'false');
    $('#progress-fill').style.width = `${(state.idx / items.length) * 100}%`;
    fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    readBox(fb);   // the feedback reads itself: right or wrong, and the Why for what was picked
  }

  $('#item').addEventListener('click', e => {
    if (e.target.closest('#check-btn')) { if (locked) renderItem(); else checkAnswer(); return; }
    if (locked || !state) return;
    const s = e.target.closest('.ht-sent, .ms-choice');   // before .choice: a choose-two answer is a .choice too
    if (s) { toggleSentence(s); return; }
    const c = e.target.closest('.choice');
    if (c) choose(c);
  });
  $('#item').addEventListener('keydown', e => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const t = e.target.closest('.choice, .ht-sent');
    if (!t || locked) return;
    e.preventDefault();
    if (t.classList.contains('choice') && !t.classList.contains('ms-choice')) choose(t); else toggleSentence(t);
  });

  /* ------------------------------------------------------------ results */
  function showResults() {
    const items = itemsFor(state);
    const pts = items.filter(it => (state.results[it.id] || {}).ok).length;
    const pct = Math.round((pts / items.length) * 100);
    const g = gradeFor(pct);
    $('#r-name').textContent = `${state.name} · ${setLabel(state.set)}`;
    $('#r-pts').textContent = `${pts}/${items.length}`;
    $('#r-pct').textContent = `${pct}%`;
    $('#r-pct').className = `stat ${g.c}`;
    $('#r-msg').innerHTML = sayHTML(scoreSay(pts, items.length, pct));
    $('#reward').hidden = pct < 80;
    const missed = items.filter(it => !(state.results[it.id] || {}).ok);
    $('#missed').innerHTML = missed.length ? `<h3 class="missed-title">Questions to look at again</h3>${missed.map(it => `
      <div class="miss"><div class="miss-q"><b>Question ${items.indexOf(it) + 1}:</b> ${esc(questionText(it))}</div>
        <div class="miss-row"><span class="miss-label key">Answer</span><span>${esc(answerText(it, ordFor(it)))}</span></div></div>`).join('')}`
      : '<p class="all-right">You got every question right! 🎉</p>';
    $('#progress-fill').style.width = '100%';
    show('results');
    readBox($('#r-say'));   // the score reads itself (no name in it)
    sendToTeacher(state);
    state = null;
  }

  function sendToTeacher(st) {
    const note = $('#r-sent');
    if (trying || GUEST) {   // Try it, or a guest: nothing was sent or kept, and they are told so (not read aloud)
      note.hidden = false;
      note.className = 'sent-note sent-wait';
      note.textContent = trying ? '👀 Try it: this score was not saved.' : '👀 Guest view — this score was not saved.';
      return;
    }
    note.hidden = !Sheet.connected;
    if (note.hidden) return;
    const who = TEACHERS[st.teacher];
    note.dataset.saveId = st.saveId;
    note.className = 'sent-note';
    note.textContent = `Sending your score to ${who}…`;
    Sheet.flush().then(() => {
      if (note.dataset.saveId !== st.saveId) return;
      const sent = !Sheet.isPending(st.saveId);
      note.className = `sent-note ${sent ? 'sent-ok' : 'sent-wait'}`;
      note.textContent = sent ? `✅ ${who} has your score.` : `Your score is saved on this computer. It will go to ${who} the next time this page opens.`;
    });
  }

  /* ------------------------------------------------------------ saved places
     A student's unfinished set is kept under their own name and teacher, so two students on one
     Chromebook never erase each other; with a score sheet it also follows them to any device. */
  let chooseName = '';
  let chooseFirst = '';
  let chooseTeacher = '';
  let choosePlaces = {};   // level → their unfinished state
  let chooseDone = {};     // level → { best, tries } of their finished takes (opens the next level)
  let looking = false;
  const ORDER = Object.keys(SET_NAMES);
  const isOpen = level => GUEST || ORDER.indexOf(level) === 0 || ORDER[ORDER.indexOf(level) - 1] in chooseDone || Boolean(choosePlaces[level]);
  const normName = n => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const who = (teacher, name) => `${teacher}|${normName(name)}`;
  const placeKey = st => `${who(st.teacher, st.name)}|${st.set}`;
  const allPlaces = () => store.get(PLACES_KEY, {});
  const savePlace = st => store.set(PLACES_KEY, { ...allPlaces(), [placeKey(st)]: st });
  function dropPlace(st) {
    const rest = { ...allPlaces() };
    delete rest[placeKey(st)];
    store.set(PLACES_KEY, rest);
  }
  const unfinished = st => Boolean(st && SETS[st.set] && st.saveId && st.idx > 0 && st.idx < itemsOf(st.set).length);

  function localPlaces(teacher, name) {
    const out = {};
    Object.values(allPlaces()).forEach(st => {
      if (who(st.teacher, st.name) !== who(teacher, name) || !unfinished(st)) return;
      const l = levelOf(st.set);
      if (!out[l] || (st.updated || 0) > (out[l].updated || 0)) out[l] = st;
    });
    return out;
  }

  // a row from the score sheet back into a place this page can keep going from
  function placeFromSheet(p, teacher) {
    if (!SETS[p.set]) return null;
    let answers;
    try { answers = JSON.parse(p.answers || '{}'); } catch (e) { return null; }
    const idx = Number(p.answered) || 0;
    const results = {};
    itemsFor({ name: p.name, saveId: p.saveId, set: p.set }).slice(0, idx).forEach(it => { const a = answers[it.id]; if (a) results[it.id] = { ok: Boolean(a[0]), picked: a[1] }; });
    const st = { name: p.name, teacher, set: p.set, idx, results, started: Date.parse(p.startedAt) || Date.now(),
      saveId: p.saveId, updated: Date.parse(p.updatedAt) || 0 };
    return unfinished(st) && Object.keys(results).length === idx ? st : null;
  }

  // every update for the score sheet goes out here: into the outbox, then sent. Try it and a guest send nothing.
  function toSheet(rec) {
    if (trying || GUEST) return;
    Sheet.queue(rec);
    Sheet.flush();
  }

  // what goes to the score sheet: the attempt so far, or finished
  function attemptRecord(st, finished) {
    const items = itemsFor(st);
    const done = items.slice(0, st.idx);
    const right = done.filter(it => (st.results[it.id] || {}).ok).length;
    const pct = finished ? Math.round((right / items.length) * 100) : (st.idx ? Math.round((right / st.idx) * 100) : 0);
    const answers = {};
    done.forEach(it => { const r = st.results[it.id]; if (r) answers[it.id] = [r.ok ? 1 : 0, r.picked]; });
    return {
      saveId: st.saveId, teacher: st.teacher, name: st.name, set: st.set, pts: right, tot: items.length, pct, grade: '',
      missed: done.filter(it => !(st.results[it.id] || {}).ok).map(it => it.id).join(', '),
      finishedAt: finished ? new Date().toISOString() : '',
      status: finished ? 'Finished' : 'In progress', answered: st.idx,
      answers: JSON.stringify(answers), startedAt: new Date(st.started).toISOString()
    };
  }

  // The moment the last question is checked, the set counts (even if the page closes before "See My Score")
  function recordFinish(st) {
    const rec = attemptRecord(st, true);
    const scores = store.get(SCORES_KEY, []);
    scores.push({ teacher: st.teacher, name: st.name, set: st.set, pts: rec.pts, tot: rec.tot, pct: rec.pct, at: rec.finishedAt });
    store.set(SCORES_KEY, scores);
    dropPlace(st);
    toSheet(rec);
  }

  function localDone(teacher, name) {
    const out = {};
    store.get(SCORES_KEY, []).forEach(sc => {
      if (who(sc.teacher, sc.name) !== who(teacher, name) || !SETS[sc.set]) return;
      const d = out[levelOf(sc.set)] || (out[levelOf(sc.set)] = { best: 0, tries: 0 });
      d.best = Math.max(d.best, sc.pct);
      d.tries += 1;
    });
    return out;
  }

  // Past the last take, and to start over mid-set, the teacher's PIN is needed (as on the Grade 5 site).
  // The PIN goes to the score sheet's script and is checked there; no PIN is in this page.
  async function teacherSays(what) {
    const t = TEACHERS[chooseTeacher];
    if (!Sheet.connected) {
      return window.confirm(`Preview: no score sheet is connected, so no PIN is checked here.\nOnce it is connected, ${t}'s PIN is needed to ${what}.\n\nGo ahead?`);
    }
    const typed = window.prompt(`${t}'s PIN to ${what}:`);
    if (typed === null) return false;
    try {
      const r = await Sheet.loadScores(chooseTeacher, typed.trim(), true);
      if (r.ok) return true;
      window.alert(r.error === 'Locked' ? 'Too many wrong PINs on this computer. Try again in 10 minutes.' : 'That PIN did not work.');
    } catch (e) {
      window.alert("Couldn't reach the score sheet. Check the internet, then try again.");
    }
    return false;
  }

  async function startSet(level) {
    if (looking) return;   // still looking for saved work: nothing starts yet
    if (!isOpen(level)) { skipAhead(level); return; }
    if (choosePlaces[level]) { beginSet(choosePlaces[level].set); return; }
    const takes = TAKES[level];
    const tries = (chooseDone[level] || {}).tries || 0;
    // a guest takes anything as many times as they like: no PIN
    if (tries >= takes.length && !GUEST && !(await teacherSays(`let ${chooseName} take ${SET_NAMES[level]} again`))) return;
    beginSet(takes[tries % takes.length]);
  }

  /* Skip ahead (asked 11/18: "as many teacher access options as possible", as on Mrs. Wright's Base Ten site): a level
     that is not open yet looks locked but can still be tapped. The class teacher's PIN lets THIS student start it now
     (take 1). Nothing is kept: no one else's order changes, and without the PIN nothing opens. */
  async function skipAhead(level) {
    if (trying || GUEST) return;   // Try it never shows the choose page; a guest has every set open, so no PIN
    const me = who(chooseTeacher, chooseName);
    if (!(await teacherSays(`let ${chooseName} start ${SET_NAMES[level]} now`))) return;
    if (who(chooseTeacher, chooseName) !== me || document.body.dataset.screen !== 'choose') return;   // another student, or the page moved on
    const place = choosePlaces[level];
    if (place) { beginSet(place.set); return; }   // saved work found meanwhile: keep going
    const tries = (chooseDone[level] || {}).tries || 0;
    beginSet(TAKES[level][tries % TAKES[level].length]);
  }

  async function startOver(level) {
    const old = choosePlaces[level];
    if (!old || (!GUEST && !(await teacherSays(`let ${chooseName} start ${setLabel(old.set)} over`)))) return;
    dropPlace(old);
    toSheet({ saveId: old.saveId, teacher: old.teacher, status: 'Restarted' });
    delete choosePlaces[level];
    beginSet(old.set);
  }

  function beginSet(set) {
    const place = choosePlaces[levelOf(set)];
    state = place && place.set === set ? { ...place, name: chooseName || place.name, teacher: chooseTeacher }
      : { name: chooseName, teacher: chooseTeacher, set, idx: 0, results: {}, started: Date.now(), saveId: Sheet.newSaveId() };
    shownPassage = '';
    renderItem();
  }

  /* ------------------------------------------------------------ cover */
  const HOME_LEAD = 'Type your first and last name. Then press Go to the Directions.';
  const NO_LINK = 'Ask your teacher for your class link.';
  // Each teacher has her own link, ?class=<her code> (asked 11/17: "i dont want both teachers names on the same test.
  // Dont trust kids to pick the right thing"). Only her name shows; a page opened without one asks for the link.
  const CLASS = (() => {
    try {
      const c = String(new URLSearchParams(location.search).get('class') || '').trim().toLowerCase();
      return Object.prototype.hasOwnProperty.call(TEACHERS, c) ? c : '';
    } catch (e) { return ''; }
  })();
  const NAME_HINTS = { both: 'Type your first and last name.', first: 'Type your first name.', last: 'Type your last name.' };
  $('#home-lead-words').innerHTML = sayHTML(HOME_LEAD);
  $('#home-nolink-words').innerHTML = sayHTML(NO_LINK);
  $('#home-class').textContent = CLASS ? `${TEACHERS[CLASS]}'s class` : '';
  ['#home-lead', '.name-row', '.teacher-row', '#home-class'].forEach(sel => { $(sel).hidden = !CLASS; });
  $('#home-nolink').hidden = Boolean(CLASS);
  // a guest: no name boxes and no "ask for your class link" — one start button (share.js names it), or the two guest cards
  // on the teacher/admin link (the row widens for them); the Teacher Access link is gone (no PIN in a guest view)
  const START_ROW = Boolean(CLASS) || GUEST;
  if (GUEST) {
    ['#home-lead', '.name-row', '#home-nolink'].forEach(sel => { $(sel).hidden = true; });
    $('.teacher-row').hidden = false;
    $('.teacher-row').classList.toggle('guest-row', Boolean(window.SHARE_TEACHER));
    $('#teacher-link').hidden = true;
  }
  function renderHome() {
    if (trying) { endTry(); return; }   // Try it: every way out of the set goes back to the teacher screen
    $('#student-name').value = '';
    $('#student-last').value = '';
    $('#name-check').hidden = true;
    $('.teacher-row').hidden = !START_ROW;
    $('#name-hint').hidden = true;
    chooseName = '';
    chooseFirst = '';
    chooseTeacher = '';
    choosePlaces = {};
    chooseDone = {};
    lookupSeq += 1;
    show('home');
  }
  function nameHint(which) {
    const box = $('#name-hint');
    $('#name-hint-words').innerHTML = sayHTML(NAME_HINTS[which]);
    box.hidden = false;
    readBox(box);
  }
  const typed = id => $(id).value.trim().replace(/\s+/g, ' ');
  /* Is this your name? (asked 11/18: a name typed one letter off made a NEW student, who started over). After Go the
     typed name shows big and the question is read aloud (never the name: no recording holds a student's name).
     Yes goes on to the directions; No goes back to the two boxes, with nothing started. */
  const NAME_CHECK = 'Is this your name?';
  $('#name-check-words').innerHTML = sayHTML(NAME_CHECK);
  function closeNameCheck() {
    $('#name-check').hidden = true;
    $('.teacher-row').hidden = !START_ROW;
  }
  ['#student-name', '#student-last'].forEach(id => $(id).addEventListener('input', () => { $('#name-hint').hidden = true; closeNameCheck(); }));
  function goDirections(teacher) {
    const first = typed('#student-name'), last = typed('#student-last');
    if (!first || !last) {
      nameHint(!first && !last ? 'both' : !first ? 'first' : 'last');
      $(!first ? '#student-name' : '#student-last').focus();
      return;
    }
    $('#name-check-name').textContent = `${first} ${last}`;
    $('#name-check').dataset.teacher = teacher;
    $('#name-check').hidden = false;
    $('.teacher-row').hidden = true;
    readBox($('#name-check-ask'));
    $('#name-yes').focus();
  }
  function nameYes() {
    const first = typed('#student-name'), last = typed('#student-last');
    if (!first || !last) { closeNameCheck(); return; }
    closeNameCheck();
    chooseFirst = first;
    chooseTeacher = $('#name-check').dataset.teacher;
    renderDirections(`${first} ${last}`.slice(0, 30).trim());   // the sheet keeps 30 letters: the same 30 find their work
  }
  // a guest goes straight to the directions as "Guest", in the class of the link (or the first class)
  function guestStart() {
    chooseFirst = GUEST_NAME;
    chooseTeacher = CLASS || Object.keys(TEACHERS)[0];
    renderDirections(GUEST_NAME);
  }
  $('#home-go').addEventListener('click', () => { if (GUEST) guestStart(); else if (CLASS) goDirections(CLASS); });
  $('#name-yes').addEventListener('click', nameYes);
  $('#name-no').addEventListener('click', () => { closeNameCheck(); stopReading(); $('#student-name').focus(); $('#student-name').select(); });
  $('#student-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('#student-last').focus(); });
  $('#student-last').addEventListener('keydown', e => { if (e.key === 'Enter') $('#home-go').click(); });
  $('#home-say').addEventListener('click', () => readBox($('#home-lead')));
  $('#nolink-say').addEventListener('click', () => readBox($('#home-nolink')));

  /* ------------------------------------------------------------ directions (heard before "I'm ready") */
  const DIRECTIONS = [
    'Go in order. First the Warm Up. Then the Review. Then Test A. Then Test B.',
    'Each one opens when you finish the one before it.',
    'You get 2 takes of the Warm Up and the Review. Take 2 has new texts. You get 1 take of each test.',
    'Each set has 3 texts. Read the text. Then answer the questions next to it.',
    'Pick your answer. Then press Check Answer.',
    'Read why your answer is right or wrong. Then press Next.',
    'Press 🔊 to hear the text, a question, or an answer read to you.',
    'Your work saves after every question. You can stop and keep going later.'
  ];
  const DIR_ICONS = ['🪜', '🔓', '🔁', '📖', '✏️', '💡', '👂', '💾'];
  const DIR_DONE = "When you are done listening, press I'm ready.";
  const DIR_KEYS = [
    ['Warm Up', 'k-W'], ['Review', 'k-R'], ['Test A', 'k-TA'], ['Test B', 'k-TB'],
    ['Check Answer', 'k-btn'], ['Next', 'k-btn'], ['2 takes', 'k-em'], ['1 take', 'k-em'], ['new texts', 'k-em'], ['3 texts', 'k-em']
  ];
  const dirStepHTML = (d, i) => `<li class="dir-step"><span class="dir-num" aria-hidden="true">${i + 1}</span>` +
    `<span class="dir-icon" aria-hidden="true">${DIR_ICONS[i]}</span><span class="dir-text">${sayHTML(d)}</span></li>`;
  // key words get the look of what they name (each level in its card's color, a button as a small button)
  function markKeys(box) {
    const words = [...box.querySelectorAll('.w')];
    const bare = w => (w.dataset.say || '').replace(/[.,]$/, '');
    for (let i = 0; i < words.length; i += 1) {
      const hit = DIR_KEYS.find(([k]) => k.split(' ').every((part, j) => words[i + j] && bare(words[i + j]) === part));
      if (!hit) continue;
      const last = words[i + hit[0].split(' ').length - 1];
      const range = document.createRange();
      range.setStartBefore(words[i]);
      range.setEndAfter(last);
      const key = document.createElement('b');
      key.className = `key ${hit[1]}`;
      range.surroundContents(key);
      // a period after a key word sits outside its color (it is still said: data-say keeps it)
      const end = last.textContent.match(/[.,]$/);
      if (end) { last.textContent = last.textContent.slice(0, -1); key.after(end[0]); }
      i = words.indexOf(last);
    }
  }
  const setReady = open => {
    $('#dir-go').setAttribute('aria-disabled', String(!open));
    if (open) $('#dir-note').hidden = true;
  };
  function renderDirections(name) {
    chooseName = name;
    $('#dir-steps').innerHTML = DIRECTIONS.map(dirStepHTML).join('');
    document.querySelectorAll('#dir-steps .dir-text').forEach(markKeys);
    setReady(Boolean(store.get(HEARD_KEY, {})[who(chooseTeacher, name)]));
    $('#dir-note').hidden = true;
    show('directions');
  }
  function hearDirections() {
    // each step is its own line, 900 ms apart, its words lighting up as they are said
    const lines = [{ text: 'Directions.' }, ...[...document.querySelectorAll('#dir-steps li')].map(spokenOf), { text: DIR_DONE }];
    const heard = () => {
      store.set(HEARD_KEY, { ...store.get(HEARD_KEY, {}), [who(chooseTeacher, chooseName)]: true });
      setReady(true);
    };
    // The voice can't be heard here (a line failed: a hidden tab, no voice; or no end ever comes): don't leave
    // the student stuck. Open with a note to read the directions, unless the reading was stopped (another 🔊,
    // Back), or they were heard after all.
    const openUnheard = () => {
      if (S.wasStopped(run) || document.body.dataset.screen !== 'directions' || $('#dir-go').getAttribute('aria-disabled') === 'false') return;
      setReady(true);
      $('#dir-note').textContent = "If you couldn't hear it, read the directions above.";
      $('#dir-note').hidden = false;
    };
    const run = readLines(lines, $('#dir-head'), heard, 900, () => setTimeout(openUnheard, 15000));
    if (run === false) {
      // this computer cannot read aloud: give time to read, then open
      $('#dir-note').textContent = "This computer can't read aloud. Read the directions, then press I'm ready.";
      $('#dir-note').hidden = false;
      setTimeout(() => { if (document.body.dataset.screen === 'directions') setReady(true); }, 15000);
      return;
    }
    // the safety timer: a voice that hangs (no end ever comes) opens it well after the reading should have finished
    const chars = lines.map(l => l.text).join(' ').length;
    setTimeout(openUnheard, chars * 90 + lines.length * 900 + 15000);
  }
  $('#dir-say').addEventListener('click', hearDirections);
  $('#dir-go').addEventListener('click', () => {
    if ($('#dir-go').getAttribute('aria-disabled') === 'true') {
      $('#dir-note').textContent = 'Tap 🔊 to hear the directions first.';
      $('#dir-note').hidden = false;
      return;
    }
    if (trying) { trying.ready = true; tryGo(0); return; }   // Try it: straight into the set the teacher picked
    renderChoose();
  });
  $('#dir-back').addEventListener('click', e => { e.preventDefault(); renderHome(); });

  /* ------------------------------------------------------------ choose: hello + where to start */
  const CHOOSE_SAY = 'Go in order. Start with the Warm Up. Then do the Review. Then Test A, then Test B. They are just like the real test. Each one opens when you finish the one before it. You get 2 takes of the Warm Up and the Review, and 1 take of each test.';
  let lookupSeq = 0;
  function renderChoose() {
    if (trying) { endTry(); return; }   // Try it: no choose page (it would look up a student's saved work)
    $('#hello').textContent = `Hi, ${chooseFirst || chooseName.split(' ')[0]}!`;
    $('#choose-class').textContent = GUEST ? '👀 Guest view · every set is open · nothing is saved' : `${TEACHERS[chooseTeacher]}'s class`;
    choosePlaces = localPlaces(chooseTeacher, chooseName);
    chooseDone = localDone(chooseTeacher, chooseName);
    looking = Sheet.connected && !GUEST;   // a guest's work is never looked up on the score sheet
    drawChoose();
    show('choose');
    if (!looking) return;
    const seq = ++lookupSeq;
    Sheet.loadPlaces(chooseName, chooseTeacher).then(r => {
      if (seq !== lookupSeq || !r || !r.ok) return;
      r.places.map(p => placeFromSheet(p, chooseTeacher)).filter(Boolean).forEach(st => {
        const here = choosePlaces[levelOf(st.set)];
        if (!here || st.idx > here.idx) choosePlaces[levelOf(st.set)] = st;   // whichever got further
      });
      const fromSheet = {};
      Object.entries(r.finished || {}).forEach(([set, d]) => {
        if (!SETS[set]) return;
        const agg = fromSheet[levelOf(set)] || (fromSheet[levelOf(set)] = { best: 0, tries: 0 });
        agg.best = Math.max(agg.best, Number(d.best) || 0);
        agg.tries += Number(d.tries) || 0;
      });
      Object.entries(fromSheet).forEach(([l, d]) => {
        const here = chooseDone[l] || { best: 0, tries: 0 };
        chooseDone[l] = { best: Math.max(here.best, d.best), tries: Math.max(here.tries, d.tries) };
      });
    }).catch(() => { /* offline: this device's work only */ }).finally(() => {
      if (seq !== lookupSeq) return;
      looking = false;
      drawChoose();
    });
  }

  function drawChoose() {
    $('#looking').hidden = !looking;
    document.querySelectorAll('#choose .set-btn').forEach(b => {
      const level = b.dataset.set;
      const open = isOpen(level);
      b.disabled = looking;   // nothing taps while saved work is looked up
      b.setAttribute('aria-disabled', String(!open));   // a locked level still taps: the teacher's PIN can open it (skipAhead)
      b.classList.toggle('locked', !open);
      const prev = ORDER[ORDER.indexOf(level) - 1];
      const place = choosePlaces[level], done = chooseDone[level];
      const text = place ? `▶ Keep going${takeNo(place.set) > 1 ? ' (take 2)' : ''}: question ${place.idx + 1}`
        : !open ? `🔒 Finish ${SET_NAMES[prev]} first`
        : !done ? ''
        : done.tries < TAKES[level].length ? `✓ Take 1: ${done.best}% · take 2 is open`
        : `✓ Done · best ${done.best}%`;
      let badge = b.querySelector('.place-badge');
      if (text && !badge) {
        badge = document.createElement('b');
        badge.className = 'place-badge';
        b.appendChild(badge);
      }
      if (text) badge.textContent = text;
      else if (badge) badge.remove();
    });
    const top = Object.values(choosePlaces).sort((x, y) => (y.updated || 0) - (x.updated || 0))[0];
    $('#resume').hidden = !top;
    document.querySelectorAll('#resume button').forEach(btn => { btn.disabled = looking; });
    if (top) {
      $('#resume-text').textContent = `You started ${setLabel(top.set)}. You are on question ${top.idx + 1} of ${itemsOf(top.set).length}.`;
      $('#resume').dataset.set = levelOf(top.set);
    }
  }
  document.querySelectorAll('.set-btn').forEach(b => b.addEventListener('click', () => startSet(b.dataset.set)));
  $('#resume-go').addEventListener('click', () => startSet($('#resume').dataset.set));
  $('#resume-new').addEventListener('click', () => startOver($('#resume').dataset.set));
  $('#change-name').addEventListener('click', e => { e.preventDefault(); renderHome(); });
  $('#choose-say').addEventListener('click', () => readLines([{ text: CHOOSE_SAY }], $('#choose-say'), null));
  // Exit goes back to the cover, so the next student never lands on this one's page
  $('#exit-btn').addEventListener('click', () => { state = null; renderHome(); });
  $('#home-btn').addEventListener('click', () => (chooseName ? renderChoose() : renderHome()));

  /* ------------------------------------------------------------ 👀 Try it as a student (teacher only, asked 11/18)
     From the teacher screen (after the PIN), as on the other SBAC practice sites: the real student screens for one set (the
     directions, each text, each question, the feedback and Why, the score) with NOTHING saved. `trying` stops every
     write to this computer (store.set: no place, no score, no "heard", so no take is counted) and every send to the score
     sheet (toSheet); the run lives in memory only, under the name "Teacher preview", so it never meets a student's saved
     work. The directions start locked, as for a new student. A bar only the teacher sees: ← Teacher screen (no PIN
     again: the page never leaves, and teacher.js keeps the PIN in memory), ◀ a menu of every question ▶, and ⏩ Skip
     the wait (stops the voice and opens "I'm ready"). Nothing new is said aloud. */
  const TRY_NAME = 'Teacher preview';
  let tryAt = 'dir';   // where the teacher is: 'dir' (the directions), a question's place in the run, or 'end' (the score)
  const tryItems = () => itemsFor(trying.st);
  function tryIt(set, teacher, back) {
    if (!SETS[set] || !TEACHERS[teacher]) return;
    state = null;
    trying = { set, back, ready: false,
      st: { name: TRY_NAME, teacher, set, idx: 0, results: {}, started: Date.now(), saveId: Sheet.newSaveId() } };
    chooseName = TRY_NAME;
    chooseFirst = '';
    chooseTeacher = teacher;
    choosePlaces = {};
    chooseDone = {};
    shownPassage = '';
    const items = tryItems(), order = passageOrder(trying.st);
    $('#try-what').textContent = `👀 Try it · ${setLabel(set)}`;
    $('#try-jump').innerHTML = '<option value="dir">Directions</option>' + items.map((it, i) =>
      `<option value="${i}">Question ${i + 1} of ${items.length} · Text ${order.indexOf(it.p) + 1} · key Q${it.n}</option>`).join('') +
      '<option value="end">Score</option>';
    $('#try-bar').hidden = false;
    $('#preview-banner').hidden = false;   // "Preview — nothing is saved", even with the score sheet connected
    tryGo('dir');
  }
  // go to the directions, a question (its place in this run), or the score screen
  function tryGo(at) {
    if (at === 'dir') {
      state = null;
      renderDirections(TRY_NAME);
      setReady(trying.ready);   // locked until heard or skipped, then open for the rest of the run
      return;
    }
    state = trying.st;
    state.idx = at === 'end' ? tryItems().length : Number(at);
    renderItem();   // past the last question it shows the score
  }
  function tryStep(d) {
    const stops = ['dir', ...tryItems().map((it, i) => String(i)), 'end'];
    const k = stops.indexOf(tryAt) + d;
    if (k >= 0 && k < stops.length) tryGo(stops[k]);
  }
  // show() calls this: the bar follows the screen showing
  function syncTry(id) {
    tryAt = id === 'directions' ? 'dir' : id === 'results' ? 'end' : state ? String(state.idx) : tryAt;
    $('#try-jump').value = tryAt;
    $('#try-prev').disabled = tryAt === 'dir';
    $('#try-next').disabled = tryAt === 'end';
  }
  // ⏩ Skip the wait: the voice stops, and the directions' "I'm ready" opens (the one screen here that waits for the voice)
  function skipWait() {
    stopReading();
    if (document.body.dataset.screen === 'directions') { trying.ready = true; setReady(true); }
  }
  // ← Teacher screen, and every student way out of the set (Exit, ← Back, Return to Menu): back to the teacher screen
  function endTry() {
    const back = trying.back;
    stopReading();
    trying = null;
    state = null;
    chooseName = '';
    chooseTeacher = '';
    $('#try-bar').hidden = true;
    $('#preview-banner').hidden = Boolean(Sheet.connected);   // as for a student again
    back();
  }
  $('#try-back').addEventListener('click', () => { if (trying) endTry(); });
  $('#try-skip').addEventListener('click', () => { if (trying) skipWait(); });
  $('#try-prev').addEventListener('click', () => { if (trying) tryStep(-1); });
  $('#try-next').addEventListener('click', () => { if (trying) tryStep(1); });
  $('#try-jump').addEventListener('change', e => { if (trying) tryGo(e.target.value); });

  /* Every line this site can hand the voice, built by the same code that draws and reads the screens: the list the
     Ava recordings are made from (tools/ava-lines.json), and what the site test checks has a recording. A 🔊 reads
     its box a sentence at a time (spokenLines), so a line is a sentence; the directions are read a step at a time.
     No line holds a student's name: the cover, the directions, the choose page's 🔊 and the score say none. */
  window.__g6Speech = {
    lines() {
      const out = new Set();
      const box = document.createElement('div');
      const sentences = el => S.spokenLines(el).forEach(l => out.add(l.text));
      const boxes = html => { box.innerHTML = html; box.querySelectorAll('[data-read-box]').forEach(sentences); };
      const said = html => { box.innerHTML = html; sentences(box); };
      said(sayHTML(HOME_LEAD));
      said(sayHTML(NO_LINK));
      Object.values(NAME_HINTS).forEach(t => said(sayHTML(t)));
      said(sayHTML(NAME_CHECK));
      out.add('Directions.');
      DIRECTIONS.forEach((d, i) => { box.innerHTML = dirStepHTML(d, i); markKeys(box); out.add(spokenOf(box).text); });
      out.add(DIR_DONE);
      out.add(CHOOSE_SAY);
      Object.values(NEED).forEach(t => said(sayHTML(t)));
      'ABCD'.split('').forEach(L => said(sayHTML(`The correct answer is ${L}.`)));
      const total = itemsOf('W').length;
      for (let n = 0; n <= total; n += 1) said(sayHTML(scoreSay(n, total, Math.round((n / total) * 100))));
      ALL_SETS.forEach(set => {
        SETS[set].passages.forEach((ps, p) => boxes(passageHTML(set, p)));
        itemsOf(set).forEach(it => {
          said(stemHTML(it));
          if (it.hint) said(reminderHTML(it));
          boxes(answerHTML(it));
          // the feedback for every answer that changes its words
          const picks = it.type === 'mc' ? it.choices.map((c, i) => i)
            : it.type === 'ebsr' ? [0, 1, 2, 3].flatMap(a => [0, 1, 2, 3].map(b => [a, b]))
            : it.pick === 1 ? it.pieces.map((p, k) => [k])
            : it.pieces.flatMap((p, a) => it.pieces.map((q, b) => [a, b]).filter(([x, y]) => x < y));
          picks.forEach(pk => said(feedbackHTML(it, isRight(it, pk), pk)));
        });
      });
      return [...out];
    }
  };

  // the teacher screens (teacher.js) use these
  window.G6App = { CLASS, SETS, TEACHERS, SET_NAMES, ALL_SETS, levelOf, takeNo, setLabel, itemsOf, itemsFor, passageOrder, choiceOrder, typeLabel, questionText, multi,
    answerText, isRight, gradeFor, normName, show, renderHome, passageHTML, tryIt };

  // Anything a lost connection left in this device's outbox goes now, or when the internet comes back
  window.addEventListener('online', () => Sheet.flush());
  renderHome();
  Sheet.flush();
})();
