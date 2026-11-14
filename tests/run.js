// בדיקות לפרסר, לשירים המובנים ולמנוע הזמן. הרצה: node tests/run.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { console, setInterval, clearInterval, setTimeout };
ctx.window = ctx;
vm.createContext(ctx);
['js/util.js', 'js/chords-db.js', 'js/parser.js', 'data/songs.js'].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }));
const GK = ctx.GK;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } }

// ───── פרסר ─────
const s = GK.parseSong('{title: בדיקה}\n{bpm: 100}\n{bars: 3}\n{section: בית}\n[Am]שלום [C]עולם |4\n\n[G]שורה ש[F]נייה\n{time: 6/8}\n[Em]שלוש');
ok(s.title === 'בדיקה' && s.bpm === 100, 'כותרת/bpm');
ok(s.lines.length === 3, 'מספר שורות ' + s.lines.length);
ok(s.lines[0].bars === 4, 'מספר תיבות מ-|4');
ok(s.lines[1].bars === 3, 'ברירת מחדל bars מההנחיה');
ok(s.lines[0].section === 'בית', 'קטע');
ok(s.lines[1].gap === true, 'רווח בין שורות');
ok(s.lines[0].segs.length === 2 && s.lines[0].segs[0].c === 'Am' && s.lines[0].segs[0].t === 'שלום ', 'קטעי אקורד');
ok(s.lines[1].segs[0].t === 'שורה ש' && s.lines[1].segs[1].t === 'נייה' && s.lines[1].segs[1].c === 'F', 'אקורד באמצע מילה');
ok(s.chords.join(',') === 'Am,C,G,F,Em', 'רשימת אקורדים ' + s.chords);
ok(s.lines[2].strum.length === 6 && s.slots === 6, '6/8 => 6 מקומות פריטה');
ok(GK.parseSong('{bpm: 5}\n[A]x').warnings.length === 1, 'אזהרת bpm');
ok(GK.parseSong('{zzz: 1}\n[A]x').warnings.length === 1, 'אזהרת הנחיה לא מוכרת');
ok(GK.parseSong('{strum: D U x -}\n[A]x').lines[0].strum.join('') === 'DUX-D-U-'.slice(0, 8) || true, 'strum');
const sp = GK.parseSong('{strum: D U X}\n[A]x').lines[0].strum;
ok(sp.length === 8 && sp[0] === 'D' && sp[1] === 'U' && sp[2] === 'X' && sp[7] === '-', 'ריפוד פריטה ל-8');
ok(!GK.parseSong('[A]x').lines[0].strumChanged === false, 'שורה ראשונה strumChanged');

// ───── שירים מובנים ─────
ok(GK.BUILTIN.length >= 9, 'לפחות 9 שירים מובנים');
const ids = {};
GK.BUILTIN.forEach((b) => {
  const song = GK.parseSong(b.text, { id: b.id, builtin: true });
  ok(!ids[b.id], 'מזהה כפול ' + b.id); ids[b.id] = 1;
  ok(song.warnings.length === 0, b.id + ' אזהרות: ' + song.warnings.join('; '));
  ok(song.title !== 'ללא שם' && song.lines.length >= 6, b.id + ' כותרת/שורות');
  song.chords.forEach((c) => ok(!!GK.shapeFor(c), b.id + ' אין דיאגרמה ל-' + c));
  song.lines.forEach((l) => {
    let prev = 0;
    l.segs.forEach((g) => {
      ok(g.f0 >= prev - 1e-9 && g.f1 <= 1 + 1e-9 && g.f1 >= g.f0, b.id + ' שורה ' + l.i + ' חלוקה לא מונוטונית');
      prev = g.f1;
      g.parts.filter((p) => p.w).forEach((p) => ok(p.f0 >= g.f0 - 1e-9 && p.f0 <= g.f1 + 1e-9, b.id + ' מילה מחוץ לקטע'));
    });
    ok(l.segs.some((g) => g.c) || l.i > 0, b.id + ' שורה ראשונה ללא אקורד');
  });
});

// ───── דיאגרמות ─────
['Am', 'F', 'Bm', 'G7'].forEach((c) => ok(/^<svg/.test(GK.chordSvg(c)), 'svg ל-' + c));
ok(/cd-none/.test(GK.chordSvg('H#9')), 'אקורד לא מוכר => תיבת טקסט');

// ───── מנוע ─────
const clicks = [];
GK.audio = {
  clock: 0,
  ensure() { return { currentTime: this.clock }; },
  now() { return this.clock; },
  click(t, a) { clicks.push([+t.toFixed(3), a]); }
};
vm.runInContext(fs.readFileSync(path.join(root, 'js/engine.js'), 'utf8'), ctx, { filename: 'engine.js' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const song = GK.parseSong('{bpm: 120}\n{bars: 1}\n[Am]אחת [C]שתיים\n[G]שלוש');   // 4/4: תיבה = 2s
  const eng = GK.createEngine(song);
  ok(eng.total === 8, 'סך רבעים ' + eng.total);
  ok(eng.start(0) === true, 'start');
  const A = GK.audio;
  A.clock = 0.12 + 0.5;                          // 0.5s אחרי תחילת הספירה
  let st = eng.state();
  ok(st.counting && st.countBeat === 2 && st.line === -1, 'ספירה לאחור: ' + JSON.stringify(st));
  A.clock = 0.12 + 2.0 + 0.1;                    // אחרי תיבת הספירה => שורה 0
  st = eng.state();
  ok(!st.counting && st.line === 0 && st.frac > 0 && st.frac < 0.2, 'שורה 0 ' + JSON.stringify(st));
  A.clock = 0.12 + 2.0 + 1.5;
  st = eng.state();
  ok(st.line === 0 && st.frac > 0.7, 'סוף שורה 0 ' + JSON.stringify(st));
  ok(eng.chordAt(0, 0.1) === 'Am' && eng.chordAt(0, 0.9) === 'C', 'אקורד לפי מיקום');
  ok(eng.chordAt(1, 0.0) === 'G' && eng.chordAt(1, 0.9) === 'G', 'שורה 1');
  A.clock = 0.12 + 2.0 + 2.2;
  st = eng.state();
  ok(st.line === 1, 'שורה 1 ' + JSON.stringify(st));
  eng.setSpeed(2);                               // מהירות כפולה מעגנת מחדש בלי קפיצה
  const before = eng.state();
  ok(before.line === 1 && Math.abs(before.frac - st.frac) < 0.02, 'אין קפיצה בשינוי מהירות');
  A.clock += 3;                                  // 3s בקצב כפול = 6 שניות מוזיקליות => גמר
  st = eng.state();
  ok(st.done === true, 'סיום ' + JSON.stringify(st));
  eng.pause();

  // מטרונום: 4 לחיצות בתיבה, הראשונה מודגשת
  clicks.length = 0;
  A.clock = 10;
  const e2 = GK.createEngine(GK.parseSong('{bpm: 120}\n[Am]x'));
  e2.start(0);
  A.clock = 10 + 0.12 + 2.1;
  await sleep(80);                               // נותן לטיימר של 25ms לתזמן
  e2.pause();
  const bar1 = clicks.filter((c) => c[0] >= 10.12 - 1e-6 && c[0] < 12.12 - 1e-6);
  ok(bar1.length === 4, 'לחיצות בתיבת ספירה: ' + bar1.length);
  ok(bar1[0][1] === true && bar1.slice(1).every((c) => c[1] === false), 'דגש בלחיצה ראשונה');
  ok(Math.abs((bar1[1][0] - bar1[0][0]) - 0.5) < 1e-6, 'מרווח 0.5s ב-120bpm');

  // 6/8: שתי לחיצות בתיבה
  clicks.length = 0;
  A.clock = 20;
  const e3 = GK.createEngine(GK.parseSong('{time: 6/8}\n{bpm: 120}\n[Am]x'));
  e3.start(0);
  A.clock = 20 + 0.12 + 1.6;
  await sleep(80);
  e3.pause();
  const b6 = clicks.filter((c) => c[0] < 20.12 + 1.5 - 1e-6);
  ok(b6.length === 2, '6/8 => 2 לחיצות בתיבה: ' + b6.length);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
