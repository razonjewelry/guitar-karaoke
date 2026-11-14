/*
 * זיהוי אקורד מספקטרום: כרומה (12 מחלקות-גובה) + השוואה לתבניות של אקורדים.
 * פונקציות טהורות (בלי דפדפן) כדי שאפשר לבדוק אותן ב-Node.
 */
(function () {
  var GK = (window.GK = window.GK || {});
  var MIN_F = 70, MAX_F = 1200, NOISE_K = 1.15;
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

  /** "Am7" -> {root, q} ; אקורד עם בס (Am/E) נחשב לפי האקורד בלבד. null אם לא מוכר. */
  function parseChord(name) {
    var m = String(name).replace(/\/.*$/, '').match(/^([A-G])([#b]?)(.*)$/);
    if (!m || !QUALITY[m[3]]) return null;
    var root = ROOT[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return { root: ((root % 12) + 12) % 12, q: QUALITY[m[3]] };
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

  /** mag = משרעות ליניאריות של ה-FFT (N/2 ערכים), sr = קצב דגימה, N = גודל FFT */
  function fromMag(mag, sr, N) {
    var chroma = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], ws = [], pcs = [];
    for (var k = 1; k < N / 2; k++) {
      var f = (k * sr) / N;
      if (f < MIN_F || f > MAX_F) continue;
      pcs.push((((Math.round(69 + 12 * Math.log2(f / 440))) % 12) + 12) % 12);
      ws.push(Math.log(1 + mag[k]));               // דחיסת לוג: צליל בס חזק לא "בולע" את שאר התווים
    }
    // רצפת רעש: חציון הספקטרום בתחום. מחסירים אותה כך שרעש רקע לא מרים את כל 12 המחלקות במידה שווה
    var floor = ws.slice().sort(function (a, b) { return a - b; })[ws.length >> 1] * NOISE_K;
    for (var i = 0; i < ws.length; i++) if (ws[i] > floor) chroma[pcs[i]] += ws[i] - floor;
    return chroma;
  }

  /** כמו fromMag אבל מקבל dB מ-AnalyserNode.getFloatFrequencyData (מנורמל ב-1/N) */
  function fromDb(db, sr, N) {
    var mag = new Array(N / 2);
    for (var k = 0; k < N / 2; k++) mag[k] = isFinite(db[k]) ? Math.pow(10, db[k] / 20) * N : 0;
    return fromMag(mag, sr, N);
  }

  /** מחזיר {best, score, scores}: האקורד הכי דומה מבין names ודמיון הקוסינוס שלו */
  function match(chroma, names) {
    var nc = 0, i;
    for (i = 0; i < 12; i++) nc += chroma[i] * chroma[i];
    nc = Math.sqrt(nc);
    var out = { best: null, score: 0, scores: {} };
    if (!nc) return out;
    names.forEach(function (name) {
      var t = template(name);
      if (!t) return;
      var d = 0;
      for (var j = 0; j < 12; j++) d += chroma[j] * t[j];
      var s = d / nc;
      out.scores[name] = s;
      if (s > out.score) { out.score = s; out.best = name; }
    });
    return out;
  }

  GK.chroma = { parseChord: parseChord, template: template, fromMag: fromMag, fromDb: fromDb, match: match };
})();
