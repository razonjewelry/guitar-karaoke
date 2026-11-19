/*
 * קורס הגיטרה (30 שיעורים) — מסכים: #/course (רשימה + חזרה להיום), #/course/N (שיעור), #/course/review (חזרה מרווחת).
 * המיקרופון מופעל פעם אחת לשיעור; כל צעד (אקורד / החלפות / סדר אקראי / פריטה) שופט לפי אותו זרם.
 * זיהוי אקורד = אותו מנגנון קיים (chroma.match); שיפוט קצב = תזמון בלבד (לא כיוון הפריטה).
 * כל צעד אפשר לסמן ידנית ("דלג / סמן בוצע") כדי שחוסר דיוק של המיקרופון לא ייתקע את הלומד.
 */
(function () {
  var GK = (window.GK = window.GK || {});
  GK.ui = GK.ui || {};
  var esc = GK.esc, R = null;            // R = מצב המסך הפעיל
  var OFFS = [1, 3, 7, 14];
  var ALL = ['Em', 'Am', 'E', 'A', 'D', 'Dm', 'C', 'G', 'B7'];

  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function dayMs() { return 86400000; }
  function learnedUpTo(n) {
    var s = {};
    GK.COURSE.forEach(function (l) { if (l.n <= n) l.chords.forEach(function (c) { s[c] = 1; }); });
    return Object.keys(s);
  }
  function lessonByN(n) { return GK.COURSE.filter(function (l) { return l.n === n; })[0] || null; }

  /** חזרה מרווחת: אילו שיעורים מגיעים לחזרה היום (+1, +3, +7, +14 ימים מאז הסיום) */
  function dueReviews() {
    var p = GK.store.course(), now = Date.now(), out = [];
    Object.keys(p.done || {}).forEach(function (k) {
      var l = lessonByN(+k); if (!l || !l.chords.length) return;
      var age = (now - p.done[k]) / dayMs(), doneOffs = (p.rev && p.rev[k]) || [];
      OFFS.forEach(function (o) { if (age >= o && doneOffs.indexOf(o) < 0) out.push({ n: +k, off: o }); });
    });
    return out;
  }

  // ───── מסך הרשימה ─────
  function renderHome(root) {
    var p = GK.store.course(), done = p.done || {}, next = 1;
    GK.COURSE.forEach(function (l) { if (done[l.n]) next = Math.max(next, l.n + 1); });
    next = Math.min(next, 30);
    var due = dueReviews(), count = Object.keys(done).length;
    var h = '<header class="p-top"><a class="btn icon" href="#/" aria-label="חזרה">→</a><div class="p-title"><h1>🎓 קורס גיטרה</h1><small>30 שיעורים · ' + count + ' הושלמו</small></div></header><div class="l-body">';
    h += '<div class="c-bar"><i style="width:' + Math.round(count / 30 * 100) + '%"></i></div>';
    h += '<a class="btn gold c-next" href="#/course/' + next + '">' + (count ? '▶ המשך: שיעור ' + next + ' — ' + esc(lessonByN(next).title) : '▶ התחל: שיעור 1') + '</a>';
    if (due.length) h += '<a class="btn c-rev" href="#/course/review">🔁 חזרה קצרה להיום (' + due.length + ')</a>';
    [1, 2, 3, 4].forEach(function (ph) {
      h += '<h2 class="c-ph">שלב ' + ph + ' · ' + GK.COURSE_PHASES[ph] + '</h2><div class="c-list">';
      GK.COURSE.filter(function (l) { return l.ph === ph; }).forEach(function (l) {
        h += '<a class="c-item' + (done[l.n] ? ' ok' : '') + (l.n === next ? ' cur' : '') + '" href="#/course/' + l.n + '"><b>' + l.n + '</b><span>' + esc(l.title) + (l.check ? ' 🏁' : '') + '</span><em>' + (done[l.n] ? '✓' : l.min + ' דק׳') + '</em></a>';
      });
      h += '</div>';
    });
    h += '<div class="note">איך זה עובד: כל שיעור 12–18 דקות. המיקרופון בודק אקורדים, החלפות וקצב. אם הוא לא קולט — אפשר לסמן "דלג" ולהמשיך. חזרות מגיעות אחרי יום, 3 ימים, שבוע ושבועיים.</div></div>';
    root.innerHTML = h;
  }

  // ───── מסך שיעור ─────
  function stepTitle(s) {
    if (s.t === 'chord') return 'אקורד ' + s.chord + ' — ' + s.need + ' מתוך ' + s.n;
    if (s.t === 'change') return 'החלפות ' + s.a + ' ↔ ' + s.b + ' — ' + s.need + ' ב-' + s.secs + ' שניות';
    if (s.t === 'order') return 'אקורדים בסדר אקראי — ' + s.need + '% נכון';
    if (s.t === 'strum') return 'פריטה — ' + s.need + '% פגיעות';
    if (s.t === 'song') { var so = GK.catalog.get(s.id); return 'שיר: ' + (so ? so.title : s.id); }
    if (s.t === 'manual') return 'תרגול ידני';
    return 'הסבר';
  }

  function openLesson(root, lesson, review) {
    var p = GK.store.course(), ok = ((p.steps || {})[lesson.n] || {});
    var vocab = review ? lesson.chords : learnedUpTo(lesson.n);
    R = { root: root, lesson: lesson, review: review, vocab: vocab, ok: ok, mic: false, calls: 0, sr: 16000, run: null, coach: null, steps: [] };
    var h = '<header class="p-top"><a class="btn icon" href="#/course" aria-label="חזרה">→</a><div class="p-title"><h1>' + (review ? '🔁 חזרה קצרה' : 'שיעור ' + lesson.n + ' · ' + esc(lesson.title)) + '</h1><small>' + esc(lesson.goal) + '</small></div></header><div class="l-body">';
    h += '<div class="c-mic"><button class="btn gold" id="c-mic">🎤 הפעל מיקרופון</button><span id="c-heard">—</span><i class="lvl"><b id="c-lvl"></b></i></div>';
    h += '<div id="c-steps"></div><div id="c-fin"></div></div>';
    root.innerHTML = h;
    var host = root.querySelector('#c-steps');
    lesson.steps.forEach(function (s, i) { var d = document.createElement('div'); d.className = 'c-step' + (ok[i] ? ' done' : ''); host.appendChild(d); R.steps.push(d); renderStep(i); });
    root.querySelector('#c-mic').addEventListener('click', function () { if (R.mic) micOff(); else micOn(); });
    host.addEventListener('click', onClick);
    R.onHide = function () { if (document.hidden) micOff(); };
    document.addEventListener('visibilitychange', R.onHide);
    refreshFinish();
  }

  function renderStep(i) {
    var s = R.lesson.steps[i], d = R.steps[i], done = !!R.ok[i];
    var h = '<div class="c-sh"><b>' + (done ? '✓ ' : '') + esc(stepTitle(s)) + '</b></div>';
    if (s.text) h += '<p>' + esc(s.text) + '</p>';
    if (s.t === 'info') h += '<p>' + esc(s.text) + '</p>';
    if (s.t === 'chord') h += '<div class="c-ch">' + GK.chordSvg(s.chord) + '<div class="c-big">' + esc(s.chord) + '</div></div>';
    if (s.t === 'change') h += '<div class="c-ch">' + GK.chordSvg(s.a) + GK.chordSvg(s.b) + '</div>';
    if (s.t === 'order') h += '<div class="c-ch c-orders">' + s.chords.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</div>';
    if (s.t === 'strum') h += '<div class="c-coach"></div>';
    if (s.t === 'song') {
      var pr = GK.store.songPrefs(s.id), fin = pr.done && pr.done > (R.startedAt || 0) - 1;
      h += '<a class="btn' + (pr.done ? '' : ' gold') + '" href="#/song/' + encodeURIComponent(s.id) + '">🎸 פתח את השיר' + (pr.done ? ' (הושלם בעבר)' : '') + '</a>';
    }
    h += '<div class="c-live" data-live></div><div class="c-act">';
    if (s.t === 'chord' || s.t === 'change' || s.t === 'order') h += '<button class="btn gold" data-a="start">▶ התחל</button>';
    if (s.t === 'strum') h += '<button class="btn" data-a="check">✓ בדוק תוצאה</button>';
    if (s.t === 'info') h += '<button class="btn gold" data-a="skip">הבנתי</button>';
    else if (!done) h += '<button class="btn" data-a="skip">' + (s.t === 'manual' ? '✓ עשיתי' : 'דלג / סמן בוצע') + '</button>';
    h += '</div>';
    d.innerHTML = h;
    d.classList.toggle('done', done);
    if (s.t === 'strum') mountCoach(i);
    var go = d.querySelector('[data-a="start"]'); if (go && done) go.textContent = '↻ עוד פעם';
  }

  function mountCoach(i) {
    var s = R.lesson.steps[i], d = R.steps[i], host = d.querySelector('.c-coach');
    if (R.coachStep === i && R.coach) { R.coach.destroy(); R.coach = null; }
    GK.store.setPractice('bpm', s.bpm);
    var pat = GK.pat.byId(s.pat), meter = pat ? GK.pat.meterKey(pat) : '4/4';
    R.coach = GK.ui.createCoach(host, { mode: 'learn', meter: meter, patternId: s.pat });
    R.coachStep = i;
    d.querySelector('.co-set') && d.querySelector('.co-set').removeAttribute('open');
  }

  function live(i, html) { var e = R.steps[i].querySelector('[data-live]'); if (e) e.innerHTML = html; }
  function setHeard(t, good) { var e = R.root.querySelector('#c-heard'); if (e) { e.textContent = '🎤 ' + (t || '—'); e.className = good === true ? 'ok' : good === false ? 'bad' : ''; } }

  function markOk(i) {
    R.ok[i] = true;
    var p = GK.store.course(); p.steps = p.steps || {}; p.steps[R.lesson.n] = R.ok; GK.store.setCourse(p);
    renderStep(i); refreshFinish();
    if (navigator.vibrate) try { navigator.vibrate(40); } catch (e) {}
  }

  function allOk() { return R.lesson.steps.every(function (s, i) { return R.ok[i]; }); }
  function refreshFinish() {
    var f = R.root.querySelector('#c-fin');
    if (!allOk()) { f.innerHTML = ''; return; }
    var p = GK.store.course();
    if (R.review) { f.innerHTML = '<button class="btn gold" id="c-end">✓ סיימתי את החזרה</button>'; }
    else f.innerHTML = '<div class="c-done">' + (p.done && p.done[R.lesson.n] ? 'השיעור הושלם ✓' : (R.lesson.final ? '🏆 סיימת את הקורס!' : '🎉 כל הצעדים הושלמו')) + '</div><button class="btn gold" id="c-end">' + (R.lesson.n < 30 && !R.review ? 'סיים שיעור והמשך ←' : 'סיים') + '</button>';
    f.querySelector('#c-end').addEventListener('click', function () {
      var pr = GK.store.course(); pr.done = pr.done || {}; pr.rev = pr.rev || {};
      if (R.review) { R.reviewItems.forEach(function (it) { pr.rev[it.n] = (pr.rev[it.n] || []).concat([it.off]); }); GK.store.setCourse(pr); location.hash = '#/course'; return; }
      pr.done[R.lesson.n] = pr.done[R.lesson.n] || Date.now(); GK.store.setCourse(pr);
      location.hash = R.lesson.n < 30 ? '#/course/' + (R.lesson.n + 1) : '#/course';
    });
  }

  // ───── הרצת צעדים ─────
  function onClick(e) {
    var b = e.target.closest ? e.target.closest('[data-a]') : null; if (!b) return;
    var i = R.steps.indexOf(b.closest('.c-step')), s = R.lesson.steps[i], a = b.getAttribute('data-a');
    if (a === 'skip') { stopRun(); markOk(i); return; }
    if (a === 'check') {
      var st = R.coach && R.coach.stats ? R.coach.stats() : null;
      if (!st) { GK.toast('התחל לנגן קודם'); return; }
      var tot = st.hit + st.early + st.late + st.missed;
      if (tot < 8) { live(i, 'נגן לפחות כמה תיבות ואז לחץ שוב'); return; }
      var pct = Math.round(st.hit / tot * 100);
      live(i, 'פגיעות בתזמון: <b>' + pct + '%</b> (צריך ' + s.need + '%). מוקדם ' + st.early + ' · מאוחר ' + st.late + ' · פספוס ' + st.missed);
      if (pct >= s.need) markOk(i); return;
    }
    if (a === 'start') {
      stopRun();
      if (!R.mic) { GK.toast('הפעל קודם את המיקרופון'); return; }
      startRun(i, s);
    }
  }
  function stopRun() { if (R.run) { clearInterval(R.run.timer); clearTimeout(R.run.to); R.run = null; } }

  function judgeOnce(a, target, vocab) {
    var m = GK.chroma.match(a.chroma, vocab), sens = GK.SENS[GK.store.settings().sens] || GK.SENS[1];
    if (!m.best || m.score < sens.min || m.score - m.second < 0.02) return { s: 'unclear', best: null, score: m.score };
    return { s: m.best === target ? 'ok' : 'wrong', best: m.best, score: m.score, strong: m.score >= sens.strong };
  }
  function vocabFor(chs) { var v = R.vocab.slice(); chs.forEach(function (c) { if (v.indexOf(c) < 0) v.push(c); }); return v; }

  function startRun(i, s) {
    var run = R.run = { i: i, s: s };
    if (s.t === 'chord') {
      run.ok = 0; run.tries = 0; run.voc = vocabFor([s.chord]); run.prevBest = null;
      live(i, 'פרוט ' + esc(s.chord) + ' · הרם אצבעות בין ניסיונות. <span class="c-dots"></span>');
      run.on = function (a) {
        var j = judgeOnce(a, s.chord, run.voc);
        if (j.s === 'unclear') { setHeard('לא ברור', null); return; }
        run.tries++; if (j.s === 'ok') run.ok++;
        setHeard(j.best + ' ' + Math.round(j.score * 100) + '%', j.s === 'ok');
        live(i, 'ניסיון ' + run.tries + '/' + s.n + ' · נכון: <b>' + run.ok + '</b>/' + s.need + (j.s === 'wrong' ? ' · שמעתי ' + esc(j.best) : ''));
        if (run.ok >= s.need) { stopRun(); markOk(i); }
        else if (run.tries >= s.n) { stopRun(); live(i, 'יצא ' + run.ok + ' מתוך ' + s.n + ' (צריך ' + s.need + '). אפשר שוב, או "דלג" אם הצליל נקי ופשוט המיקרופון לא קולט.'); }
      };
    } else if (s.t === 'change') {
      run.cnt = 0; run.cur = s.a; run.t0 = Date.now(); run.voc = vocabFor([s.a, s.b]); run.weak = 0;
      var tick = function () {
        var left = Math.max(0, s.secs - Math.floor((Date.now() - run.t0) / 1000));
        live(i, 'עכשיו: <b class="c-cur">' + esc(run.cur) + '</b> · החלפות: <b>' + run.cnt + '</b>/' + s.need + ' · ' + left + ' שנ׳');
        if (left <= 0) { stopRun(); if (run.cnt >= s.need) markOk(i); else live(i, 'יצאו ' + run.cnt + ' החלפות (צריך ' + s.need + '). נסה שוב לאט יותר ונקי.'); }
      };
      run.timer = setInterval(tick, 250); tick();
      run.on = function (a) {
        var j = judgeOnce(a, run.cur, run.voc);
        if (j.s === 'unclear') return;
        setHeard(j.best, j.s === 'ok');
        if (j.s === 'ok' && (j.strong || run.weak++ >= 1)) { run.weak = 0; run.cnt++; run.cur = run.cur === s.a ? s.b : s.a; tick(); if (run.cnt >= s.need) { stopRun(); markOk(i); } }
      };
    } else if (s.t === 'order') {
      var seq = []; for (var r = 0; r < s.rounds; r++) seq = seq.concat(shuffle(s.chords));
      for (var q = 1; q < seq.length; q++) if (seq[q] === seq[q - 1]) { var sw = (q + 1) % seq.length; var t = seq[q]; seq[q] = seq[sw]; seq[sw] = t; }
      run.seq = seq; run.k = 0; run.hit = 0; run.voc = vocabFor(s.chords);
      var show = function () {
        if (run.k >= seq.length) { stopRun(); var pct = Math.round(run.hit / seq.length * 100); live(i, 'תוצאה: <b>' + pct + '%</b> (' + run.hit + '/' + seq.length + ', צריך ' + s.need + '%)'); if (pct >= s.need) markOk(i); return; }
        live(i, '<div class="c-prompt">' + esc(seq[run.k]) + '</div><div class="c-ch">' + GK.chordSvg(seq[run.k]) + '</div>' + (run.k + 1) + '/' + seq.length);
        clearTimeout(run.to); run.to = setTimeout(function () { run.k++; show(); }, 8000);
      };
      run.on = function (a) {
        var j = judgeOnce(a, seq[run.k], run.voc);
        if (j.s === 'unclear') return;
        setHeard(j.best, j.s === 'ok');
        if (j.s === 'ok') { run.hit++; run.k++; show(); }
      };
      show();
    }
  }

  // ───── מיקרופון ─────
  function micOn() {
    GK.sound.ensure();
    var b = R.root.querySelector('#c-mic'); b.disabled = true;
    GK.listen.start(onResult, GK.SENS[GK.store.settings().sens].k).then(function (sr) {
      if (!R) { GK.listen.stop(); return; }
      R.sr = sr || 16000; R.calls = 0; R.mic = true; b.disabled = false; b.textContent = '⏹ כבה מיקרופון'; b.classList.add('on');
    }).catch(function () { if (R) { b.disabled = false; GK.toast('אין גישה למיקרופון — אשר הרשאה בדפדפן'); } });
  }
  function micOff() {
    GK.listen.stop();
    if (!R) return;
    stopRun(); R.mic = false;
    var b = R.root.querySelector('#c-mic'); if (b) { b.textContent = '🎤 הפעל מיקרופון'; b.classList.remove('on'); b.disabled = false; }
    var l = R.root.querySelector('#c-lvl'); if (l) l.style.width = '0';
  }
  function onResult(r) {
    if (!R || !R.mic) return;
    var lv = R.root.querySelector('#c-lvl');
    if (lv) lv.style.width = (Math.max(0, Math.min(1, (Math.log10(Math.max(r.level, 1e-5)) + 3.2) / 2.4)) * 100).toFixed(0) + '%';
    R.calls++;
    var c = R.coach;
    if (c && c.isActive() && !c.gated() && GK.sound.ctx()) {
      var streamMs = (R.calls * 512 / R.sr) * 1000;
      r.onsets.forEach(function (o) { var age = Math.max(0, Math.min(400, streamMs - o.t)); c.feedOnset(GK.sound.now() - age / 1000 - 0.03); });
    }
    if (c && c.isActive()) return;                     // בזמן הדגמה קולית/צלילית לא בודקים אקורדים
    if (R.run && R.run.on) r.analyses.forEach(function (a) { if (R.run) R.run.on(a); });
  }

  GK.ui.course = {
    open: function (arg) {
      this.close();
      var root = document.getElementById('v-course');
      if (!arg) { R = null; renderHome(root); return; }
      if (arg === 'review') {
        var due = dueReviews();
        if (!due.length) { renderHome(root); return; }
        var set = {}; due.forEach(function (d) { lessonByN(d.n).chords.forEach(function (c) { set[c] = 1; }); });
        var chs = Object.keys(set).slice(0, 5);
        var les = { n: 0, title: 'חזרה', goal: 'חזרה מרווחת על מה שלמדת — 2 דקות.', min: 2, chords: chs, steps: [{ t: 'order', chords: chs, need: 70, rounds: 1 }] };
        openLesson(root, les, true); R.reviewItems = due; return;
      }
      var l = lessonByN(+arg);
      if (!l) { renderHome(root); return; }
      R = null; openLesson(root, l, false); R.startedAt = Date.now();
    },
    close: function () {
      if (R) { document.removeEventListener('visibilitychange', R.onHide); micOff(); if (R && R.coach) R.coach.destroy(); }
      GK.listen.stop(); R = null;
    }
  };
})();
