/*
 * מודל דפוס הפריטה (SmartStrummingCoach):
 *   StrumPattern { id, name, beatsPerBar, beatUnit, steps:[{beat, action, durationBeats, accent?}], source }
 *   action = down | up | rest | muted.   rest (X) = לא לפרוט בכלל; muted (M) = פריטה חסומה, רק כשהדפוס מגדיר זאת במפורש.
 *   beat = מיקום בתיבה ביחידות של beatUnit (ב-4/4: רבעים; ב-6/8: שמיניות). מיקום הפעימות נפרד מרשימת הפעולות:
 *   דפוס של 5 פעולות לא חייב להיות דפוס של 5 פעימות.
 * source: verified (מהמקור) | suggested (מומלץ לתרגול) | manual (הוגדר ידנית).
 * טהור (בלי דפדפן): נבדק ב-Node.
 */
(function () {
  var GK = (window.GK = window.GK || {});
  var EPS = 1e-6;

  // pulse = כמה יחידות בפעימה אחת של ה-BPM (ב-6/8 הפעימה היא רבע מנוקד = 3 שמיניות)
  var METERS = {
    '4/4': { beatsPerBar: 4, beatUnit: 4, pulse: 1, countWords: ['One', 'Two', 'Three', 'Four'] },
    '3/4': { beatsPerBar: 3, beatUnit: 4, pulse: 1, countWords: ['One', 'Two', 'Three'] },
    '2/4': { beatsPerBar: 2, beatUnit: 4, pulse: 1, countWords: ['One', 'Two'] },
    '6/8': { beatsPerBar: 6, beatUnit: 8, pulse: 3, countWords: ['One', 'Two'] }
  };
  var SYM = { down: '↓', up: '↑', rest: 'X', muted: 'M' };
  var WORD = { down: 'Down', up: 'Up', rest: 'Rest', muted: 'Muted' };
  var HE = { down: 'למטה', up: 'למעלה', rest: 'מנוחה — לא לפרוט', muted: 'פריטה חסומה' };
  var TOK = { D: 'down', U: 'up', X: 'rest', M: 'muted' };
  var SOURCE_LABEL = { verified: 'פריטה מהמקור', suggested: 'פריטה מומלצת לתרגול', manual: 'פריטה שהוגדרה ידנית' };

  var P = (GK.pat = { METERS: METERS, SYM: SYM, WORD: WORD, HE: HE, SOURCE_LABEL: SOURCE_LABEL, ACTIONS: ['down', 'up', 'rest', 'muted'] });

  P.meterKey = function (p) { return p.beatsPerBar + '/' + p.beatUnit; };
  P.meterOf = function (p) { return METERS[P.meterKey(p)] || { beatsPerBar: p.beatsPerBar, beatUnit: p.beatUnit, pulse: 1, countWords: ['One', 'Two', 'Three', 'Four'] }; };

  /** משלים durationBeats חסר (עד הצעד הבא / סוף התיבה) ומסדר לפי מיקום */
  P.normalize = function (p) {
    var steps = p.steps.map(function (s) { return { beat: s.beat, action: s.action, durationBeats: s.durationBeats, accent: !!s.accent }; });
    steps.sort(function (a, b) { return a.beat - b.beat; });
    steps.forEach(function (s, i) {
      if (s.durationBeats === undefined || s.durationBeats === null) {
        s.durationBeats = (i + 1 < steps.length ? steps[i + 1].beat : p.beatsPerBar) - s.beat;
      }
    });
    return { id: p.id, name: p.name, beatsPerBar: p.beatsPerBar, beatUnit: p.beatUnit, steps: steps, source: p.source || 'suggested' };
  };

  /** בודק תקינות: פעולה חוקית, מיקום בתוך התיבה, משך חיובי, בלי חפיפה. מחזיר {ok, errors} */
  P.validate = function (p) {
    var errors = [];
    if (!p || !(p.beatsPerBar >= 1) || [2, 4, 8, 16].indexOf(p.beatUnit) < 0) errors.push('משקל לא תקין');
    if (!p || !p.steps || !p.steps.length) errors.push('אין צעדים בדפוס');
    if (errors.length) return { ok: false, errors: errors };
    if (['verified', 'suggested', 'manual'].indexOf(p.source) < 0) errors.push('source לא חוקי');
    p.steps.forEach(function (s, i) {
      if (P.ACTIONS.indexOf(s.action) < 0) errors.push('צעד ' + (i + 1) + ': פעולה לא חוקית');
      if (!isFinite(s.beat) || s.beat < -EPS) errors.push('צעד ' + (i + 1) + ': מיקום פעימה לא חוקי');
      if (!(s.durationBeats > EPS)) errors.push('צעד ' + (i + 1) + ': משך חייב להיות חיובי');
      else if (s.beat + s.durationBeats > p.beatsPerBar + EPS) errors.push('צעד ' + (i + 1) + ': חורג מסוף התיבה');
      if (i > 0 && p.steps[i - 1].beat + p.steps[i - 1].durationBeats > s.beat + EPS) errors.push('צעד ' + (i + 1) + ': חופף לצעד הקודם');
      if (i > 0 && s.beat < p.steps[i - 1].beat - EPS) errors.push('צעדים לא מסודרים לפי מיקום');
    });
    return { ok: errors.length === 0, errors: errors };
  };

  function make(id, name, meter, steps, source) {
    var m = METERS[meter];
    return P.normalize({
      id: id, name: name, beatsPerBar: m.beatsPerBar, beatUnit: m.beatUnit, source: source || 'suggested',
      steps: steps.map(function (s) { return { beat: s[0], action: s[1], durationBeats: s[2], accent: !!s[3] }; })
    });
  }

  /** דפוס מרשת קבועה: tokens D/U/X/M (עם '>' להדגשה); כל token תופס g יחידות */
  P.fromGrid = function (id, name, meter, g, tokens, source) {
    var m = METERS[meter];
    return P.normalize({
      id: id, name: name, beatsPerBar: m.beatsPerBar, beatUnit: m.beatUnit, source: source || 'suggested',
      steps: tokens.map(function (t, i) {
        var acc = t.charAt(0) === '>';
        return { beat: i * g, action: TOK[acc ? t.slice(1) : t], durationBeats: g, accent: acc };
      })
    });
  };

  /** ממיר את מערך הפריטה של הפרסר הישן (D/U/-/X על רשת שמיניות) לדפוס. '-' = מנוחה (X), 'X' הישן = חסומה (M). */
  P.fromLegacy = function (arr, timeStr, source, id, name) {
    var g = timeStr === '6/8' ? 1 : 0.5;
    var tokens = arr.map(function (a) { return a === 'D' ? 'D' : a === 'U' ? 'U' : a === 'X' ? 'M' : 'X'; });
    return P.fromGrid(id || 'song-strum', name || 'פריטת השיר', METERS[timeStr] ? timeStr : '4/4', g, tokens, source || 'manual');
  };

  // ───── ספריית דפוסים למתחילים (מקוריים; חלקם עם מנוחות X) ─────
  P.LIBRARY = [
    P.fromGrid('four-down', 'ארבע למטה', '4/4', 1, ['>D', 'D', 'D', 'D']),
    P.fromGrid('down-up-eighths', 'למטה־למעלה רצוף', '4/4', 0.5, ['D', 'U', 'D', 'U', 'D', 'U', 'D', 'U']),
    P.fromGrid('folk-classic', 'עממי קלאסי', '4/4', 0.5, ['D', 'X', 'D', 'U', 'X', 'U', 'D', 'U']),
    make('up-up-rest-up-up', '↑ ↑ X ↑ ↑', '4/4', [[0, 'up', 1], [1, 'up', 1], [2, 'rest', 1], [3, 'up', 0.5], [3.5, 'up', 0.5]]),
    P.fromGrid('down-rest-down-up', 'למטה, מנוחה, למטה, למעלה', '4/4', 1, ['D', 'X', 'D', 'U']),
    P.fromGrid('three-down-rest', 'שלוש למטה ומנוחה', '4/4', 1, ['D', 'D', 'D', 'X']),
    P.fromGrid('down-down-up-rest', 'למטה, למטה, למעלה, מנוחה', '4/4', 1, ['D', 'D', 'U', 'X']),
    P.fromGrid('offbeat-ups', 'רק למעלה על חצאי הפעימה', '4/4', 0.5, ['X', 'U', 'X', 'U', 'X', 'U', 'X', 'U']),
    P.fromGrid('sparse-rests', 'דלילה עם מנוחות', '4/4', 0.5, ['D', 'X', 'X', 'U', 'D', 'X', 'X', 'U']),
    P.fromGrid('one-per-bar', 'למטה פעם בתיבה', '4/4', 1, ['>D', 'X', 'X', 'X']),
    P.fromGrid('waltz-basic', 'ואלס: שלוש למטה', '3/4', 1, ['>D', 'D', 'D']),
    P.fromGrid('waltz-rest', 'ואלס עם מנוחה', '3/4', 0.5, ['D', 'X', 'D', 'U', 'D', 'U']),
    P.fromGrid('six-eight-basic', 'שש־שמיניות בסיסי', '6/8', 1, ['D', 'X', 'U', 'D', 'X', 'U']),
    P.fromGrid('six-eight-two', 'שש־שמיניות: שתי למטה', '6/8', 1, ['>D', 'X', 'X', 'D', 'X', 'X']),
    P.fromGrid('two-four-down', 'שני רבעים: שתי למטה', '2/4', 1, ['>D', 'D'])
  ];
  var DEFAULT_BY_METER = { '4/4': 'folk-classic', '3/4': 'waltz-basic', '6/8': 'six-eight-basic', '2/4': 'two-four-down' };

  P.byId = function (id) { return P.LIBRARY.filter(function (p) { return p.id === id; })[0] || null; };
  P.forMeter = function (meter) { return P.LIBRARY.filter(function (p) { return P.meterKey(p) === meter; }); };
  P.defaultFor = function (meter) { return P.byId(DEFAULT_BY_METER[meter] || DEFAULT_BY_METER['4/4']); };

  /** ["↑","↑","X","↑","↑"] */
  P.symbols = function (p) { return p.steps.map(function (s) { return SYM[s.action]; }); };
  P.symbolText = function (p) { return P.symbols(p).join(' '); };

  /** הטקסט שהמורה מקריא באנגלית: "Up, Up, Rest, Up, Up." (X = Rest) */
  P.speechText = function (p) { return p.steps.map(function (s) { return WORD[s.action]; }).join(', ') + '.'; };

  /** תווית מיקום לצעד: ב-x/4: 1, 1&, 2...; ב-6/8: 1..6 */
  P.beatLabel = function (p, step) {
    if (p.beatUnit === 8) return String(Math.floor(step.beat + EPS) + 1);
    var n = Math.floor(step.beat + EPS), f = step.beat - n;
    if (f < EPS) return String(n + 1);
    if (Math.abs(f - 0.5) < 0.01) return (n + 1) + '&';
    return '·';
  };

  /** אינדקס הצעד הפעיל במיקום beatInBar (ביחידות); -1 אם בפער */
  P.stepIndexAt = function (p, beatInBar) {
    for (var i = p.steps.length - 1; i >= 0; i--) {
      var s = p.steps[i];
      if (beatInBar >= s.beat - EPS && beatInBar < s.beat + s.durationBeats - EPS) return i;
    }
    return -1;
  };
})();
