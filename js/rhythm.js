/*
 * שיפוט קצב: האם בוצעה פריטה בזמן המתאים, לפי התקפות הצליל שהגלאי הקיים מדווח עליהן (strum.js).
 *  - זה שיפוט של *תזמון* בלבד. כיוון הפריטה (↓↑) לא מאומת: ממיקרופון אי אפשר לדעת אם פרטו למעלה או למטה.
 *  - לא מענישים: צליל נוסף בזמן X או רעש רקע/הדהוד של פריטה קודמת הם "extra" ניטרלי; פספוס הוא "missed" מידעי.
 *  - התקפות קרובות ל-click המטרונום (דליפה מהרמקול) מתעלמים מהן.
 */
(function () {
  var GK = (window.GK = window.GK || {});

  /** clock = GK.createClock; opt.onEvent({type: hit|early|late|missed|extra, bar, idx, deltaMs}) */
  GK.createRhythmJudge = function (clock, opt) {
    opt = opt || {};
    var onEvent = opt.onEvent || function () {};
    var stats = { hit: 0, early: 0, late: 0, missed: 0, extra: 0 };
    var matched = {}, done = {}, lastExpected = -9;

    function key(bar, i) { return bar + ':' + i; }
    function emit(type, bar, idx, deltaMs) { stats[type]++; onEvent({ type: type, bar: bar, idx: idx, deltaMs: deltaMs }); }

    /** סובלנות לפי הרווח הקטן ביותר בין שתי פריטות רצופות בקצב הנוכחי */
    function tolerance() {
      var p = clock.getPattern(), sec = 60 / (clock.getBpm() * GK.pat.meterOf(p).pulse), min = 9, last = null;
      p.steps.forEach(function (s) { if (s.action === 'rest') return; if (last !== null) min = Math.min(min, (s.beat - last) * sec); last = s.beat; });
      if (min === 9) min = p.beatsPerBar * sec;
      return Math.max(0.08, Math.min(0.2, 0.4 * min));
    }

    /** כל צעדי הפריטה (לא מנוחה) סביב זמן t */
    function around(t) {
      var u = clock.uAt(t), bar0 = Math.floor(u / clock.getPattern().beatsPerBar) - 1, out = [];
      for (var bar = Math.max(0, bar0); bar <= bar0 + 3; bar++) {
        var p = clock.patternForBar(bar);
        p.steps.forEach(function (s, i) { out.push({ bar: bar, idx: i, step: s, t: clock.timeOfStep(bar, i) }); });
      }
      return out;
    }

    return {
      stats: stats,
      /** התקפת צליל בזמן t (ב-ctx). */
      onset: function (t) {
        var tol = tolerance(), cs = clock.recentClicks(), i;
        if (opt.ignoreClicks) for (i = 0; i < cs.length; i++) if (Math.abs(cs[i] - t) < 0.07) return null;
        var best = null, restHit = null, all = around(t);
        all.forEach(function (e) {
          var d = t - e.t;
          if (e.step.action === 'rest') { if (Math.abs(d) <= tol && (!restHit || Math.abs(d) < Math.abs(restHit.d))) restHit = { e: e, d: d }; return; }
          if (matched[key(e.bar, e.idx)] || Math.abs(d) > tol) return;
          if (!best || Math.abs(d) < Math.abs(best.d)) best = { e: e, d: d };
        });
        if (best) {
          matched[key(best.e.bar, best.e.idx)] = true;
          lastExpected = best.e.t;
          var ms = Math.round(best.d * 1000), c = Math.abs(best.d) <= 0.6 * tol ? 'hit' : best.d < 0 ? 'early' : 'late';
          emit(c, best.e.bar, best.e.idx, ms);
          return { type: c, deltaMs: ms, bar: best.e.bar, idx: best.e.idx };
        }
        // צליל נוסף: רק אם הוא נופל בחלון של מנוחה (X) ולא סמוך להדהוד של פריטה שציפינו לה. ניטרלי, בלי ענישה.
        if (restHit && t - lastExpected > 0.3) {
          emit('extra', restHit.e.bar, restHit.e.idx, Math.round(restHit.d * 1000));
          return { type: 'extra', deltaMs: Math.round(restHit.d * 1000), bar: restHit.e.bar, idx: restHit.e.idx };
        }
        return null;
      },
      /** מעבר זמן: פריטות שהיו צפויות ולא זוהו מסומנות missed (מידעי) */
      tick: function (t) {
        var tol = tolerance();
        around(t).forEach(function (e) {
          var k = key(e.bar, e.idx);
          if (e.step.action === 'rest' || matched[k] || done[k]) return;
          if (t > e.t + tol + 0.05) { done[k] = true; emit('missed', e.bar, e.idx, 0); }
        });
      },
      reset: function () { matched = {}; done = {}; lastExpected = -9; for (var k in stats) stats[k] = 0; }
    };
  };
})();
