/*
 * לוגיקת "השיר מתקדם כשמנגנים נכון":
 *  - buildSteps: רשימת האקורדים בשיר לפי הסדר (כל סימון אקורד = צעד)
 *  - createMatcher: שופט כל פריטה (אחרי שנותחה) מול האקורד הנדרש.
 *  - strumPositions: אילו מקומות בדפוס הפריטה הם פריטות (לא מנוחה) — לספירה ולהתקדמות בדפוס.
 */
(function () {
  var GK = (window.GK = window.GK || {});

  /** [{line, seg, chord}] לפי הסדר בשיר */
  GK.buildSteps = function (song) {
    var steps = [];
    song.lines.forEach(function (l) {
      l.segs.forEach(function (s, k) { if (s.c) steps.push({ line: l.i, seg: k, chord: s.c }); });
    });
    return steps;
  };

  /** אינדקסים של הפריטות (D/U/X) בדפוס; מנוחות ('-') לא נספרות */
  GK.strumPositions = function (pattern) {
    var out = [];
    pattern.forEach(function (a, i) { if (a !== '-') out.push(i); });
    return out;
  };

  // k = כמה מעל רצפת הרעש צריך להיות כדי להיחשב פריטה; min = דמיון מינימלי לאקורד; strong = דמיון שמספיק לאישור בפריטה אחת
  GK.SENS = [
    { name: 'נמוכה', k: 10, min: 0.62, strong: 0.74 },
    { name: 'רגילה', k: 6, min: 0.52, strong: 0.66 },
    { name: 'גבוהה', k: 3.5, min: 0.45, strong: 0.58 }
  ];
  var MARGIN = 0.02;     // הפרש מינימלי בין האקורד הכי דומה לשני

  /**
   * judge(analysis, target, vocab) -> {status, heard, score}
   *  confirm = האקורד הנכון (חזק, או פעם שנייה ברצף של חלש)
   *  maybe   = נשמע כמו הנכון אבל חלש — עוד פריטה מאשרת
   *  wrong   = אקורד אחר מאוצר המילים של השיר
   *  unclear = לא ברור
   */
  GK.createMatcher = function (sens) {
    var weak = 0, prev = null;       // prev = האקורד שאושר ממש עכשיו: פריטות נוספות שלו (בסיום הדפוס) לא נחשבות שגיאה
    return {
      setSens: function (s) { sens = s; },
      /** keepPrev = true במעבר אוטומטי אחרי אישור; בלי זה (קפיצה ידנית) נשכח גם האקורד הקודם */
      reset: function (keepPrev) { weak = 0; if (!keepPrev) prev = null; },
      judge: function (a, target, vocab) {
        var r = GK.chroma.match(a.chroma, vocab);
        if (!r.best || r.score < sens.min || r.score - r.second < MARGIN) { weak = 0; return { status: 'unclear', heard: null, score: r.score }; }
        if (r.best !== target) {
          weak = 0;
          return { status: r.best === prev ? 'prev' : 'wrong', heard: r.best, score: r.score };
        }
        if (r.score >= sens.strong || weak >= 1) { weak = 0; prev = target; return { status: 'confirm', heard: r.best, score: r.score }; }
        weak++;
        return { status: 'maybe', heard: r.best, score: r.score };
      }
    };
  };
})();
