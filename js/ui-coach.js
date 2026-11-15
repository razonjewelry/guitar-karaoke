/*
 * SmartStrummingCoach — רכיב התצוגה והבקרה של פריטת הגיטרה (משמש גם את "לימוד פריטה" וגם את "נגינת שיר").
 *  - שורת פריטה גדולה משמאל לימין: ↓ ↑ X (מנוחה) M (חסומה, רק אם הדפוס מגדיר) — הפעולה הפעילה מוארת לפי השעון
 *  - סדר: הסבר קולי באנגלית ← ספירה מקדימה ← נגינה (בלי דיבור בנגינה). הלוגיקה ב-session.js / clock.js.
 *  - מיקרופון: feedOnset() מקבל התקפות צליל ומשווה לתזמון (שיפוט קצב בלבד, לא כיוון).
 */
(function () {
  var GK = (window.GK = window.GK || {});
  GK.ui = GK.ui || {};
  var esc = GK.esc;
  var METERS = ['4/4', '3/4', '6/8', '2/4'];
  var SPEEDS = [40, 60, 80, 100];

  GK.ui.createCoach = function (host, o) {
    o = o || {};
    var outer = host; host = document.createElement('div'); outer.appendChild(host);   // מכל משלו: מאזיני הקליקים נעלמים יחד איתו
    host.className = 'm-' + (o.mode || 'song');
    var set = GK.store.practice(), meter = o.meter || '4/4', pats = [], pattern = null, sess = null, judge = null, raf = 0;
    var manual = -1, lastKey = '', dead = false;

    function patternList() {
      var l = GK.pat.forMeter(meter).slice();
      if (o.verified && GK.pat.meterKey(o.verified) === meter) l.unshift(o.verified);
      return l;
    }
    function pickInitial() {
      pats = patternList();
      var want = o.patternId, f = pats.filter(function (p) { return p.id === want; })[0];
      pattern = f || (o.verified && GK.pat.meterKey(o.verified) === meter ? o.verified : GK.pat.defaultFor(meter));
    }

    host.innerHTML =
      '<div class="coach">' +
      '<div class="co-meter" hidden></div>' +
      '<div class="co-pick"><select class="co-sel" aria-label="בחירת פריטה"></select><span class="co-badge"></span></div>' +
      '<div class="co-now" aria-live="polite"><b class="co-big">—</b><span class="co-sub"></span></div>' +
      '<div class="co-row" dir="ltr"></div>' +
      '<div class="co-cap"></div>' +
      '<div class="co-ctl">' +
      '<button class="co-go" data-a="go">▶ התחל</button>' +
      '<button class="btn" data-a="rep" title="חזרה על הפריטה">🔁</button>' +
      '<button class="btn" data-a="say" title="הסבר קולי">🗣 הסבר</button>' +
      (o.mode === 'learn' ? '<span class="pill" dir="ltr"><button data-a="prev">◀</button><span class="co-step">1</span><button data-a="next">▶</button></span>' : '') +
      '</div>' +
      '<div class="co-bpm"><span class="pill" dir="ltr"><button data-a="bm">−</button><span class="co-bv"></span><button data-a="bp">＋</button></span>' +
      '<span class="co-speeds"></span></div>' +
      '<details class="co-set"><summary>⚙ הגדרות תרגול</summary><div class="co-grid">' +
      '<label><input type="checkbox" data-k="speakBeforePlaying"> הסבר קולי באנגלית לפני הנגינה</label>' +
      '<label><input type="checkbox" data-k="countInEnabled"> ספירה מקדימה</label>' +
      '<label><input type="checkbox" data-k="loopEnabled"> חזרה בלולאה</label>' +
      '<label><input type="checkbox" data-k="click"> מטרונום</label>' +
      '<label><input type="checkbox" data-k="strumSound"> צליל פריטה להדגמה</label>' +
      '<label>מהירות הדיבור <input type="range" min="0.5" max="1.4" step="0.1" data-k="voiceRate"></label>' +
      '</div><div class="co-note">ב-X לא מושמע שום צליל. הקול נשמע רק לפני הנגינה.</div></details>' +
      '<div class="co-stat"></div></div>';
    var q = function (s) { return host.querySelector(s); };
    var el = { sel: q('.co-sel'), badge: q('.co-badge'), big: q('.co-big'), sub: q('.co-sub'), row: q('.co-row'), cap: q('.co-cap'), go: q('.co-go'), bv: q('.co-bv'), speeds: q('.co-speeds'), stat: q('.co-stat'), meter: q('.co-meter'), stepEl: q('.co-step') };

    // ───── משקל לא ידוע: מבקשים מהמשתמש לבחור ─────
    if (o.timeKnown === false) {
      el.meter.hidden = false;
      el.meter.innerHTML = '<span>משקל השיר לא ידוע. בחר משקל לתרגול:</span> ' + METERS.map(function (m) { return '<button class="btn tog' + (m === meter ? ' on' : '') + '" data-m="' + m + '">' + m + '</button>'; }).join('');
    }

    function sink() {
      return { click: function (t, k, a) { GK.sound.click(t, k, a); }, strum: function (t, a, acc) { GK.sound.strum(t, a, acc); } };
    }
    function ensureSession() {
      var ctx = GK.sound.ensure();
      if (!ctx) { GK.toast('הדפדפן לא תומך באודיו'); return null; }
      if (!sess) {
        sess = GK.createSession({
          ctx: ctx, settings: set, sink: sink(),
          hooks: {
            onPhase: onPhase,
            onCaption: function (t) { el.cap.textContent = '🗣 ' + t; },
            onCountWord: function (n, w) { el.big.textContent = n; el.sub.textContent = w; el.big.className = 'co-big cnt'; },
            onVoiceProblem: function (r) { GK.toast(r === 'unavailable' ? 'אין הקראה קולית במכשיר — ההסבר מוצג בכתב' : 'ההקראה נכשלה (' + r + ') — ההסבר מוצג בכתב'); }
          }
        });
        judge = GK.createRhythmJudge(sess.clock, { ignoreClicks: true, onEvent: onJudge });
      }
      sess.setPattern(pattern);
      return sess;
    }

    // ───── שרטוט ─────
    function rowHtml() {
      var tot = pattern.beatsPerBar;
      return pattern.steps.map(function (s, i) {
        return '<div class="co-cell a-' + s.action + (s.accent ? ' acc' : '') + '" data-i="' + i + '" style="flex:' + s.durationBeats / tot * 100 + ' 1 0">' +
          '<span class="sy">' + GK.pat.SYM[s.action] + '</span><span class="lb">' + GK.pat.beatLabel(pattern, s) + '</span></div>';
      }).join('');
    }
    function drawPattern() {
      el.row.innerHTML = rowHtml();
      el.badge.textContent = GK.pat.SOURCE_LABEL[pattern.source] || '';
      el.badge.className = 'co-badge s-' + pattern.source;
      el.cap.textContent = '🗣 ' + GK.pat.speechText(pattern);
      el.sel.innerHTML = pats.map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === pattern.id ? ' selected' : '') + '>' + (p.source === 'verified' ? '★ ' : '') + esc(p.name) + ' — ' + GK.pat.symbolText(p) + '</option>';
      }).join('');
      lastKey = '';
      idleNow();
    }
    function idleNow() {
      var i = manual >= 0 ? manual : -1;
      if (i >= 0) showAction(pattern.steps[i]); else { el.big.textContent = GK.pat.symbolText(pattern); el.big.className = 'co-big sm'; el.sub.textContent = ''; }
    }
    function showAction(s) {
      var rest = s.action === 'rest';
      el.big.textContent = GK.pat.SYM[s.action];
      el.big.className = 'co-big a-' + s.action;
      el.sub.textContent = GK.pat.WORD[s.action] + ' · ' + GK.pat.HE[s.action];
    }
    function paint(i, cls) {
      var cells = el.row.children;
      for (var k = 0; k < cells.length; k++) {
        cells[k].classList.toggle('on', k === i);
        if (cls !== undefined) cells[k].classList.toggle('manual', cls && k === i);
      }
    }
    function frame() {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      if (!sess || !sess.isActive() || !GK.sound.ctx()) return;
      var st = sess.clock.stateAt(GK.sound.now());
      if (st.phase === 'count') { paint(-1); }
      else if (st.phase === 'play') {
        if (st.pattern !== pattern && st.pattern && st.pattern.id !== pattern.id) { /* תיבה עם דפוס חדש */ pattern = st.pattern; drawPattern(); }
        var key = st.bar + ':' + st.stepIndex;
        if (key !== lastKey) { lastKey = key; paint(st.stepIndex); showAction(pattern.steps[st.stepIndex]); }
        judge.tick(GK.sound.now());
      }
    }
    function onPhase(p) {
      var on = p !== 'idle';
      el.go.textContent = on ? '⏹ עצור' : '▶ התחל';
      el.go.classList.toggle('on', on);
      el.sel.disabled = false;
      host.classList.toggle('is-' + 'explain', p === 'explain');
      host.classList.toggle('is-count', p === 'count');
      host.classList.toggle('is-play', p === 'play');
      if (p === 'explain') { el.big.textContent = '🗣'; el.big.className = 'co-big'; el.sub.textContent = 'מקשיבים להסבר…'; paint(-1); }
      if (p === 'idle') { paint(-1); lastKey = ''; idleNow(); }
      if (o.onPhase) o.onPhase(p);
    }
    function onJudge(e) {
      var s = judge.stats;
      el.stat.textContent = 'תזמון (לפי צליל, לא כיוון): ✓ ' + s.hit + ' · מוקדם ' + s.early + ' · מאוחר ' + s.late + ' · פספוס ' + s.missed;
      var i = e.idx, c = el.row.children[i];
      if (c && e.type !== 'extra') { c.classList.remove('h-hit', 'h-early', 'h-late', 'h-missed'); c.classList.add('h-' + e.type); }
    }

    // ───── פעולות ─────
    function setBpm(b) {
      set.bpm = Math.max(30, Math.min(200, Math.round(b)));
      if (sess) sess.setBpm(set.bpm);
      GK.store.setPractice('bpm', set.bpm);
      el.bv.textContent = set.bpm + ' BPM';
      Array.prototype.forEach.call(el.speeds.children, function (b2) { b2.classList.toggle('on', +b2.getAttribute('data-b') === set.bpm); });
    }
    function setPattern(id) {
      var p = pats.filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      pattern = p; manual = -1;
      if (sess) { try { sess.setPattern(p); } catch (e) { GK.toast(e.message); } }
      if (sess && sess.isActive() && sess.phase() === 'play') { el.cap.textContent = '🗣 ' + GK.pat.speechText(p) + ' (תיכנס בתחילת התיבה הבאה)'; el.badge.textContent = GK.pat.SOURCE_LABEL[p.source]; el.badge.className = 'co-badge s-' + p.source; }
      else drawPattern();
      if (o.onPattern) o.onPattern(p);
    }
    function start() {
      var s = ensureSession(); if (!s) return;
      manual = -1; judge.reset(); el.stat.textContent = '';
      Array.prototype.forEach.call(el.row.children, function (c) { c.classList.remove('h-hit', 'h-early', 'h-late', 'h-missed'); });
      s.start();
    }
    function stop() { if (sess) sess.stop(); }

    host.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-a],[data-m],[data-b],.co-cell') : null;
      if (!t) return;
      var a = t.getAttribute('data-a');
      if (t.hasAttribute('data-m')) {
        if (sess && sess.isActive()) { GK.toast('עצור כדי להחליף משקל'); return; }
        meter = t.getAttribute('data-m');
        Array.prototype.forEach.call(el.meter.querySelectorAll('button'), function (b) { b.classList.toggle('on', b === t); });
        sess = null; judge = null; pats = patternList(); pattern = GK.pat.defaultFor(meter); manual = -1; drawPattern();
        if (o.onMeter) o.onMeter(meter);
        return;
      }
      if (t.classList.contains('co-cell')) { if (!(sess && sess.isActive())) { manual = +t.getAttribute('data-i'); paint(manual, true); showAction(pattern.steps[manual]); el.stepEl && (el.stepEl.textContent = manual + 1); } return; }
      if (a === 'go') { if (sess && sess.isActive()) stop(); else start(); }
      else if (a === 'rep') { var s = ensureSession(); if (s) { manual = -1; judge.reset(); s.repeat(); } }
      else if (a === 'say') {
        if (sess && sess.isActive()) { GK.toast('ההסבר הקולי נשמע רק כשלא מנגנים'); return; }
        var s2 = ensureSession(); if (s2) s2.explain();
      }
      else if (a === 'bm') setBpm(set.bpm - 5);
      else if (a === 'bp') setBpm(set.bpm + 5);
      else if (a === 'prev' || a === 'next') {
        if (sess && sess.isActive()) return;
        var n = pattern.steps.length; manual = manual < 0 ? 0 : (manual + (a === 'next' ? 1 : n - 1)) % n;
        paint(manual, true); showAction(pattern.steps[manual]); if (el.stepEl) el.stepEl.textContent = manual + 1;
        if (set.speakBeforePlaying && GK.voice.available()) GK.voice.say(GK.pat.WORD[pattern.steps[manual].action], { rate: set.voiceRate });
      }
      else if (t.hasAttribute('data-b')) setBpm(+t.getAttribute('data-b'));
    });
    el.speeds.innerHTML = SPEEDS.map(function (b) { return '<button class="btn tog" data-b="' + b + '">' + b + '</button>'; }).join('');
    el.sel.addEventListener('change', function () { setPattern(el.sel.value); });
    Array.prototype.forEach.call(host.querySelectorAll('[data-k]'), function (inp) {
      var k = inp.getAttribute('data-k');
      if (inp.type === 'checkbox') inp.checked = !!set[k]; else inp.value = set[k];
      inp.addEventListener('change', function () {
        set[k] = inp.type === 'checkbox' ? inp.checked : parseFloat(inp.value);
        GK.store.setPractice(k, set[k]);
      });
    });

    pickInitial(); drawPattern(); setBpm(set.bpm);
    raf = requestAnimationFrame(frame);

    return {
      el: host,
      getPattern: function () { return pattern; },
      getMeter: function () { return meter; },
      isActive: function () { return !!(sess && sess.isActive()); },
      phase: function () { return sess ? sess.phase() : 'idle'; },
      /** האם התוצאות מהמיקרופון צריכות להתעלם (בזמן הסבר קולי / ספירה מקדימה) */
      gated: function () { var p = sess ? sess.phase() : 'idle'; return p === 'explain' || p === 'count'; },
      /** התקפת צליל בזמן ctx של הצליל; מחזיר את תוצאת השיפוט (או null) */
      feedOnset: function (tCtx) { return sess && judge && sess.phase() === 'play' ? judge.onset(tCtx) : null; },
      stop: stop,
      destroy: function () { dead = true; cancelAnimationFrame(raf); if (sess) sess.stop(); if (host.parentNode) host.parentNode.removeChild(host); }
    };
  };
})();
