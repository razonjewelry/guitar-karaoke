/*
 * מסך השיר: מילים עם אקורדים מעליהן, פס פריטה, דיאגרמות.
 * מצב "הקשבה": האפליקציה מקשיבה למיקרופון, סופרת את הפריטות שלך ומתקדמת בדפוס הפריטה;
 * כשמנגנים נכון את האקורד המסומן היא מאשרת ועוברת לבא ("דפוס מלא" = גם צריך לסיים את כל הפריטות של האקורד).
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

  GK.ui.lyricsHtml = lyricsHtml;

  function stripHtml(song, pat) {
    return song.labels.map(function (lb, i) {
      return '<div class="slot' + (song.acc.indexOf(i) >= 0 ? ' acc' : '') + '"><span class="ar">' + ARROW[pat[i]] + '</span><span class="lb">' + lb + '</span></div>';
    }).join('');
  }

  // ───── עדכוני תצוגה ─────
  function setStrip(pat) {
    S.pos = GK.strumPositions(pat);
    var key = pat.join('');
    if (S.patKey === key) return;
    S.patKey = key;
    for (var i = 0; i < S.slots.length; i++) S.slots[i].querySelector('.ar').textContent = ARROW[pat[i]];
  }

  /** מסמן בפס הפריטה אילו פריטות כבר נוגנו בתיבה הנוכחית ומה הפריטה הבאה, ומעדכן את המונה */
  function renderHits() {
    var len = S.pos.length, c = S.stepOnsets.length;
    var inBar = len ? (c === 0 ? 0 : ((c - 1) % len) + 1) : 0;
    for (var s = 0; s < S.slots.length; s++) {
      var pi = S.pos.indexOf(s);
      S.slots[s].classList.toggle('hit', pi >= 0 && pi < inBar);
      S.slots[s].classList.toggle('next', pi >= 0 && S.listening && pi === inBar % len);
    }
    S.cnt.textContent = 'פריטות: ' + (S.set.full && len ? Math.min(c, len) + '/' + len : c);
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

  function setHeard(heard, target, score) {
    var txt = '🎤 ' + (heard ? heard + (score ? ' ' + Math.round(score * 100) + '%' : '') : '—');
    if (S.heard.textContent !== txt) S.heard.textContent = txt;
    S.heard.className = 'heard' + (heard ? (heard === target ? ' ok' : ' bad') : '');
  }

  function setLevel(rms) {
    var pct = Math.max(0, Math.min(1, (Math.log10(Math.max(rms, 1e-5)) + 3.2) / 2.4)) * 100;
    S.lvl.style.width = pct.toFixed(0) + '%';
  }

  /** מעביר את "הצעד הנוכחי" לאקורד מספר i ומעדכן את כל הסימונים. carry = פריטות שכבר שייכות לצעד החדש; keepPrev = מעבר אוטומטי */
  function setStep(i, carry, keepPrev) {
    var n = S.steps.length, cur = S.steps[i] || null;
    S.idx = i; S.chordOk = false; S.confirmIdx = 0; S.stepOnsets = carry || [];
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
    S.now.textContent = cur ? cur.chord : '—';
    S.nxt.textContent = S.steps[i + 1] ? S.steps[i + 1].chord : '—';
    if (S.song.id) GK.store.setSongPref(S.song.id, 'step', i);
    S.matcher.reset(keepPrev);
    if (cur) {
      setChord(cur.chord);
      setStrip(S.song.lines[cur.line].strum);
      setHint('נגן: <b>' + esc(cur.chord) + '</b>' + (S.steps[i + 1] ? ' <small class="nx">← ' + esc(S.steps[i + 1].chord) + '</small>' : ''));
      S.lyr.scrollTo({ top: Math.max(0, S.lines[cur.line].offsetTop - S.lyr.clientHeight * 0.3), behavior: 'smooth' });
    } else {
      setChord(null);
      setHint('כל הכבוד! סיימת את השיר 🎸', 'ok');
    }
    renderHits();
    setHeard(null, null);
  }

  function flash(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;                          // מאתחל את האנימציה
    el.classList.add(cls);
  }

  // ───── הקשבה ─────
  /** עובר לאקורד הבא אחרי שהאקורד אושר (ובמצב דפוס מלא — אחרי שהושלמו הפריטות) */
  function advance() {
    var st = S.steps[S.idx];
    flash(S.segEls[st.line][st.seg], 'just');
    if (S.cards[st.chord]) flash(S.cards[st.chord], 'flash');
    if (navigator.vibrate) navigator.vibrate(35);
    S.lastAdv = S.pendingT !== undefined ? S.pendingT : S.lastAdv;
    var carry = S.set.full ? [] : S.stepOnsets.filter(function (i) { return i > S.confirmIdx; });   // פריטות שכבר שייכות לאקורד הבא
    if (S.idx + 1 >= S.steps.length) { if (S.song.id) GK.store.setSongPref(S.song.id, 'done', Date.now()); setStep(S.steps.length); stopListen(); GK.toast('סיימת את השיר 🎸'); }
    else setStep(S.idx + 1, carry, true);
  }

  /** בודק אם אפשר להתקדם: האקורד אושר, ובמצב דפוס מלא גם הושלמו כל הפריטות */
  function maybeAdvance() {
    if (!S.chordOk) return;
    var need = S.pos.length;
    if (S.set.full && need && S.stepOnsets.length < need) {
      setHint('✓ <b>' + esc(S.steps[S.idx].chord) + '</b> — השלם את הדפוס (' + S.stepOnsets.length + '/' + need + ')', 'ok');
      return;
    }
    advance();
  }

  function onResult(r) {
    if (!S || !S.listening) return;
    setLevel(r.level);
    S.calls++;
    if (S.coach && S.coach.gated()) return;          // בזמן הסבר קולי / ספירה מקדימה לא מקשיבים (הרמקול יישמע במיקרופון)
    if (S.coach && S.coach.isActive() && GK.sound.ctx()) {
      var streamMs = (S.calls * 512 / S.sr) * 1000;
      r.onsets.forEach(function (o) {
        var age = Math.max(0, Math.min(400, streamMs - o.t));
        S.coach.feedOnset(GK.sound.now() - age / 1000 - 0.03);
      });
    }
    r.onsets.forEach(function (o) {                // כל פריטה נספרת מיד, לפני שהאקורד נותח
      S.stepOnsets.push(o.idx);
      S.total++;
      renderHits();
      maybeAdvance();
    });
    r.analyses.forEach(function (a) {
      var st = S.steps[S.idx];
      if (!st || !S.listening) return;
      if (S.lastAdv !== undefined && a.t - S.lastAdv < 350) return;          // זנב הצליל של האקורד הקודם — לא פריטה חדשה
      var j = S.matcher.judge(a, st.chord, S.song.chords, S.steps[S.idx - 1] ? S.steps[S.idx - 1].chord : null);
      if (j.status === 'prev') {                   // פריטה נוספת של האקורד הקודם: לא שייכת לצעד הזה, לא נספרת בו
        S.stepOnsets = S.stepOnsets.filter(function (i) { return i !== a.idx; });
        renderHits();
        setHeard(j.heard, j.heard, j.score);
        return;
      }
      setHeard(j.heard, st.chord, j.score);
      if (j.status === 'confirm') { S.chordOk = true; S.confirmIdx = a.idx; S.pendingT = a.t; maybeAdvance(); }
      else if (j.status === 'maybe') setHint('כמעט… עוד פריטה של <b>' + esc(st.chord) + '</b>');
      else if (j.status === 'wrong') setHint('שמעתי <b>' + esc(j.heard) + '</b> — צריך <b>' + esc(st.chord) + '</b>', 'warn');
    });
  }

  function setListenUi(on) {
    S.playBtn.textContent = on ? '⏹ עצור' : '🎤 התחל';
    S.playBtn.classList.toggle('on', on);
    renderHits();
  }

  /** מזהה סרטון יוטיוב מקישור (watch, youtu.be, shorts, embed) */
  function ytId(u) {
    var m = String(u || '').match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
    return m ? m[1] : null;
  }
  GK.ytId = ytId;
  function videoUrl() { return (GK.store.songPrefs(S.song.id).video) || S.song.video || ''; }
  var PIPED = ['https://api.piped.private.coffee', 'https://pipedapi.kavin.rocks'];
  /** חיפוש אוטומטי ביוטיוב דרך ממשק חיפוש ציבורי (Piped, פתוח לקריאה מדפדפן). מחזיר Promise<[{id,title}]>; ריק אם אין תוצאה/שירות */
  function findVideos(q) {
    var i = 0;
    function next() {
      if (i >= PIPED.length) return Promise.resolve([]);
      var base = PIPED[i++], ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 9000);
      return fetch(base + '/search?q=' + encodeURIComponent(q) + '&filter=videos', { signal: ctl.signal }).then(function (r) { clearTimeout(t); return r.ok ? r.json() : null; }, function () { clearTimeout(t); return null; }).then(function (d) {
        var items = d && d.items ? d.items.map(function (x) { var m = /v=([\w-]{11})/.exec(x.url || ''); return m ? { id: m[1], title: x.title || '' } : null; }).filter(Boolean) : [];
        return items.length ? items.slice(0, 6) : next();
      });
    }
    return next();
  }
  GK.findVideos = findVideos;
  function videoQuery() { var a = S.song.builtin ? '' : (S.song.artist || ''); return (S.song.title + ' ' + a).trim(); }
  function showEmbed(box, id, results, k) {
    box.hidden = false;
    box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + id + '?playsinline=1" title="השיר המקורי" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>' +
      '<div class="pv-act"><span>המיקרופון כבוי בזמן ההאזנה.</span>' + (results && results.length > 1 ? '<button class="btn" id="pv-next">לא זה? הבא</button>' : '') + '<button class="btn" id="pv-redo">🔄 חפש אחר</button><button class="btn" id="pv-close">סגור</button></div>';
    box.querySelector('#pv-redo').addEventListener('click', function () { S.skipVid = id; GK.store.setSongPref(S.song.id, 'video', ''); S.song.video = ''; box.hidden = true; box.innerHTML = ''; toggleVideo(); });
    box.querySelector('#pv-close').addEventListener('click', function () { box.hidden = true; box.innerHTML = ''; });
    var nx = box.querySelector('#pv-next');
    if (nx) nx.addEventListener('click', function () { var n = (k + 1) % results.length; GK.store.setSongPref(S.song.id, 'video', 'https://youtu.be/' + results[n].id); showEmbed(box, results[n].id, results, n); });
  }
  function manualBox(box, why) {
    var q = encodeURIComponent(videoQuery());
    box.hidden = false;
    box.innerHTML = '<div class="pv-none">' + why + '</div><a class="btn" target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/results?search_query=' + q + '">🔍 חפש ביוטיוב</a>' +
      '<input class="search" id="pv-in" placeholder="הדבק כאן קישור מיוטיוב" dir="ltr"><button class="btn gold" id="pv-save">שמור</button>';
    box.querySelector('#pv-save').addEventListener('click', function () {
      var v = box.querySelector('#pv-in').value.trim();
      if (!ytId(v)) { GK.toast('זה לא נראה כמו קישור ליוטיוב'); return; }
      GK.store.setSongPref(S.song.id, 'video', v); showEmbed(box, ytId(v), null, 0);
    });
  }
  function toggleVideo() {
    var box = S.root.querySelector('#p-video');
    if (!box.hidden) { box.hidden = true; box.innerHTML = ''; return; }
    if (S.listening) stopListen();
    if (S.coach) S.coach.stop();
    var id = ytId(videoUrl());
    if (id) { showEmbed(box, id, null, 0); return; }
    box.hidden = false; box.innerHTML = '<div class="pv-none">🔎 מחפש את השיר ביוטיוב…</div>';
    var sid = S.song.id;
    findVideos(videoQuery()).then(function (res) {
      if (!S || S.song.id !== sid || box.hidden) return;
      if (!res.length) { manualBox(box, 'לא הצלחתי למצוא אוטומטית (השירות לא זמין כרגע).'); return; }
      var k = 0; if (S.skipVid) { for (var z = 0; z < res.length; z++) if (res[z].id === S.skipVid) k = (z + 1) % res.length; S.skipVid = null; }
      GK.store.setSongPref(sid, 'video', 'https://youtu.be/' + res[k].id);
      showEmbed(box, res[k].id, res, k);
    });
  }

  function startListen() {
    if (S.idx >= S.steps.length) setStep(0);
    var vb = S.root.querySelector('#p-video'); if (vb && !vb.hidden) { vb.hidden = true; vb.innerHTML = ''; }
    S.playBtn.disabled = true;
    GK.sound.ensure();
    GK.listen.start(onResult, GK.SENS[S.set.sens].k).then(function (sr) {
      if (!S) { GK.listen.stop(); return; }
      S.sr = sr || 16000; S.calls = 0;
      S.listening = true;
      S.playBtn.disabled = false;
      S.matcher.reset();
      setListenUi(true);
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
    S.lvl.style.width = '0';
  }

  function jumpToLine(i) {
    for (var k = 0; k < S.steps.length; k++) if (S.steps[k].line >= i) { setStep(k); return; }
  }

  function close() {
    if (!S) return;
    GK.listen.stop();
    if (S.coach) S.coach.destroy();
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
    var meta = (song.timeKnown || song.builtin ? '<bdi>' + song.time + '</bdi>' : 'משקל לא ידוע') + (song.capo ? ' · קאפו ' + song.capo : '') + (song.artist ? ' · ' + esc(song.artist) : '');

    root.innerHTML =
      '<header class="p-top"><a class="btn icon" href="#/" aria-label="חזרה">→</a>' +
      '<div class="p-title"><h1>' + esc(song.title) + '</h1><small>' + meta + '</small></div>' +
      '<button class="btn icon" id="p-edit" aria-label="' + (song.builtin ? 'עותק לעריכה' : 'עריכה') + '">✎</button></header>' +
      '<div class="chordbar" id="p-chords">' + song.chords.map(function (c) {
        return '<div class="cc" data-c="' + esc(c) + '">' + GK.chordSvg(c) + '<span>' + esc(c) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="nownext" hidden><b id="p-now">—</b><b id="p-next">—</b></div>' +
      '<details class="p-coach" id="p-coachbox"><summary><span>🥁 מאמן פריטה ▾</span><span class="co-mini" id="p-mini" dir="ltr"></span></summary><div id="p-coach"></div></details>' +
      '<div class="status"><span class="step" id="p-step">0/' + steps.length + '</span><span class="hint" id="p-hint"></span><span class="heard" id="p-heard">🎤 —</span></div>' +
      '<div class="p-tools" id="p-tools" hidden>' +
      '<button class="btn" id="p-hear" aria-label="שמע איך הפריטה נשמעת">🔊 שמע פריטה</button><button class="btn" id="p-vid" aria-label="השיר המקורי ביוטיוב">🎬 שיר מקורי</button>' +
      '<button class="btn tog" id="p-full" aria-label="מצב דפוס"></button><button class="btn tog" id="p-sens" aria-label="רגישות המיקרופון"></button><button class="btn tog" id="p-font" aria-label="גודל גופן">Aa</button>' +
      '<span class="cnt" id="p-cnt">פריטות: 0</span><i class="lvl" title="עוצמת המיקרופון"><b id="p-lvl"></b></i></div>' +
      '<div class="p-video" id="p-video" hidden></div>' +
      '<div class="lwrap"><div class="lyrics" id="p-lyrics">' + lyricsHtml(song) + '</div></div>' +
      '<footer class="dock"><button class="play" id="p-play">🎤 התחל</button>' +
      '<button class="btn" id="p-restart" aria-label="התחל מההתחלה">↺</button><button class="btn" id="p-back" aria-label="אקורד קודם">⏮</button>' +
      '<button class="btn" id="p-skip" aria-label="דלג על האקורד">⏭</button>' +
      '<button class="btn tog" id="p-more" aria-label="עוד כלים">⋯</button></footer>';
    root.style.setProperty('--fs', set.fontPx + 'px');

    var q = function (sel) { return root.querySelector(sel); };
    S = {
      song: song, root: root, set: set, steps: steps, idx: 0, listening: false, chordOk: false, confirmIdx: 0, stepOnsets: [], total: 0, pos: [],
      lyr: q('#p-lyrics'), bar: q('#p-chords'), playBtn: q('#p-play'), hint: q('#p-hint'), heard: q('#p-heard'), step: q('#p-step'),
      cnt: q('#p-cnt'), lvl: q('#p-lvl'), now: q('#p-now'), nxt: q('#p-next'), calls: 0, sr: 16000,
      slots: root.querySelectorAll('#p-slots .slot'), cards: {}, lines: [], segEls: [],
      patKey: first.join(''), curChord: null, matcher: GK.createMatcher(GK.SENS[set.sens] || GK.SENS[1])
    };
    S.pos = GK.strumPositions(first);
    var prefs = GK.store.songPrefs(song.id);
    var verified = (song.strumVerified && song.strumDeclared) ? GK.pat.fromLegacy(first, song.time, 'verified', 'src-' + song.id, 'פריטת המקור') : null;
    S.coach = GK.ui.createCoach(q('#p-coach'), {
      mini: q('#p-mini'),
      mode: 'song', meter: song.timeKnown ? song.time : (prefs.time || '4/4'), timeKnown: song.timeKnown, verified: verified,
      patternId: prefs.patternId,
      onPattern: function (p) { GK.store.setSongPref(song.id, 'patternId', p.id); },
      onMeter: function (m) { GK.store.setSongPref(song.id, 'time', m); },
      onPhase: function (ph) { if (ph === 'idle') setHint(S.steps[S.idx] ? 'נגן: <b>' + esc(S.steps[S.idx].chord) + '</b>' : ''); else if (ph === 'explain') setHint('מקשיבים להסבר…'); else if (ph === 'count') setHint('ספירה…'); }
    });
    Array.prototype.forEach.call(root.querySelectorAll('.cc'), function (c) { S.cards[c.getAttribute('data-c')] = c; });
    Array.prototype.forEach.call(S.lyr.querySelectorAll('.ln'), function (ln) {
      S.lines.push(ln);
      S.segEls.push(ln.querySelectorAll('.seg'));
    });
    S.onHide = function () { if (document.hidden && S) { if (S.listening) stopListen(); if (S.coach) S.coach.stop(); } };   // חוסך סוללה ופרטיות
    document.addEventListener('visibilitychange', S.onHide);

    var senLabel = function () { q('#p-sens').textContent = '🎚 ' + GK.SENS[S.set.sens].name; };
    var fullLabel = function () { q('#p-full').textContent = S.set.full ? '🥁 דפוס מלא' : '🥁 חופשי'; q('#p-full').classList.toggle('on', !!S.set.full); };
    senLabel(); fullLabel();

    // אירועים
    S.lyr.addEventListener('click', function (e) {
      var ln = e.target.closest ? e.target.closest('.ln') : null;
      if (ln) jumpToLine(parseInt(ln.getAttribute('data-i'), 10));
    });
    S.playBtn.addEventListener('click', function () { if (S.listening) stopListen(); else startListen(); });
    q('#p-more').addEventListener('click', function () { var t = q('#p-tools'); t.hidden = !t.hidden; q('#p-more').classList.toggle('on', !t.hidden); });
    q('#p-restart').addEventListener('click', function () {
      if (S.coach) S.coach.stop();
      S.matcher.reset(false); S.lastAdv = -1e9;
      setStep(0); GK.toast('מההתחלה');
    });
    q('#p-back').addEventListener('click', function () { setStep(Math.max(0, Math.min(S.idx, S.steps.length) - 1)); });
    q('#p-skip').addEventListener('click', function () { if (S.idx < S.steps.length) setStep(S.idx + 1); });
    q('#p-sens').addEventListener('click', function () {
      S.set.sens = (S.set.sens + 1) % GK.SENS.length;
      GK.store.setSetting('sens', S.set.sens);
      S.matcher.setSens(GK.SENS[S.set.sens]);
      GK.listen.setK(GK.SENS[S.set.sens].k);
      senLabel();
      GK.toast('רגישות: ' + GK.SENS[S.set.sens].name);
    });
    q('#p-hear').addEventListener('click', function () {
      if (S.listening) { GK.toast('עצור את ההקשבה כדי לשמוע את הפריטה'); return; }
      var on = S.coach.demo();
      q('#p-hear').textContent = on ? '⏹ עצור' : '🔊 שמע פריטה';
    });
    q('#p-vid').addEventListener('click', function () { toggleVideo(); });
    q('#p-full').addEventListener('click', function () {
      S.set.full = !S.set.full;
      GK.store.setSetting('full', S.set.full);
      fullLabel(); renderHits();
      GK.toast(S.set.full ? 'דפוס מלא: עוברים לאקורד הבא רק אחרי שמסיימים את כל הפריטות' : 'חופשי: עוברים ברגע שהאקורד נכון');
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

    if (steps.length) setStep(Math.min(prefs.step || 0, steps.length - 1));
    else setHint('אין אקורדים בשיר הזה', 'warn');
  }

  GK.ui.player = { open: open, close: close, isPlaying: function () { return !!(S && (S.listening || (S.coach && S.coach.isActive()))); } };
})();
