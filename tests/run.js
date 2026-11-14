// בדיקות: פרסר, שירים מובנים, דיאגרמות, זיהוי אקורדים (מסונתז מאצבועים אמיתיים) ומכונת האישור. הרצה: node tests/run.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { console, setInterval, clearInterval, setTimeout, Math };
ctx.window = ctx;
vm.createContext(ctx);
['js/util.js', 'js/chords-db.js', 'js/parser.js', 'js/chroma.js', 'js/stepper.js', 'data/songs.js'].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }));
const GK = ctx.GK;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } }

// ───── פרסר ─────
const s = GK.parseSong('{title: בדיקה}\n{bpm: 100}\n{bars: 3}\n{section: בית}\n[Am]שלום [C]עולם |4\n\n[G]שורה ש[F]נייה\n{time: 6/8}\n[Em]שלוש');
ok(s.title === 'בדיקה' && s.bpm === 100, 'כותרת/bpm');
ok(s.lines.length === 3, 'מספר שורות ' + s.lines.length);
ok(s.lines[0].bars === 4 && s.lines[1].bars === 3, 'תיבות');
ok(s.lines[0].section === 'בית' && s.lines[1].gap === true, 'קטע/רווח');
ok(s.lines[0].segs.length === 2 && s.lines[0].segs[0].c === 'Am' && s.lines[0].segs[0].t === 'שלום ', 'קטעי אקורד');
ok(s.lines[1].segs[0].t === 'שורה ש' && s.lines[1].segs[1].t === 'נייה' && s.lines[1].segs[1].c === 'F', 'אקורד באמצע מילה');
ok(s.chords.join(',') === 'Am,C,G,F,Em', 'רשימת אקורדים ' + s.chords);
ok(s.lines[2].strum.length === 6 && s.slots === 6, '6/8 => 6 מקומות פריטה');
ok(GK.parseSong('{bpm: 5}\n[A]x').warnings.length === 1, 'אזהרת bpm');
ok(GK.parseSong('{zzz: 1}\n[A]x').warnings.length === 1, 'אזהרת הנחיה לא מוכרת');
const sp = GK.parseSong('{strum: D U X}\n[A]x').lines[0].strum;
ok(sp.length === 8 && sp[0] === 'D' && sp[1] === 'U' && sp[2] === 'X' && sp[7] === '-', 'ריפוד פריטה ל-8');

// ───── שירים מובנים ─────
ok(GK.BUILTIN.length >= 9, 'לפחות 9 שירים מובנים');
const ids = {};
const songs = GK.BUILTIN.map((b) => GK.parseSong(b.text, { id: b.id, builtin: true }));
songs.forEach((song) => {
  ok(!ids[song.id], 'מזהה כפול ' + song.id); ids[song.id] = 1;
  ok(song.warnings.length === 0, song.id + ' אזהרות: ' + song.warnings.join('; '));
  ok(song.title !== 'ללא שם' && song.lines.length >= 6, song.id + ' כותרת/שורות');
  song.chords.forEach((c) => ok(!!GK.shapeFor(c) && !!GK.chroma.template(c), song.id + ' אין דיאגרמה/תבנית ל-' + c));
  song.lines.forEach((l) => {
    let prev = 0;
    l.segs.forEach((g) => { ok(g.f0 >= prev - 1e-9 && g.f1 <= 1 + 1e-9 && g.f1 >= g.f0, song.id + ' חלוקה'); prev = g.f1; });
  });
  const steps = GK.buildSteps(song);
  const total = song.lines.reduce((n, l) => n + l.segs.filter((g) => g.c).length, 0);
  ok(steps.length === total && steps.length >= 6, song.id + ' צעדים ' + steps.length);
  ok(steps.every((st, i) => i === 0 || st.line >= steps[i - 1].line), song.id + ' סדר צעדים');
});
['Am', 'F', 'Bm', 'G7'].forEach((c) => ok(/^<svg/.test(GK.chordSvg(c)), 'svg ל-' + c));
ok(/cd-none/.test(GK.chordSvg('H#9')), 'אקורד לא מוכר => תיבת טקסט');

// ───── תבניות אקורד ─────
const t = GK.chroma.template('Am');
ok(t && Math.abs(t.reduce((a, b) => a + b * b, 0) - 1) < 1e-9, 'תבנית מנורמלת');
ok(GK.chroma.parseChord('Am/E').root === 9 && GK.chroma.parseChord('F#m').root === 6 && GK.chroma.parseChord('Bb').root === 10, 'שורשים');
ok(GK.chroma.template('Xyz') === null, 'תבנית לא מוכרת = null');

// ───── סינתזה של אקורדים מהאצבוע האמיתי + FFT ─────
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
      const ur = re[i + k], ui = im[i + k];
      const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
      const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
      re[i + k] = ur + vr; im[i + k] = ui + vi;
      re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
    }
  }
}
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const OPEN = [40, 45, 50, 55, 59, 64];
function synth(name, sr, N, noise) {
  const sh = GK.CHORD_SHAPES[name], x = new Float64Array(N);
  sh.f.forEach((fr, i) => {
    if (fr === null) return;
    const f0 = 440 * Math.pow(2, (OPEN[i] + fr - 69) / 12), ph = rnd() * 6.28;
    for (let h = 1; h <= 5; h++) for (let n = 0; n < N; n++) x[n] += Math.sin(2 * Math.PI * f0 * h * n / sr + ph * h) / Math.pow(h, 1.2);
  });
  if (noise) for (let n = 0; n < N; n++) x[n] += (rnd() - 0.5) * noise;
  return x;
}
function chromaOf(x, sr) {
  const N = x.length, re = new Float64Array(N), im = new Float64Array(N);
  for (let n = 0; n < N; n++) {               // חלון בלקמן כמו ב-AnalyserNode
    const a = 0.16, w = (1 - a) / 2 - 0.5 * Math.cos(2 * Math.PI * n / N) + (a / 2) * Math.cos(4 * Math.PI * n / N);
    re[n] = x[n] * w;
  }
  fft(re, im);
  const mag = new Array(N / 2);
  for (let k = 0; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  return GK.chroma.fromMag(mag, sr, N);
}
const cache = {};
function chromaChord(name, sr, N, noise) {
  const key = [name, sr, N, noise].join('|');
  return cache[key] || (cache[key] = chromaOf(synth(name, sr, N, noise), sr));
}

// קצב 16k (כמו במכשיר) וגם 48k (דפדפנים שלא מכבדים 16k); עם רעש ובלי
[[16000, 4096, 0], [16000, 4096, 1.5], [16000, 4096, 3], [48000, 8192, 0], [48000, 8192, 1.5], [48000, 8192, 3]].forEach(([sr, N, noise]) => {
  songs.forEach((song) => {
    song.chords.forEach((c) => {
      const r = GK.chroma.match(chromaChord(c, sr, N, noise), song.chords);
      ok(r.best === c && r.score >= 0.72, song.id + ' ' + c + ' @' + sr + (noise ? ' noisy' : '') + ' => ' + r.best + ' ' + r.score.toFixed(2));
    });
  });
});
// אוצר מילים רחב: כל הטריאדות הפתוחות מול כולן
const ALL = ['A', 'Am', 'C', 'D', 'Dm', 'E', 'Em', 'F', 'G'];
let confusions = [];
ALL.forEach((c) => { const r = GK.chroma.match(chromaChord(c, 16000, 4096, 0), ALL); if (r.best !== c) confusions.push(c + '->' + r.best); });
console.log('9 triads vs all 9 (16k clean):', confusions.length ? 'confusions ' + confusions.join(' ') : 'all correct');
ok(confusions.length <= 1, 'בלבול גדול באוצר מילים רחב: ' + confusions.join(' '));
// dB -> אותו תוצאה כמו משרעת
const sampleMag = new Array(2048).fill(0).map((_, k) => (k > 20 && k < 400 ? Math.random() * 50 : 0));
const db = sampleMag.map((m) => (m > 0 ? 20 * Math.log10(m / 4096) : -Infinity));
const c1 = GK.chroma.fromMag(sampleMag, 16000, 4096), c2 = GK.chroma.fromDb(db, 16000, 4096);
ok(c1.every((v, i) => Math.abs(v - c2[i]) < 1e-6), 'fromDb == fromMag');

// ───── מכונת האישור ─────
const SENS = GK.SENS[1];
const DECAY = [0.2, 0.16, 0.13, 0.11, 0.09, 0.08, 0.07, 0.06, 0.05, 0.05, 0.04, 0.04];
const vocab = ['Am', 'C', 'G'];
const ch = (n) => chromaChord(n, 16000, 4096, 0);
function run(m, target, frames) {         // מחזיר רשימת סטטוסים
  return frames.map((f) => m.feed(f, target, vocab).status);
}
const quiet = (n) => Array.from({ length: n }, () => ({ env: 0.001, chroma: new Array(12).fill(0) }));
const strum = (name, n) => DECAY.slice(0, n).map((e) => ({ env: e, chroma: ch(name) }));

let m = GK.createMatcher(SENS);
let st = run(m, 'Am', quiet(8));
ok(st.every((x) => x === 'quiet'), 'שקט נשאר שקט');
st = run(m, 'Am', strum('G', 12));
ok(!st.includes('confirm') && st.includes('wrong'), 'אקורד שגוי לא מאשר ומדווח wrong: ' + st.join(','));
run(m, 'Am', quiet(5));
st = run(m, 'Am', strum('Am', 12));
const ci = st.indexOf('confirm');
ok(ci >= 6 && ci <= 8, 'אישור אחרי התייצבות (' + ci + '): ' + st.join(','));
ok(st.filter((x) => x === 'confirm').length === 1, 'אישור יחיד לכל פריטה');
// האקורד ממשיך להדהד (עוצמה יורדת בהדרגה, בלי פריטה חדשה) והצעד הבא הוא אותו אקורד => לא מאשר
st = run(m, 'Am', [0.035, 0.03, 0.027, 0.024, 0.021, 0.019, 0.017, 0.015, 0.014, 0.013].map((e) => ({ env: e, chroma: ch('Am') })));
ok(!st.includes('confirm'), 'הדהוד בלי פריטה חדשה לא מאשר את אותו אקורד: ' + st.join(','));
run(m, 'Am', quiet(4));
st = run(m, 'Am', strum('Am', 12));
ok(st.includes('confirm'), 'פריטה חדשה מאשרת');
// מעבר לאקורד אחר: ההדהוד של Am לא מאשר C, פריטת C מאשרת
m.reset();
st = run(m, 'C', DECAY.map((e) => ({ env: e * 0.9, chroma: ch('Am') })));
ok(!st.includes('confirm'), 'הדהוד של אקורד קודם לא מאשר אקורד אחר');
run(m, 'C', quiet(4));
st = run(m, 'C', strum('C', 12));
ok(st.includes('confirm'), 'פריטת האקורד הנכון מאשרת');
// רגישות נמוכה לא מגיבה לצליל חלש
const weak = GK.createMatcher(GK.SENS[0]);
st = run(weak, 'Am', DECAY.map((e) => ({ env: e * 0.08, chroma: ch('Am') })));
ok(st.every((x) => x === 'quiet'), 'רגישות נמוכה מתעלמת מצליל חלש');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
