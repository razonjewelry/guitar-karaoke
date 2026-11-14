/*
 * מנתח פריטות בזמן אמת (זרם דגימות רציף):
 *  1. גילוי התקפה = spectral flux: כל 8ms מחשבים ספקטרום קצר (512 דגימות) ומודדים כמה הוא *עלה* לעומת שני פריימים
 *     קודם, בכל התדרים יחד (עם פילטר מקסימום על התדרים השכנים). הדהוד יציב לא נספר; פריטה חדשה — כן, גם כשהיא חלשה
 *     וגם כשהאקורד הקודם עוד מצלצל. הספקטרום מנורמל לרצפת הרעש הנמדדת, ולכן הזיהוי לא תלוי בעוצמת המיקרופון.
 *  2. לכל התקפה: מחכים 30ms (עוברים את רעש הפריטה) ואז מנתחים חלון נקי של 4096 דגימות -> כרומה.
 *     ההחלטה לכל פריטה נעשית על החלון שאחריה, כך שהצליל שנחלש לא מפיל את הזיהוי.
 * טהור (בלי דפדפן): push(Float32Array) -> {onsets, analyses, level}.
 *
 * הסף לפריטה = הגבוה מבין: מינימום מוחלט, פי כמה מחציון ה-flux, חלק מהשיא בשנייה וחצי האחרונות
 * (כדי שזנב הדהוד אחרי פריטה חזקה לא ייספר), והבליטה הכי גדולה של "רעש" באותו חלון. בנוסף העלייה חייבת להימשך
 * לפחות שני פריימים (בליטת רעש היא פריים בודד). הערכים נבחרו מסריקה על גיטרה מסונתזת — ראה tests/run.js.
 */
(function () {
  var GK = (window.GK = window.GK || {});
  var LAG = 2, ABS_MIN = 4.8, REL = 2.6, CALIB = 25;
  var HIST = 192;                        // ~1.5s של היסטוריית flux (פריים כל 8ms)
  var SNR_C = 16;                        // רק צלילים בולטים מעל רצפת-הרעש*16 תורמים ל-flux
  var PEAK_FRAC = 0.2;                   // הסף לפחות חמישית מהשיא בחלון
  var SUSTAIN = 1.8;                     // flux של שני הפריימים הרצופים >= 1.8 * הסף
  var NOISE_K = 1.0, EXCL = 16;          // 16 פריימים (~130ms) אחרי פריטה לא נחשבים "רעש"

  function median(a) {
    var b = Array.prototype.slice.call(a).sort(function (x, y) { return x - y; });
    return b.length ? b[b.length >> 1] : 0;
  }

  /** opt: {sr, k} — k = רגישות הגילוי: 6 רגיל, נמוך = רגיש יותר, גבוה = פחות */
  GK.createStrumAnalyzer = function (opt) {
    var sr = opt.sr, K = opt.k || 6;
    var N = opt.N || (sr > 24000 ? 8192 : 4096);                       // חלון ניתוח האקורד
    var NF = sr > 24000 ? 1024 : 512;                                  // חלון גילוי ההתקפה (~32ms)
    var HOP = Math.round(0.008 * sr), SKIP = Math.round(0.03 * sr), REFRACT = Math.round(0.11 * sr);
    var SIZE = 1 << 15;
    while (SIZE < N + SKIP + NF + 8 * HOP + sr * 0.1) SIZE <<= 1;
    var ring = new Float32Array(SIZE), w = 0, sinceHop = 0;
    var hann = new Float64Array(NF), i0;
    for (i0 = 0; i0 < NF; i0++) hann[i0] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i0) / (NF - 1));
    var re = new Float64Array(NF), im = new Float64Array(NF), mag = new Float64Array(NF / 2);
    var Lh = [], FH = [], NH = [], G = 0, calib = 0, lastOn = -1e9, pending = [], skip = 0, cand = null;

    /** מעבד פריים ספקטרלי שנגמר ב-endIdx. מחזיר התקפה או null */
    function frame(endIdx) {
      var i, k;
      for (i = 0; i < NF; i++) { re[i] = ring[(endIdx - NF + i) % SIZE] * hann[i]; im[i] = 0; }
      GK.fft(re, im);
      for (k = 0; k < NF / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
      var med = median(mag.subarray(4));                               // רצפת הרעש: חציון הסלים
      if (calib < CALIB) { G += (med - G) / (calib + 1); calib++; } else G += 0.01 * (med - G);
      var g = Math.max(G, 1e-4) * SNR_C, L = new Float64Array(NF / 2), flux = 0;
      for (k = 0; k < NF / 2; k++) L[k] = Math.log(1 + mag[k] / g);     // רעש נדחס לאפס; רק צלילים בולטים מעליו נספרים
      if (Lh.length >= LAG) {
        var ref = Lh[Lh.length - LAG];
        for (k = 2; k < NF / 2 - 1; k++) {
          var d = L[k] - Math.max(ref[k - 1], ref[k], ref[k + 1]);
          if (d > 0) flux += d;
        }
      }
      Lh.push(L); if (Lh.length > LAG) Lh.shift();
      var scale = K / 6, onset = null;
      if (calib >= CALIB && FH.length >= 20) {
        var old = FH.slice(0, FH.length - 2), peak = 0, q, nmax = 0;
        for (q = 0; q < old.length; q++) if (old[q] > peak) peak = old[q];
        for (q = 0; q < NH.length; q++) if (!NH[q].ex && NH[q].f > nmax) nmax = NH[q].f;   // הבליטה הכי גדולה של "רעש" (בלי פריטות)
        var thr = Math.max(ABS_MIN, REL * median(old), PEAK_FRAC * peak, NOISE_K * nmax) * scale;
        if (cand) {                                                     // מועמד מהפריים הקודם: מאושר רק אם העלייה נמשכת
          if (cand.f + flux >= SUSTAIN * cand.thr) {
            lastOn = cand.end; skip = EXCL;
            onset = { idx: cand.idx, t: (cand.idx / sr) * 1000, strength: Math.max(cand.f, flux) };
          }
          cand = null;
        } else if (flux > thr && endIdx - lastOn >= REFRACT) {
          cand = { idx: endIdx - (NF >> 2), end: endIdx, f: flux, thr: thr };   // idx = בערך מקום ההתקפה בתוך החלון
        }
      }
      if (FH.length >= HIST) FH.shift();
      FH.push(flux);
      if (NH.length >= HIST) NH.shift();
      NH.push({ f: flux, ex: skip > 0 || cand !== null || onset !== null });   // פריימים של פריטה והמשכה לא נחשבים רעש
      if (skip > 0) skip--;
      return onset;
    }

    return {
      sr: sr,
      setK: function (k) { K = k; },
      /** מזין דגימות. מחזיר {onsets:[{idx,t,strength}], analyses:[{idx,t,strength,chroma}], level} */
      push: function (x) {
        var onsets = [], analyses = [], sum = 0, i, v;
        for (i = 0; i < x.length; i++) {
          v = x[i]; ring[w % SIZE] = v; sum += v * v; w++;
          if (++sinceHop === HOP) {
            sinceHop = 0;
            if (w >= NF) { var o = frame(w); if (o) { onsets.push(o); pending.push(o); } }
          }
        }
        while (pending.length && w >= pending[0].idx + SKIP + N) {       // חלון הניתוח של ההתקפה הושלם
          var p = pending.shift(), seg = new Float32Array(N), s0 = p.idx + SKIP;
          for (var j = 0; j < N; j++) seg[j] = ring[(s0 + j) % SIZE];
          analyses.push({ idx: p.idx, t: p.t, strength: p.strength, chroma: GK.chroma.fromSamples(seg, sr) });
        }
        return { onsets: onsets, analyses: analyses, level: Math.sqrt(sum / Math.max(1, x.length)) };
      }
    };
  };
})();
