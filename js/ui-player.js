/*
 * מסך השיר: מילים עם אקורדים מעליהן, פס פריטה, דיאגרמות.
 * מצב "הקשבה": האפליקציה מקשיבה למיקרופון; כשמנגנים נכון את האקורד המסומן היא מאשרת ועוברת לבא.
 */
(function () {
  var GK = (window.GK = window.GK || {});
  GK.ui = GK.ui || {};
  var esc = GK.esc;
  var ARROW = { D: '↓', U: '↑', X: '×', '-': '·' };
  var S = null;                                   // הסשן הנוכחי

  // ───── בניית ה-HTML ─────
  function strumMini(arr) { return arr.map(function (a) { return '<span>' + ARROW[a] + '</span>'; }).join(''); }

  function segHtml(s) {
    var words = s.parts.map(function (p) { return p.w ? '<span class="w">' + esc(p.t) + '</span>' : esc(p.t); }).join('');
    return '<span class="seg"><span class="ch">' + (s.c ? esc(s.c) : '&nbsp;') + '</span><span class="tx">' + (words || '&nbsp;') + '</span></span>';
  }

  function lyricsHtml(song) {
    var out = [];
    song.lines.forEach(function (l) {
      if (l.section) out.push('<div class="sec">' + esc(l.section) + '</div>');
      else if (l.gap && l.i > 0) out.push('<div class="gap"></div>');
      if (l.strumChanged) out.push('<div class="mini">' + strumMini(l.strum) + '</div>');
      out.push('<div class="ln" data-i="' + l.i + '">' + l.segs.map(segHtml).join('') + '</div>');
    });
    return out.join('');
  }

  function stripHtml(song, pat) {
    return song.labels.map(function (lb, i) {
      return '<div class="slot' + (song.acc.indexOf(i) >= 0 ? ' acc' : '') + '"><span class="ar">' + ARROW[pat[i]] + '</span><span class="lb">' + lb + '</span></div>';
    }).join('');
  }

  // ───── עדכוני תצוגה ─────
  function setStrip(pat) {
    var key = pat.join('');
    if (S.patKey === key) return;
    S.patKey = key;
    for (var i = 0; i < S.slots.length; i++) S.slots[i].querySelector('.ar').textContent = ARROW[pat[i]];
  }

  function setChord(c) {
    if (S.curChord && S.cards[S.curChord]) S.cards[S.curChord].classList.remove('on');
    S.curChord = c;
    if (c && S.cards[c]) {
      var el = S.cards[c];
      el.classList.add('on');
      S.bar.scrollTo({ left: el.offsetLeft - S.bar.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
    }
  }

  function setHint(html, cls) {
    S.hint.innerHTML = html;
    S.hint.className = 'hint' + (cls ? ' ' + cls : '');
  }

  function setHeard(heard, target) {
    var txt = '🎤 ' + (heard || '—');
    if (S.heard.textContent !== txt) S.heard.textContent = txt;
    S.heard.className = 'heard' + (heard ? (heard === target ? ' ok' : ' bad') : '');
  }

  /** מעביר את "הצעד הנוכחי" לאקורד מספר i ומעדכן את כל הסימונים (נעשה / עכשיו / עתיד) */
  function setStep(i) {
    var n = S.steps.length, cur = S.steps[i] || null;
    S.idx = i;
    S.steps.forEach(function (st, k) {
      var el = S.segEls[st.line][st.seg];
      el.classList.toggle('done', k < i);
      el.classList.toggle('act', k === i);
    });
    var curLine = cur ? cur.line : S.lines.length;
    for (var L = 0; L < S.lines.length; L++) {
      S.lines[L].classList.toggle('past', L < curLine);
      S.lines[L].classList.toggle('cur', cur !== null && L === curLine);
    }
    S.step.textContent = Math.min(i + 1, n) + '/' + n;
    S.matcher.reset();
    if (cur) {
      setChord(cur.chord);
      setStrip(S.song.lines[cur.line].strum);
      setHint('נגן: <b>' + esc(cur.chord) + '</b>');
      S.lyr.scrollTo({ top: Math.max(0, S.lines[cur.line].offsetTop - S.lyr.clientHeight * 0.3), behavior: 'smooth' });
    } else {
      setChord(null);
      setHint('כל הכבוד! סיימת את השיר 🎸', 'ok');
    }
    setHeard(null, null);
  }

  function flash(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;                          // מאתחל את האנימציה
    el.classList.add(cls);
  }

  // ───── הקשבה ─────
  function onFrame(f) {
    if (!S || !S.listening) return;
    var st = S.steps[S.idx];
    if (!st) return;
    var r = S.matcher.feed(f, st.chord, S.song.chords);
    setHeard(r.heard, st.chord);
    if (r.status === 'confirm') {
      flash(S.segEls[st.line][st.seg], 'just');
      if (S.cards[st.chord]) flash(S.cards[st.chord], 'flash');
      if (navigator.vibrate) navigator.vibrate(35);
      if (S.idx + 1 >= S.steps.length) { setStep(S.steps.length); stopListen(); GK.toast('סיימת את השיר 🎸'); }
      else setStep(S.idx + 1);
    } else if (r.status === 'wrong') {
      setHint('שמעתי <b>' + esc(r.heard) + '</b> — צריך <b>' + esc(st.chord) + '</b>', 'warn');
    } else if (r.status === 'ok' || r.status === 'settling') {
      setHint('נגן: <b>' + esc(st.chord) + '</b>');
    }
  }

  function setListenUi(on) {
    S.playBtn.textContent = on ? '⏹ עצור' : '🎤 התחל';
    S.playBtn.classList.toggle('on', on);
  }

  function startListen() {
    if (S.idx >= S.steps.length) setStep(0);
    S.playBtn.disabled = true;
    GK.listen.start(onFrame).then(function () {
      if (!S) { GK.listen.stop(); return; }
      S.listening = true;
      S.playBtn.disabled = false;
      setListenUi(true);
      S.matcher.reset();
    }).catch(function () {
      if (!S) return;
      S.playBtn.disabled = false;
      GK.toast('אין גישה למיקרופון — אשר הרשאה בדפדפן');
    });
  }

  function stopListen() {
    GK.listen.stop();
    if (!S) return;
    S.listening = false;
    setListenUi(false);
    setHeard(null, null);
  }

  function jumpToLine(i) {
    for (var k = 0; k < S.steps.length; k++) if (S.steps[k].line >= i) { setStep(k); return; }
  }

  function close() {
    if (!S) return;
    GK.listen.stop();
    document.removeEventListener('visibilitychange', S.onHide);
    S.root.innerHTML = '';
    S = null;
  }

  function open(song) {
    close();
    var root = document.getElementById('v-player');
    var set = GK.store.settings();
    var steps = GK.buildSteps(song);
    var first = song.lines[0] ? song.lines[0].strum : ['-'];
    var meta = '<bdi>' + song.time + '</bdi>' + (song.capo ? ' · קאפו ' + song.capo : '') + (song.artist ? ' · ' + esc(song.artist) : '');

    root.innerHTML =
      '<header class="p-top"><a class="btn icon" href="#/" aria-label="חזרה">→</a>' +
      '<div class="p-title"><h1>' + esc(song.title) + '</h1><small>' + meta + '</small></div>' +
      '<button class="btn" id="p-edit">' + (song.builtin ? '✎ עותק לעריכה' : '✎ עריכה') + '</button></header>' +
      '<div class="chordbar" id="p-chords">' + song.chords.map(function (c) {
        return '<div class="cc" data-c="' + esc(c) + '">' + GK.chordSvg(c) + '<span>' + esc(c) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="strumbar"><span class="lab">פריטה</span><div class="slots" id="p-slots">' + stripHtml(song, first) + '</div></div>' +
      '<div class="status"><span class="step" id="p-step">0/' + steps.length + '</span><span class="hint" id="p-hint"></span><span class="heard" id="p-heard">🎤 —</span></div>' +
      '<div class="lwrap"><div class="lyrics" id="p-lyrics">' + lyricsHtml(song) + '</div></div>' +
      '<footer class="dock"><button class="play" id="p-play">🎤 התחל</button>' +
      '<button class="btn" id="p-back" aria-label="אקורד קודם">⏮</button>' +
      '<button class="btn" id="p-skip" aria-label="דלג על האקורד">⏭</button>' +
      '<button class="btn tog" id="p-sens" aria-label="רגישות המיקרופון"></button>' +
      '<button class="btn tog" id="p-font" aria-label="גודל גופן">Aa</button></footer>';
    root.style.setProperty('--fs', set.fontPx + 'px');

    var q = function (sel) { return root.querySelector(sel); };
    S = {
      song: song, root: root, set: set, steps: steps, idx: 0, listening: false,
      lyr: q('#p-lyrics'), bar: q('#p-chords'), playBtn: q('#p-play'), hint: q('#p-hint'), heard: q('#p-heard'), step: q('#p-step'),
      slots: root.querySelectorAll('#p-slots .slot'), cards: {}, lines: [], segEls: [],
      patKey: first.join(''), curChord: null, matcher: GK.createMatcher(GK.SENS[set.sens] || GK.SENS[1])
    };
    Array.prototype.forEach.call(root.querySelectorAll('.cc'), function (c) { S.cards[c.getAttribute('data-c')] = c; });
    Array.prototype.forEach.call(S.lyr.querySelectorAll('.ln'), function (ln) {
      S.lines.push(ln);
      S.segEls.push(ln.querySelectorAll('.seg'));
    });
    S.onHide = function () { if (document.hidden && S && S.listening) stopListen(); };   // חוסך סוללה ופרטיות
    document.addEventListener('visibilitychange', S.onHide);

    var senLabel = function () { q('#p-sens').textContent = '🎚 ' + GK.SENS[S.set.sens].name; };
    senLabel();

    // אירועים
    S.lyr.addEventListener('click', function (e) {
      var ln = e.target.closest ? e.target.closest('.ln') : null;
      if (ln) jumpToLine(parseInt(ln.getAttribute('data-i'), 10));
    });
    S.playBtn.addEventListener('click', function () { if (S.listening) stopListen(); else startListen(); });
    q('#p-back').addEventListener('click', function () { setStep(Math.max(0, Math.min(S.idx, S.steps.length) - 1)); });
    q('#p-skip').addEventListener('click', function () { if (S.idx < S.steps.length) setStep(S.idx + 1); });
    q('#p-sens').addEventListener('click', function () {
      S.set.sens = (S.set.sens + 1) % GK.SENS.length;
      GK.store.setSetting('sens', S.set.sens);
      S.matcher.setSens(GK.SENS[S.set.sens]);
      senLabel();
      GK.toast('רגישות: ' + GK.SENS[S.set.sens].name);
    });
    var SIZES = [18, 22, 26, 30, 34, 40];            // לחיצה על Aa עוברת לגודל הבא וחוזרת להתחלה
    q('#p-font').addEventListener('click', function () {
      var next = SIZES.filter(function (x) { return x > S.set.fontPx; })[0] || SIZES[0];
      S.set.fontPx = next;
      GK.store.setSetting('fontPx', next);
      root.style.setProperty('--fs', next + 'px');
    });
    q('#p-edit').addEventListener('click', function () {
      if (song.builtin) {
        var id = GK.store.newId();
        GK.store.saveUser(id, song.text);
        GK.toast('נוצר עותק שלך לעריכה');
        location.hash = '#/edit/' + id;
      } else location.hash = '#/edit/' + encodeURIComponent(song.id);
    });

    if (steps.length) setStep(0);
    else setHint('אין אקורדים בשיר הזה', 'warn');
  }

  GK.ui.player = { open: open, close: close, isPlaying: function () { return !!(S && S.listening); } };
})();
