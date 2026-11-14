/*
 * מנוע זמן מוזיקלי ל"נגן אתה": שורה אחר שורה, כל שורה = bars תיבות.
 * הזמן נמדד ברבעים (q) ומתורגם לשניות לפי bpm ומהירות. המטרונום מתוזמן קדימה ב-WebAudio.
 * התיבה הראשונה לפני השיר = ספירה לאחור (count-in).
 */
(function () {
  var GK = (window.GK = window.GK || {});

  GK.createEngine = function (song) {
    var qs = [], lens = [], total = 0, last = null;
    song.lines.forEach(function (l) {
      qs.push(total);
      var n = l.bars * song.q;
      lens.push(n);
      total += n;
      l.startChord = last;                       // האקורד שנשאר מהשורה הקודמת
      l.segs.forEach(function (s) { if (s.c) last = s.c; });
    });

    var speed = 1, metro = true, running = false;
    var t0 = 0, q0 = 0, countEnd = 0, nextSlot = 0, timer = null;

    function qSec() { return 60 / (song.bpm * speed); }
    function qAt(t) { return q0 + (t - t0) / qSec(); }
    function slotTime(g) { return t0 + (g / 2 - q0) * qSec(); }   // g = אינדקס שמינית גלובלי
    function lineAt(q) {
      var lo = 0, hi = qs.length - 1, r = 0;
      while (lo <= hi) { var m = (lo + hi) >> 1; if (qs[m] <= q) { r = m; lo = m + 1; } else hi = m - 1; }
      return r;
    }

    /** מתזמן לחיצות מטרונום 150ms קדימה */
    function tick() {
      var ctx = GK.audio.ensure();
      if (!ctx || !running) return;
      var horizon = ctx.currentTime + 0.15;
      while (slotTime(nextSlot) < horizon) {
        var inBar = ((nextSlot % song.slots) + song.slots) % song.slots;
        if (metro && song.acc.indexOf(inBar) >= 0) GK.audio.click(slotTime(nextSlot), inBar === 0);
        nextSlot++;
      }
    }

    return {
      total: total,
      /** מתחיל מהשורה li אחרי תיבת ספירה. מחזיר false אם אין אודיו. */
      start: function (li) {
        var ctx = GK.audio.ensure();
        if (!ctx) return false;
        var startQ = qs[li || 0] || 0;
        q0 = startQ - song.q;
        countEnd = startQ;
        t0 = ctx.currentTime + 0.12;
        nextSlot = Math.ceil(q0 * 2);
        running = true;
        clearInterval(timer);
        timer = setInterval(tick, 25);
        tick();
        return true;
      },
      pause: function () { running = false; clearInterval(timer); timer = null; },
      setMetro: function (b) { metro = !!b; },
      setSpeed: function (x) {
        if (running) {                              // עיגון מחדש כדי שהמיקום לא יקפוץ
          var now = GK.audio.now(), q = qAt(now);
          t0 = now; q0 = q; speed = x; nextSlot = Math.ceil(q * 2);
        } else speed = x;
      },
      /** מצב נוכחי לשרטוט */
      state: function () {
        if (!running) return { running: false };
        var q = qAt(GK.audio.now());
        if (q >= total) return { running: true, done: true };
        var counting = q < countEnd;
        var li = counting ? -1 : lineAt(q);
        var frac = counting ? 0 : Math.min(1, Math.max(0, (q - qs[li]) / lens[li]));
        var g = Math.floor(q * 2);
        return {
          running: true, done: false, counting: counting,
          countBeat: counting ? Math.min(song.q, Math.floor(q - q0) + 1) : 0,
          line: li, frac: frac, slot: ((g % song.slots) + song.slots) % song.slots
        };
      },
      /** האקורד הפעיל בשורה li ובמיקום יחסי frac */
      chordAt: function (li, frac) {
        var line = song.lines[li], c = line.startChord;
        for (var k = 0; k < line.segs.length; k++) {
          var s = line.segs[k];
          if (s.c && s.f0 <= frac + 1e-4) c = s.c;
        }
        return c;
      }
    };
  };
})();
