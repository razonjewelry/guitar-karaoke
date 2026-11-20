/* צורות אקורדים פתוחים + ציור דיאגרמה ב-SVG */
(function () {
  var GK = (window.GK = window.GK || {});

  // מיתרים מנמוך לגבוה (E A D G B e). f: סריג (null = מושתק, 0 = פתוח). n: מספר אצבע (0 = אין).
  var S = {
    A:     { f: [null, 0, 2, 2, 2, 0], n: [0, 0, 1, 2, 3, 0] },
    A7:    { f: [null, 0, 2, 0, 2, 0], n: [0, 0, 2, 0, 3, 0] },
    Am:    { f: [null, 0, 2, 2, 1, 0], n: [0, 0, 2, 3, 1, 0] },
    Am7:   { f: [null, 0, 2, 0, 1, 0], n: [0, 0, 2, 0, 1, 0] },
    Asus4: { f: [null, 0, 2, 2, 3, 0], n: [0, 0, 1, 2, 4, 0] },
    B7:    { f: [null, 2, 1, 2, 0, 2], n: [0, 2, 1, 3, 0, 4] },
    Bm:    { f: [null, 2, 4, 4, 3, 2], n: [0, 1, 3, 4, 2, 1], barre: { fret: 2, from: 1, to: 5 } },
    C:     { f: [null, 3, 2, 0, 1, 0], n: [0, 3, 2, 0, 1, 0] },
    C7:    { f: [null, 3, 2, 3, 1, 0], n: [0, 3, 2, 4, 1, 0] },
    Cmaj7: { f: [null, 3, 2, 0, 0, 0], n: [0, 3, 2, 0, 0, 0] },
    D:     { f: [null, null, 0, 2, 3, 2], n: [0, 0, 0, 1, 3, 2] },
    D7:    { f: [null, null, 0, 2, 1, 2], n: [0, 0, 0, 2, 1, 3] },
    Dm:    { f: [null, null, 0, 2, 3, 1], n: [0, 0, 0, 2, 3, 1] },
    Dm7:   { f: [null, null, 0, 2, 1, 1], n: [0, 0, 0, 2, 1, 1] },
    Dsus4: { f: [null, null, 0, 2, 3, 3], n: [0, 0, 0, 1, 3, 4] },
    E:     { f: [0, 2, 2, 1, 0, 0], n: [0, 2, 3, 1, 0, 0] },
    E7:    { f: [0, 2, 0, 1, 0, 0], n: [0, 2, 0, 1, 0, 0] },
    Em:    { f: [0, 2, 2, 0, 0, 0], n: [0, 2, 3, 0, 0, 0] },
    Em7:   { f: [0, 2, 0, 0, 0, 0], n: [0, 2, 0, 0, 0, 0] },
    F:     { f: [1, 3, 3, 2, 1, 1], n: [1, 3, 4, 2, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
    Fmaj7: { f: [null, null, 3, 2, 1, 0], n: [0, 0, 3, 2, 1, 0] },
    G:     { f: [3, 2, 0, 0, 0, 3], n: [2, 1, 0, 0, 0, 3] },
    G7:    { f: [3, 2, 0, 0, 0, 1], n: [3, 2, 0, 0, 0, 1] }
  };
  GK.CHORD_SHAPES = S;

  /** מוצא צורה לשם אקורד (גם לאקורד עם בס, כמו Am/E -> Am). אחרת null. */
  GK.shapeFor = function (name) {
    if (!name) return null;
    return S[name] || S[String(name).replace(/\/.*$/, '')] || barreShape(String(name).replace(/\/.*$/, '')) || null;
  };

  // אקורד בלי צורה פתוחה (F#, Bb, C#m…): צורת ברה — צורת E (בס על מיתר 6) או צורת A (בס על מיתר 5), הנמוכה מביניהן.
  var NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var E_SH = { '': [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0] };
  var A_SH = { '': [null, 0, 2, 2, 2, 0], m: [null, 0, 2, 2, 1, 0], '7': [null, 0, 2, 0, 2, 0], m7: [null, 0, 2, 0, 1, 0] };
  function barreShape(n) {
    var m = /^([A-G])([#b]?)(m7|m|7|maj|min)?$/.exec(n);
    if (!m) return null;
    var q = m[3] === 'maj' ? '' : m[3] === 'min' ? 'm' : (m[3] || ''), r = (NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
    var fe = (r - 4 + 12) % 12, fa = (r - 9 + 12) % 12;
    var useE = fe && (fe <= fa || !fa), fret = useE ? fe : fa, base = useE ? E_SH[q] : A_SH[q];
    if (!fret) return null;
    var f = base.map(function (x) { return x === null ? null : x + fret; });
    return { f: f, n: f.map(function (x) { return x === null ? 0 : x === fret ? 1 : Math.min(4, x - fret + 1 + (x - fret === 2 ? 1 : 0)); }), barre: { fret: fret, from: useE ? 0 : 1, to: 5 } };
  }
  GK.barreShape = barreShape;

  /** מחזיר מחרוזת SVG לדיאגרמת אקורד (או תיבת טקסט אם אין צורה) */
  GK.chordSvg = function (name) {
    var sh = GK.shapeFor(name);
    if (!sh) return '<div class="cd-none">' + GK.esc(name) + '</div>';
    var X0 = 9, GAP = 8.4, Y0 = 18, FG = 13, R = 4.6;
    var x = function (i) { return X0 + i * GAP; };
    var o = ['<svg viewBox="0 0 60 80" class="cd" role="img" aria-label="' + GK.esc(name) + '">'];
    var i, f;
    // צורה גבוהה בצוואר (ברה בסריג 5 וכו'): מציגים מהסריג הנמוך שבה ורושמים את מספרו בצד
    var frs = sh.f.filter(function (v) { return v; }), off = Math.max.apply(null, frs.concat([0])) > 4 ? Math.min.apply(null, frs) - 1 : 0;
    if (off) {
      sh = { f: sh.f.map(function (v) { return v ? v - off : v; }), n: sh.n, barre: sh.barre && { fret: sh.barre.fret - off, from: sh.barre.from, to: sh.barre.to } };
      o.push('<text class="fn" x="2" y="' + (Y0 + 0.5 * FG + 2.4) + '" style="font-size:7px">' + (off + 1) + '</text>');
    }
    for (i = 0; i < 6; i++) o.push('<line class="s" x1="' + x(i) + '" y1="' + Y0 + '" x2="' + x(i) + '" y2="' + (Y0 + FG * 4) + '"/>');
    for (f = 0; f <= 4; f++) {
      o.push('<line class="' + (f === 0 && !off ? 'nut' : 'f') + '" x1="' + x(0) + '" y1="' + (Y0 + f * FG) + '" x2="' + x(5) + '" y2="' + (Y0 + f * FG) + '"/>');
    }
    for (i = 0; i < 6; i++) {
      if (sh.f[i] === null) o.push('<text class="x" x="' + x(i) + '" y="13">×</text>');
      else if (sh.f[i] === 0) o.push('<circle class="o" cx="' + x(i) + '" cy="10" r="3"/>');
    }
    var b = sh.barre;
    if (b) {
      var cy = Y0 + (b.fret - 0.5) * FG;
      o.push('<rect class="dot" x="' + (x(b.from) - R) + '" y="' + (cy - R) + '" width="' + (x(b.to) - x(b.from) + 2 * R) + '" height="' + (2 * R) + '" rx="' + R + '"/>');
    }
    for (i = 0; i < 6; i++) {
      var fr = sh.f[i];
      if (!fr) continue;
      if (b && fr === b.fret && i >= b.from && i <= b.to) continue;
      var cy2 = Y0 + (fr - 0.5) * FG;
      o.push('<circle class="dot" cx="' + x(i) + '" cy="' + cy2 + '" r="' + R + '"/>');
      if (sh.n[i]) o.push('<text class="fn" x="' + x(i) + '" y="' + (cy2 + 2.4) + '">' + sh.n[i] + '</text>');
    }
    o.push('</svg>');
    return o.join('');
  };
})();
