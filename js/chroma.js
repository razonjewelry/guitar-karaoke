/*
 * זיהוי אקורד מצליל: כרומה (12 מחלקות-גובה) מפסגות הספקטרום + השוואה לתבניות אקורד.
 *  - fromSamples: חלון בלקמן -> FFT -> פסגות עם אינטרפולציה פרבולית (תדר מדויק, לא רק מרכז הסל)
 *  - קיזוז כוונון אוטומטי: גיטרה שלא מכוונת ל-440 לא "מגלישה" תווים למחלקה השכנה
 *  - הסרת רצפת רעש (חציון הספקטרום): רק צלילים שבולטים מעליה נספרים
 * פונקציות טהורות (בלי דפדפן) כדי שאפשר לבדוק אותן ב-Node.
 */
(function () {
  var GK = (window.GK = window.GK || {});
  var MIN_F = 70, MAX_F = 1200, NOISE_K = 1.15, MAX_OFFSET = 0.35;
  var ROOT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  // איכויות: [מרווח בחצאי-טונים, משקל]. שורש 1.0, טרצה 0.8, קווינטה 0.9, ספטימה 0.7
  var QUALITY = {
    '': [[0, 1], [4, 0.8], [7, 0.9]],
    m: [[0, 1], [3, 0.8], [7, 0.9]],
    '7': [[0, 1], [4, 0.8], [7, 0.9], [10, 0.7]],
    m7: [[0, 1], [3, 0.8], [7, 0.9], [10, 0.7]],
    maj7: [[0, 1], [4, 0.8], [7, 0.9], [11, 0.7]],
    sus4: [[0, 1], [5, 0.8], [7, 0.9]]
  };
  var cache = {};
  var mod12 = function (x) { return ((x % 12) + 12) % 12; };

  /** "Am7" -> {root, q} ; אקורד עם בס (Am/E) נחשב לפי האקורד בלבד. null אם לא מוכר. */
  function parseChord(name) {
    var m = String(name).replace(/\/.*$/, '').match(/^([A-G])([#b]?)(.*)$/);
    if (!m || !QUALITY[m[3]]) return null;
    var root = ROOT[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return { root: mod12(root), q: QUALITY[m[3]] };
  }

  /** וקטור תבנית מנורמל (12) לאקורד, או null */
  function template(name) {
    if (cache[name] !== undefined) return cache[name];
    var p = parseChord(name), t = null;
    if (p) {
      var v = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      p.q.forEach(function (x) { v[(p.root + x[0]) % 12] = x[1]; });
      var n = Math.sqrt(v.reduce(function (a, b) { return a + b * b; }, 0));
      t = v.map(function (x) { return x / n; });
    }
    cache[name] = t;
    return t;
  }

  /** mag = משרעות ליניאריות (N/2 ערכים), sr = קצב דגימה, N = גודל FFT. מחזיר chroma[12]. */
  function fromMag(mag, sr, N) {
    var chroma = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var k0 = Math.max(2, Math.ceil((MIN_F * N) / sr)), k1 = Math.min(N / 2 - 2, Math.floor((MAX_F * N) / sr));
    var lg = new Float64Array(k1 + 2), k, band = [];
    for (k = k0 - 1; k <= k1 + 1; k++) lg[k] = Math.log(1 + mag[k]);   // לוג: בס חזק לא "בולע" את השאר
    for (k = k0; k <= k1; k++) band.push(lg[k]);
    band.sort(function (a, b) { return a - b; });
    var floor = band[band.length >> 1] * NOISE_K;
    var peaks = [];
    for (k = k0; k <= k1; k++) {
      var a = lg[k - 1], b = lg[k], c = lg[k + 1];
      if (b > a && b >= c && b > floor) {
        var d = (0.5 * (a - c)) / (a - 2 * b + c);                    // אינטרפולציה פרבולית של הפסגה
        if (!isFinite(d) || Math.abs(d) > 0.5) d = 0;
        var f = ((k + d) * sr) / N;
        peaks.push({ m: 69 + 12 * Math.log2(f / 440), w: b - 0.25 * (a - c) * d - floor });
      }
    }
    // קיזוז כוונון: ממוצע מעגלי של הסטייה מרשת החצאי-טונים, ממושקל בעוצמה
    var zx = 0, zy = 0, tot = 0;
    peaks.forEach(function (p) {
      var fr = p.m - Math.round(p.m), ww = p.w * p.w;
      zx += ww * Math.cos(2 * Math.PI * fr); zy += ww * Math.sin(2 * Math.PI * fr); tot += ww;
    });
    var off = 0;
    if (tot > 0 && Math.hypot(zx, zy) / tot > 0.5) off = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, Math.atan2(zy, zx) / (2 * Math.PI)));
    peaks.forEach(function (p) {
      var m = p.m - off, lo = Math.floor(m), fr = m - lo;
      chroma[mod12(lo)] += p.w * (1 - fr);
      chroma[mod12(lo + 1)] += p.w * fr;
    });
    return chroma;
  }

  /** x = Float32Array/Float64Array באורך חזקת 2 (למשל 4096). מחזיר chroma[12]. */
  function fromSamples(x, sr) {
    var N = x.length, re = new Float64Array(N), im = new Float64Array(N), w = GK.blackman(N), i;
    for (i = 0; i < N; i++) re[i] = x[i] * w[i];
    GK.fft(re, im);
    var mag = new Array(N / 2);
    for (i = 0; i < N / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
    return fromMag(mag, sr, N);
  }

  /** מחזיר {best, score, second, scores}: האקורד הכי דומה מבין names ודמיון הקוסינוס שלו */
  function match(chroma, names) {
    var nc = 0, i;
    for (i = 0; i < 12; i++) nc += chroma[i] * chroma[i];
    nc = Math.sqrt(nc);
    var out = { best: null, score: 0, second: 0, scores: {} };
    if (!nc) return out;
    names.forEach(function (name) {
      var t = template(name);
      if (!t) return;
      var d = 0;
      for (var j = 0; j < 12; j++) d += chroma[j] * t[j];
      var s = d / nc;
      out.scores[name] = s;
      if (s > out.score) { out.second = out.score; out.score = s; out.best = name; }
      else if (s > out.second) out.second = s;
    });
    return out;
  }

  GK.chroma = { parseChord: parseChord, template: template, fromMag: fromMag, fromSamples: fromSamples, match: match };
})();
