/* מסך הנגן: מילים עם אקורדים מעליהן, פס פריטה, דיאגרמות, ו"נגן אתה" (גלילה והדגשה בקצב) */
(function () {
  var GK = (window.GK = window.GK || {});
  GK.ui = GK.ui || {};
  var esc = GK.esc;
  var ARROW = { D: '↓', U: '↑', X: '×', '-': '·' };
  var S = null;                                   // הסשן הנוכחי

  function strumMini(arr) { return arr.map(function (a) { return '<span>' + ARROW[a] + '</span>'; }).join(''); }

  function segHtml(s) {
    var words = s.parts.map(function (p) {
      return p.w ? '<span class="w" data-f="' + p.f0.toFixed(3) + '">' + esc(p.t) + '</span>' : esc(p.t);
    }).join('');
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
  function setSlot(i) {
    if (S.slotOn === i) return;
    if (S.slots[S.slotOn]) S.slots[S.slotOn].classList.remove('on');
    if (S.slots[i]) S.slots[i].classList.add('on');
    S.slotOn = i;
  }
  function setChord(c) {
    if (c === S.curChord) return;
    if (S.curChord && S.cards[S.curChord]) S.cards[S.curChord].classList.remove('on');
    if (c && S.cards[c]) {
      var el = S.cards[c];
      el.classList.add('on');
      S.bar.scrollTo({ left: el.offsetLeft - S.bar.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
    }
    S.curChord = c;
  }
  function clearWords(i) {
    S.words[i].forEach(function (w) { w.el.classList.remove('sung'); });
  }
  function clearHighlights() {
    for (var i = 0; i < S.lines.length; i++) { S.lines[i].classList.remove('cur', 'past'); clearWords(i); }
    if (S.actSeg) { S.actSeg.classList.remove('act'); S.actSeg = null; }
    S.lastLine = -2; S.wp = 0;
  }
  function setLine(L) {
    var prev = S.lastLine;
    if (prev >= 0 && S.lines[prev]) { S.lines[prev].classList.remove('cur'); clearWords(prev); }
    for (var i = 0; i < S.lines.length; i++) S.lines[i].classList.toggle('past', i < L);
    S.lines[L].classList.add('cur');
    clearWords(L);
    S.wp = 0; S.lastLine = L; S.resume = L;
    setStrip(S.song.lines[L].strum);
    S.lyr.scrollTo({ top: Math.max(0, S.lines[L].offsetTop - S.lyr.clientHeight * 0.28), behavior: 'smooth' });
  }
  function updateWords(frac) {
    var arr = S.words[S.lastLine];
    while (S.wp < arr.length && arr[S.wp].f <= frac) { arr[S.wp].el.classList.add('sung'); S.wp++; }
  }
  function markChord(L, frac) {
    var line = S.song.lines[L], idx = -1;
    for (var k = 0; k < line.segs.length; k++) if (line.segs[k].c && line.segs[k].f0 <= frac + 1e-4) idx = k;
    var el = idx >= 0 ? S.segEls[L][idx] : null;
    if (el !== S.actSeg) {
      if (S.actSeg) S.actSeg.classList.remove('act');
      if (el) el.classList.add('act');
      S.actSeg = el;
    }
    setChord(S.eng.chordAt(L, frac));
  }
  function showCount(n) { S.count.hidden = false; S.count.innerHTML = '<b>' + n + '</b>'; }
  function hideCount() { S.count.hidden = true; }
  function setPlayUi(on) {
    S.playBtn.textContent = on ? '⏸ עצור' : '▶ נגן';
    S.playBtn.classList.toggle('on', on);
  }

  // ───── נגינה ─────
  function frame() {
    if (!S) return;
    var st = S.eng.state();
    if (!st.running) { S.raf = 0; return; }
    if (st.done) { stopPlay(); GK.toast('סוף השיר 🎸'); return; }
    if (st.counting) {
      showCount(st.countBeat);
      if (S.lastLine !== S.resume) setLine(S.resume);
      setSlot(st.slot);
    } else {
      hideCount();
      if (st.line !== S.lastLine) setLine(st.line);
      updateWords(st.frac);
      markChord(st.line, st.frac);
      setSlot(st.slot);
    }
    S.raf = requestAnimationFrame(frame);
  }
  function startFrom(i) {
    if (!S.eng.start(i)) { GK.toast('אין תמיכה באודיו בדפדפן הזה'); return; }
    S.playing = true; S.resume = i; S.lastLine = -2;
    setPlayUi(true);
    if (!S.raf) S.raf = requestAnimationFrame(frame);
  }
  function stopPlay() {
    S.eng.pause();
    S.playing = false;
    setPlayUi(false);
    hideCount();
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
    clearHighlights();
    setChord(null);
    setSlot(-1);
  }

  function close() {
    if (!S) return;
    if (S.raf) cancelAnimationFrame(S.raf);
    S.eng.pause();
    S.root.innerHTML = '';
    S = null;
  }

  function open(song) {
    close();
    var root = document.getElementById('v-player');
    var set = GK.store.settings();
    var eng = GK.createEngine(song);
    eng.setSpeed(set.speed);
    eng.setMetro(set.metro);
    var first = song.lines[0] ? song.lines[0].strum : ['-'];
    var meta = '<bdi>' + Math.round(song.bpm) + ' BPM</bdi> · <bdi>' + song.time + '</bdi>' +
      (song.capo ? ' · קאפו ' + song.capo : '') + (song.artist ? ' · ' + esc(song.artist) : '');

    root.innerHTML =
      '<header class="p-top"><a class="btn icon" href="#/" aria-label="חזרה">→</a>' +
      '<div class="p-title"><h1>' + esc(song.title) + '</h1><small>' + meta + '</small></div>' +
      '<button class="btn" id="p-edit">' + (song.builtin ? '✎ עותק לעריכה' : '✎ עריכה') + '</button></header>' +
      '<div class="chordbar" id="p-chords">' + song.chords.map(function (c) {
        return '<div class="cc" data-c="' + esc(c) + '">' + GK.chordSvg(c) + '<span>' + esc(c) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="strumbar"><span class="lab">פריטה</span><div class="slots" id="p-slots">' + stripHtml(song, first) + '</div></div>' +
      '<div class="lwrap"><div class="lyrics" id="p-lyrics">' + lyricsHtml(song) + '</div><div class="count" id="p-count" hidden></div></div>' +
      '<footer class="dock"><button class="play" id="p-play">▶ נגן</button>' +
      '<div class="pill"><button id="p-slow" aria-label="האט">−</button><span id="p-speed">' + Math.round(set.speed * 100) + '%</span><button id="p-fast" aria-label="האץ">+</button></div>' +
      '<button class="btn tog' + (set.metro ? ' on' : '') + '" id="p-metro" aria-label="מטרונום">🔔</button>' +
      '<button class="btn tog" id="p-font" aria-label="גודל גופן">Aa</button></footer>';
    root.style.setProperty('--fs', set.fontPx + 'px');

    var q = function (sel) { return root.querySelector(sel); };
    S = {
      song: song, eng: eng, root: root, set: set, lyr: q('#p-lyrics'), bar: q('#p-chords'), count: q('#p-count'),
      playBtn: q('#p-play'), slots: root.querySelectorAll('#p-slots .slot'), cards: {},
      lines: [], words: [], segEls: [], raf: 0, idleRaf: 0, playing: false,
      lastLine: -2, resume: 0, wp: 0, curChord: null, actSeg: null, patKey: first.join(''), slotOn: -1
    };
    Array.prototype.forEach.call(root.querySelectorAll('.cc'), function (c) { S.cards[c.getAttribute('data-c')] = c; });
    Array.prototype.forEach.call(S.lyr.querySelectorAll('.ln'), function (ln) {
      S.lines.push(ln);
      S.segEls.push(ln.querySelectorAll('.seg'));
      S.words.push(Array.prototype.map.call(ln.querySelectorAll('.w'), function (w) { return { el: w, f: parseFloat(w.getAttribute('data-f')) }; }));
    });

    // אירועים
    S.lyr.addEventListener('click', function (e) {
      var ln = e.target.closest ? e.target.closest('.ln') : null;
      if (ln) startFrom(parseInt(ln.getAttribute('data-i'), 10));
    });
    S.lyr.addEventListener('scroll', function () {            // כשלא מנגנים: הפס מראה את דפוס הקטע שבמסך
      if (S.playing || S.idleRaf) return;
      S.idleRaf = requestAnimationFrame(function () {
        S.idleRaf = 0;
        if (!S) return;
        var top = S.lyr.scrollTop + 40, idx = 0;
        for (var i = 0; i < S.lines.length; i++) { if (S.lines[i].offsetTop + S.lines[i].offsetHeight > top) { idx = i; break; } }
        setStrip(S.song.lines[idx].strum);
      });
    }, { passive: true });
    S.playBtn.addEventListener('click', function () { if (S.playing) stopPlay(); else startFrom(S.resume || 0); });
    var sp = function (d) {
      var v = Math.max(0.5, Math.min(1.5, Math.round((S.set.speed + d) * 10) / 10));
      S.set.speed = v; GK.store.setSetting('speed', v); S.eng.setSpeed(v);
      q('#p-speed').textContent = Math.round(v * 100) + '%';
    };
    q('#p-slow').addEventListener('click', function () { sp(-0.1); });
    q('#p-fast').addEventListener('click', function () { sp(0.1); });
    q('#p-metro').addEventListener('click', function (e) {
      S.set.metro = !S.set.metro; GK.store.setSetting('metro', S.set.metro);
      S.eng.setMetro(S.set.metro); e.currentTarget.classList.toggle('on', S.set.metro);
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
  }

  GK.ui.player = { open: open, close: close, isPlaying: function () { return !!(S && S.playing); } };
})();
