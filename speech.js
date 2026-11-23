/* Read-aloud (Grade 6, the Grade 5 Inferences site's copy), ported from the Grade 5 FIAB practice site: the device's own voice at rate 0.82, and the word
   being said lights up.

   What is shown = what is said. A spoken box is built from word spans (sayHTML). Each span shows a word
   and carries what the voice says for it (data-say: a footnote mark is not said, 🔊 is said as "the
   speaker button"). The box's spoken text is put together from its spans in order (spokenOf), so the
   span at the voice's charIndex is the word being said and lights up (lightAt).

   A box is read one sentence at a time (spokenLines → readLines): Chrome can cut off one long reading
   partway, and a passage paragraph is long. */
(function () {
  'use strict';

  const READ_RATE = 0.82;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // The real test's cue words (Grade 3/5 round 4, 11/21; Grade 6 11/22): **best**, and **two** after Select or Choose, in a
  // question's own words only. Shown bold; the stars are never shown or said, so the voice, its recording and the
  // highlight are the same as before (tools/check_drafts.py says which words, and where).
  const cue = s => esc(s).replace(/\*\*([^*\s]+)\*\*/g, '<strong class="cue">$1</strong>');

  const SIGN_SAY = { '🔊': 'the speaker button', '·': '', '—': '', '💡': '' };
  const wordSpan = (show, say, stop) => `<span class="w" data-say="${esc(say)}"${stop ? ' data-stop' : ''}>${show}</span>`;
  // stop: the last word ends a sentence when read aloud (a pause), as each part and line did before
  function sayHTML(str, stop = true) {
    const pieces = [];   // [show, say]; say null = a space
    let ital = false;    // *a word* in a passage (a word talked about as a word) shows in italics; the * is never said
    const shown = chunk => {
      let out = '', seg = '';
      const flush = () => { if (seg) out += ital ? `<i>${esc(seg)}</i>` : esc(seg); seg = ''; };
      for (const ch of chunk) { if (ch === '*') { flush(); ital = !ital; } else seg += ch; }
      flush();
      return out;
    };
    String(str).split(/(\s+)/).forEach(chunk => {
      if (!chunk) return;
      if (/^\s+$/.test(chunk)) { pieces.push([chunk, null]); return; }
      const say = Object.prototype.hasOwnProperty.call(SIGN_SAY, chunk) ? SIGN_SAY[chunk] : chunk.replace(/[¹²³*]/g, '');
      pieces.push([chunk.includes('**') ? cue(chunk) : shown(chunk), say]);
    });
    let lastSaid = -1;
    pieces.forEach((pc, i) => { if (pc[1]) lastSaid = i; });
    return pieces.map((pc, i) => (pc[1] === null ? pc[0] : wordSpan(pc[0], pc[1], stop && i === lastSaid))).join('');
  }

  // The words a box says, in order, and where each span's words start in that text
  function spokenOf(box) {
    let text = '';
    const marks = [];
    box.querySelectorAll('.w').forEach(w => {
      const say = (w.dataset.say || '').trim();
      if (!say) return;
      if (text) text += ' ';
      marks.push([text.length, w]);
      text += say;
      if (w.hasAttribute('data-stop') && !/[.?!:]["”’]?$/.test(text)) text = `${text.replace(/,$/, '')}.`;
    });
    return { text, marks };
  }

  // The same words cut into sentences: each sentence its own reading, its own marks
  function spokenLines(box) {
    const lines = [];
    let cur = null;
    box.querySelectorAll('.w').forEach(w => {
      const say = (w.dataset.say || '').trim();
      if (!say) return;
      if (!cur) { cur = { text: '', marks: [] }; lines.push(cur); }
      if (cur.text) cur.text += ' ';
      cur.marks.push([cur.text.length, w]);
      cur.text += say;
      const ends = /[.?!]["”’)]?$/.test(say) && !/^(Mr|Mrs|Ms|Dr|St)\.$/.test(say);
      if (w.hasAttribute('data-stop') && !/[.?!:]["”’]?$/.test(cur.text)) cur.text = `${cur.text.replace(/,$/, '')}.`;
      if (ends || w.hasAttribute('data-stop')) cur = null;
    });
    return lines;
  }

  // Light the span being said: the last one starting at or before the voice's charIndex
  let litWord = null;
  function lightAt(marks, at) {
    let hit = null;
    for (const [start, w] of marks) { if (start <= at) hit = w; else break; }
    if (hit === litWord) return;
    if (litWord) litWord.classList.remove('hl');
    litWord = hit;
    if (hit) hit.classList.add('hl');
    if (hit) keepInView(hit);
  }
  // a word said below (or above) the screen comes into view, so the eyes can follow the voice
  function keepInView(w) {
    const r = w.getBoundingClientRect();
    const box = w.closest('.pp-scroll');
    const b = box ? box.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    if (r.height && (r.bottom > Math.min(b.bottom, window.innerHeight) || r.top < Math.max(b.top, 0))) {
      w.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
  function unlight() {
    if (litWord) litWord.classList.remove('hl');
    litWord = null;
  }

  function pickVoice() {
    const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    return vs.find(v => v.default && /^en/i.test(v.lang)) || vs.find(v => /^en[-_]US/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
  }

  let readingEl = null;
  let speaking = null;   // the reading now playing; marked when something stops it
  function stopReading() {
    if (speaking) speaking.stopped = true;
    speaking = null;
    unlight();
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* no speech on this device */ }
    if (readingEl) readingEl.classList.remove('reading');
    readingEl = null;
  }

  // Lines one after another, `gap` ms apart, each its own short reading. onHeard runs after the last line
  // ends, unless something stopped it (another 🔊, leaving the page). Returns false when this computer
  // cannot read aloud, otherwise the run: run.stopped is set when the page stops it; run.failed when the
  // voice itself gave up on a line (an error that is not "interrupted": a hidden tab, no voice, a voice that
  // won't start), and onFail runs then, so a page that waits for the end is never left waiting for nothing.
  function readLines(lines, el, onHeard, gap = 250, onFail = null) {
    stopReading();
    if (!window.speechSynthesis) return false;
    const run = { stopped: false };
    speaking = run;
    if (el) { el.classList.add('reading'); readingEl = el; }
    const done = ok => {
      if (speaking === run) { speaking = null; unlight(); }
      if (el) el.classList.remove('reading');
      if (readingEl === el) readingEl = null;
      if (ok && !run.stopped && onHeard) onHeard();
    };
    if (!lines.length) { done(true); return run; }
    const say = i => {
      if (run.stopped) return;
      const u = new SpeechSynthesisUtterance(lines[i].text);
      if (lines[i].marks) u.onboundary = e => { if (!run.stopped) lightAt(lines[i].marks, e.charIndex); };
      u.rate = READ_RATE;
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-US'; }
      u.onend = () => {
        if (run.stopped) done(false);
        else if (i + 1 < lines.length) setTimeout(() => say(i + 1), gap);
        else done(true);
      };
      u.onerror = e => {
        const cut = e && (e.error === 'interrupted' || e.error === 'canceled');
        if (!run.stopped && !cut) { run.failed = true; done(false); if (onFail) onFail(); return; }
        done(false);
      };
      speechSynthesis.speak(u);
    };
    say(0);
    return run;
  }
  const isSpeaking = run => Boolean(run) && speaking === run && !run.stopped;

  // Read the words in a box, a sentence at a time, each word lighting up
  const readBox = (box, onHeard) => readLines(spokenLines(box), box, onHeard);
  const wasStopped = run => Boolean(run) && Boolean(run.stopped);

  // 🔊 buttons read the words in their own box, or in the box data-box points at
  const sayBtn = (label, box) => `<button type="button" class="say"${box ? ` data-box="${box}"` : ''} aria-label="${esc(label || 'Read aloud')}">🔊</button>`;
  document.addEventListener('click', e => {
    const b = e.target.closest('.say');
    if (!b) return;
    e.stopPropagation();
    e.preventDefault();
    const box = b.dataset.box ? document.querySelector(b.dataset.box) : b.closest('[data-read-box]');
    if (box) readBox(box);
  }, true);
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => {};
  window.addEventListener('pagehide', stopReading);

  window.G6Speech = { READ_RATE, esc, cue, sayHTML, wordSpan, spokenOf, spokenLines, readLines, readBox, stopReading, isSpeaking, wasStopped, sayBtn };
})();
