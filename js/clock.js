/*
 * מנוע התזמון: שעון AudioContext + תזמון קדימה (lookahead). ה-setInterval רק מזין את התור; הזמן עצמו נקבע על שעון האודיו.
 * מיקום מוזיקלי נמדד ביחידות beatUnit (u). u=0 = תחילת התיבה הראשונה של התרגול; הספירה המקדימה היא תיבה אחת לפניו (u<0).
 * שינוי BPM = עוגן חדש בשעון (anchor): המיקום רציף, ואירועים שכבר תוזמנו לא זזים — בלי דילוגים או כפילויות.
 * X (rest) לא משמיע כלום. הקריינות לא נכנסת לחישובי הזמן.
 * ctx = כל אובייקט עם currentTime (AudioContext, או מדומה בבדיקות). sink = {click(time, kind, accent), strum(time, action, accent)}.
 */
(function () {
  var GK = (window.GK = window.GK || {});
  var EPS = 1e-6;

  GK.createClock = function (opt) {
    var ctx = opt.ctx, sink = opt.sink || {}, LOOK = opt.lookahead || 0.12;
    var hooks = { onCount: opt.onCount || null, onEnd: opt.onEnd || null };
    var pattern = null, bpm = opt.bpm || 60, anchors = [], hist = [], pending = null;
    var running = false, started = false, timer = null, lastHorizon = 0, ended = false;
    var o = { countIn: true, loop: true, click: false, strumSound: false };
    var cur = { count: 0, click: 0, bar: 0, step: 0 };
    var clicks = [];                                              // זמני קליקים שתוזמנו לאחרונה (לשיפוט הקצב)

    function meter() { return GK.pat.meterOf(pattern); }
    function bpb() { return pattern.beatsPerBar; }
    function rate() { return (bpm * meter().pulse) / 60; }          // יחידות לשנייה
    function countPulses() { return Math.round(bpb() / meter().pulse); }

    function uAt(t) {
      var a = anchors[0], i;
      for (i = 0; i < anchors.length; i++) if (anchors[i].t <= t + EPS) a = anchors[i];
      return a.u + (t - a.t) * a.r;
    }
    function tAt(u) {
      var a = anchors[0], i;
      for (i = 0; i < anchors.length; i++) if (anchors[i].u <= u + EPS) a = anchors[i];
      return a.t + (u - a.u) / a.r;
    }
    function patternForBar(b) {
      var p = hist[0].pattern;
      for (var i = 0; i < hist.length; i++) if (hist[i].fromBar <= b) p = hist[i].pattern;
      return p;
    }

    function tick() {
      if (!running) return;
      var horizon = ctx.currentTime + LOOK, t;
      lastHorizon = horizon;
      // ספירה מקדימה
      while (o.countIn && cur.count < countPulses()) {
        t = tAt(-bpb() + cur.count * meter().pulse);
        if (t >= horizon) break;
        if (sink.click) sink.click(t, 'count', cur.count === 0);
        clicks.push(t);
        if (hooks.onCount) hooks.onCount(cur.count + 1, t, meter().countWords[cur.count] || String(cur.count + 1));
        cur.count++;
      }
      // קליק מטרונום בזמן התרגול (אופציונלי)
      while (o.click) {
        var u = cur.click * meter().pulse;
        if (!o.loop && u >= bpb() - EPS) break;
        t = tAt(u);
        if (t >= horizon) break;
        if (sink.click) sink.click(t, 'beat', cur.click % countPulses() === 0);
        clicks.push(t);
        cur.click++;
      }
      // צעדי הפריטה: רק ↓ ↑ M משמיעים; X שותק לגמרי
      while (true) {
        if (!o.loop && cur.bar >= 1) break;
        if (cur.step === 0 && pending) { hist.push({ fromBar: cur.bar, pattern: pending }); pattern = pending; pending = null; }
        var p = patternForBar(cur.bar), st = p.steps[cur.step];
        t = tAt(cur.bar * p.beatsPerBar + st.beat);
        if (t >= horizon) break;
        if (o.strumSound && st.action !== 'rest' && sink.strum) { sink.strum(t, st.action, st.accent); clicks.push(t); }   // גם צליל ההדגמה שלנו נרשם, כדי שהמיקרופון לא יתבלבל בינו לבין פריטה אמיתית
        cur.step++;
        if (cur.step >= p.steps.length) { cur.step = 0; cur.bar++; }
      }
      while (clicks.length > 16) clicks.shift();
      // סיום (מצב ללא לולאה: תיבה אחת)
      if (!o.loop && !ended && uAt(ctx.currentTime) >= bpb() - EPS) { ended = true; if (hooks.onEnd) hooks.onEnd(); }
    }

    var api = {
      /** מגדיר דפוס. בזמן ריצה — נכנס לתוקף בתחילת התיבה הבאה (באותו משקל בלבד) */
      setPattern: function (p) {
        var v = GK.pat.validate(p);
        if (!v.ok) throw new Error('דפוס לא תקין: ' + v.errors.join('; '));
        if (running && pattern && GK.pat.meterKey(p) !== GK.pat.meterKey(pattern)) throw new Error('אי אפשר להחליף משקל בזמן תרגול');
        if (running) { pending = p; return; }
        pattern = p; hist = [{ fromBar: 0, pattern: p }]; pending = null;
      },
      getPattern: function () { return pattern; },
      getBpm: function () { return bpm; },
      /** מחליף BPM בצורה מתוזמנת: העוגן החדש נכנס אחרי מה שכבר תוזמן, והמיקום ממשיך ברציפות */
      setBpm: function (b) {
        b = Math.max(30, Math.min(200, Math.round(b)));
        if (!pattern) { bpm = b; return bpm; }
        if (running) {
          var T = Math.max(lastHorizon, ctx.currentTime), u = uAt(T);
          bpm = b;
          anchors.push({ t: T, u: u, r: rate() });
        } else bpm = b;
        return bpm;
      },
      /** מתחיל: ספירה מקדימה (תיבה) ואז התרגול. מחזיר {startTime, playTime} בזמן ה-ctx */
      start: function (options) {
        if (!pattern) throw new Error('אין דפוס');
        options = options || {};
        ['countIn', 'loop', 'click', 'strumSound'].forEach(function (k) { if (options[k] !== undefined) o[k] = !!options[k]; });
        var T0 = ctx.currentTime + (options.delay === undefined ? 0.12 : options.delay);
        hist = [{ fromBar: 0, pattern: pattern }]; pending = null; ended = false; clicks.length = 0;
        anchors = [{ t: T0, u: o.countIn ? -bpb() : 0, r: rate() }];
        cur = { count: o.countIn ? 0 : countPulses(), click: 0, bar: 0, step: 0 };
        running = true; started = true;
        if (opt.autoTick !== false) { clearInterval(timer); timer = setInterval(tick, 25); }
        tick();
        return { startTime: T0, playTime: tAt(0) };
      },
      stop: function () { running = false; started = false; clearInterval(timer); timer = null; pending = null; },
      isRunning: function () { return running; },
      /** מצב נוכחי לשרטוט: {phase: idle|count|play|done, countBeat, bar, beatInBar, stepIndex, pulseIndex, u} */
      stateAt: function (t) {
        if (!started || !pattern) return { phase: 'idle' };
        var u = uAt(t);
        if (u < -EPS) return { phase: 'count', u: u, countBeat: Math.min(countPulses(), Math.floor((u + bpb() + EPS) / meter().pulse) + 1) };
        var bar = Math.floor(u / bpb() + EPS), p = patternForBar(bar), b = u - bar * bpb();
        return {
          phase: !o.loop && bar >= 1 ? 'done' : 'play', u: u, bar: bar, beatInBar: b,
          stepIndex: GK.pat.stepIndexAt(p, b), pulseIndex: Math.floor(b / meter().pulse + EPS), pattern: p
        };
      },
      uAt: uAt, tAt: tAt,
      /** זמן (ב-ctx) של צעד idx בתיבה bar */
      timeOfStep: function (bar, idx) { var p = patternForBar(bar); return tAt(bar * p.beatsPerBar + p.steps[idx].beat); },
      patternForBar: patternForBar,
      recentClicks: function () { return clicks.slice(); },
      tick: tick                                                    // לבדיקות (autoTick:false)
    };
    return api;
  };
})();
