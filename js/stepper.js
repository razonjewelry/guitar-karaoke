/*
 * לוגיקת "השיר מתקדם כשמנגנים נכון":
 *  - buildSteps: רשימת האקורדים בשיר לפי הסדר (כל סימון אקורד = צעד)
 *  - createMatcher: מכונת מצבים שמקבלת פריימים מהמיקרופון ומחליטה אם האקורד היעד נוגן נכון.
 * כדי לאשר צריך: התקפה (פריטה) חדשה, המתנה קצרה שהצליל מתייצב, ואז כמה פריימים רצופים של האקורד הנכון.
 * כך גם אקורד שחוזר פעמיים ברצף דורש פריטה חדשה, וצליל שעדיין מהדהד מהאקורד הקודם לא מאשר את הבא.
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

  // gate = עוצמה מינימלית (RMS), thr = דמיון קוסינוס מינימלי
  GK.SENS = [
    { name: 'נמוכה', gate: 0.02, thr: 0.78 },
    { name: 'רגילה', gate: 0.012, thr: 0.72 },
    { name: 'גבוהה', gate: 0.006, thr: 0.66 }
  ];

  var SETTLE = 4;        // פריימים (כ-200ms) אחרי ההתקפה עד שמתחילים לספור
  var NEED = 3;          // פריימים רצופים נכונים לאישור
  var WRONG_NEED = 4;    // פריימים רצופים של אקורד אחר לפני שמודיעים "זה לא זה"

  /** sens = אחד מ-GK.SENS. feed מחזיר {status, heard}:
   *  quiet | idle | settling | listening | ok | wrong | confirm */
  GK.createMatcher = function (sens) {
    var armed = false, since = 0, streak = 0, wrong = 0, lastEnv = 0;
    return {
      setSens: function (s) { sens = s; },
      /** מאפס את מצב ההקשבה (בכל מעבר צעד) */
      reset: function () { armed = false; since = 0; streak = 0; wrong = 0; },
      /** f = {env, chroma}; target = האקורד הנדרש; vocab = כל אקורדי השיר */
      feed: function (f, target, vocab) {
        var onset = f.env > sens.gate && f.env > lastEnv * 1.6;
        lastEnv = f.env;
        if (f.env <= sens.gate) { streak = 0; wrong = 0; return { status: 'quiet', heard: null }; }
        if (onset) { armed = true; since = 0; streak = 0; wrong = 0; }
        else if (armed) since++;
        var res = GK.chroma.match(f.chroma, vocab);
        var heard = res.best && res.score >= sens.thr ? res.best : null;
        if (!armed) return { status: 'idle', heard: heard };
        if (since < SETTLE) return { status: 'settling', heard: heard };
        if (heard === target) {
          streak++; wrong = 0;
          if (streak >= NEED) { armed = false; streak = 0; return { status: 'confirm', heard: heard }; }
          return { status: 'ok', heard: heard };
        }
        streak = 0;
        if (heard) { wrong++; if (wrong >= WRONG_NEED) return { status: 'wrong', heard: heard }; }
        else wrong = 0;
        return { status: 'listening', heard: heard };
      }
    };
  };
})();
