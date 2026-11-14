// בדיקות: פרסר, שירים מובנים, זיהוי אקורדים וספירת פריטות על גיטרה מסונתזת ריאליסטית, ושופט הפריטות. הרצה: node tests/run.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { console, setInterval, clearInterval, setTimeout, Math };
ctx.window = ctx;
vm.createContext(ctx);
['js/util.js', 'js/chords-db.js', 'js/parser.js', 'js/fft.js', 'js/chroma.js', 'js/strum.js', 'js/stepper.js', 'data/songs.js'].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }));
const GK = ctx.GK;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } }

// ───── פרסר ─────
const s = GK.parseSong('{title: בדיקה}\n{bars: 3}\n{section: בית}\n[Am]שלום [C]עולם |4\n\n[G]שורה ש[F]נייה\n{time: 6/8}\n[Em]שלוש');
ok(s.title === 'בדיקה' && s.lines.length === 3, 'כותרת/שורות');
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
ok(GK.strumPositions(['D', '-', 'D', 'U', '-', 'U', 'D', 'U']).join() === '0,2,3,5,6,7', 'מקומות פריטה בדפוס');

// ───── שירים מובנים ─────
ok(GK.BUILTIN.length >= 9, 'לפחות 9 שירים מובנים');
const ids = {};
const songs = GK.BUILTIN.map((b) => GK.parseSong(b.text, { id: b.id, builtin: true }));
songs.forEach((song) => {
  ok(!ids[song.id], 'מזהה כפול ' + song.id); ids[song.id] = 1;
  ok(song.warnings.length === 0, song.id + ' אזהרות: ' + song.warnings.join('; '));
  ok(song.title !== 'ללא שם' && song.lines.length >= 6, song.id + ' כותרת/שורות');
  song.chords.forEach((c) => ok(!!GK.shapeFor(c) && !!GK.chroma.template(c), song.id + ' אין דיאגרמה/תבנית ל-' + c));
  const steps = GK.buildSteps(song);
  ok(steps.length >= 6 && steps.every((st, i) => i === 0 || st.line >= steps[i - 1].line), song.id + ' צעדים');
});
['Am', 'F', 'Bm', 'G7'].forEach((c) => ok(/^<svg/.test(GK.chordSvg(c)), 'svg ל-' + c));
ok(/cd-none/.test(GK.chordSvg('H#9')), 'אקורד לא מוכר => תיבת טקסט');
const tpl = GK.chroma.template('Am');
ok(tpl && Math.abs(tpl.reduce((a, b) => a + b * b, 0) - 1) < 1e-9, 'תבנית מנורמלת');
ok(GK.chroma.parseChord('Am/E').root === 9 && GK.chroma.parseChord('F#m').root === 6 && GK.chroma.parseChord('Bb').root === 10, 'שורשים');

// ───── FFT ─────
{
  const n = 1024, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 50 * i) / n);
  GK.fft(re, im);
  let best = 0; for (let k = 1; k < n / 2; k++) if (Math.hypot(re[k], im[k]) > Math.hypot(re[best], im[best])) best = k;
  ok(best === 50 && Math.hypot(re[50], im[50]) > n / 2 * 0.95, 'FFT מוצא תדר 50');
}

// ───── גיטרה מסונתזת ריאליסטית ─────
let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const OPEN = [40, 45, 50, 55, 59, 64];
/** מוסיף פריטה של אקורד לאות sig החל מדגימה start. o: {dir, amp, tune (סנט), spread (סנט), B (אי-הרמוניות)} */
function addStrum(sig, sr, start, chord, o) {
  const sh = GK.CHORD_SHAPES[chord];
  let order = [0, 1, 2, 3, 4, 5].filter((i) => sh.f[i] !== null);
  if (o.dir === 'U') order = order.filter((i) => i >= 2).reverse();          // פריטה למעלה פוגעת בעיקר במיתרים הגבוהים
  const gap = o.dir === 'U' ? 0.006 : 0.009;
  order.forEach((i, rank) => {
    const cents = o.tune + (rnd() - 0.5) * 2 * o.spread;
    const f0 = 440 * Math.pow(2, (OPEN[i] + sh.f[i] - 69) / 12 + cents / 1200);
    const T = 1.6 - 0.12 * i, a0 = o.amp * (i < 2 ? 1 : 0.8), s0 = start + Math.round((rank * gap + 0.002) * sr);
    const len = Math.min(sig.length - s0, Math.round(1.2 * sr));
    for (let h = 1; h <= 6; h++) {
      const fh = h * f0 * Math.sqrt(1 + o.B * h * h), ph = rnd() * 6.283, ah = (a0 * (h === 1 ? 0.9 : 1)) / Math.pow(h, 1.1) / 3;
      for (let n = 0; n < len; n++) sig[s0 + n] += ah * Math.sin((2 * Math.PI * fh * n) / sr + ph) * Math.exp(-n / sr / T) * Math.min(1, n / (0.002 * sr));
    }
  });
  const nl = Math.round(0.008 * sr);                                         // רעש הפריטה (טרנזיינט)
  for (let n = 0; n < nl && start + n < sig.length; n++) sig[start + n] += (rnd() - 0.5) * o.amp * 0.5 * (1 - n / nl);
}
function addNoise(sig, rms) { if (rms) for (let i = 0; i < sig.length; i++) sig[i] += (rnd() - 0.5) * 2 * rms * 1.7; }
/** מריץ את המנתח על אות שלם בחתיכות של 512 */
function analyze(sig, sr, k) {
  const an = GK.createStrumAnalyzer({ sr, k: k || 6 }), res = { onsets: [], analyses: [] };
  for (let i = 0; i < sig.length; i += 512) {
    const r = an.push(sig.subarray(i, Math.min(sig.length, i + 512)));
    res.onsets.push(...r.onsets); res.analyses.push(...r.analyses);
  }
  return res;
}

const SCEN = {
  clean: { tune: 0, spread: 0, B: 0, noise: 0.0005, amp: 0.30 },
  realistic: { tune: -25, spread: 8, B: 1e-4, noise: 0.004, amp: 0.20 },
  hard: { tune: 35, spread: 15, B: 3e-4, noise: 0.012, amp: 0.10 }
};
// hard = רעש חזק כמו הצליל עצמו. ב-16k (מה שהדפדפן מקבל ב-Chrome) צפוי להיות טוב; ב-48k הוא מידעי בלבד.
const MIN_PASS = { clean: 0.99, realistic: 0.95, hard: 0.85 };
const normal = GK.SENS[1];

// פריטה בודדת של כל אקורד בכל שיר: בדיוק התקפה אחת, וניתוח שמזהה את האקורד הנכון
for (const sr of [16000, 48000]) {
  for (const dir of ['D', 'U']) {
    for (const name of Object.keys(SCEN)) {
      let good = 0, total = 0, bad = [];
      songs.forEach((song) => song.chords.forEach((c) => {
        const o = Object.assign({ dir }, SCEN[name]);
        if (dir === 'U') o.amp *= 0.7;
        const sig = new Float32Array(Math.round(sr * 1.6));
        addStrum(sig, sr, Math.round(0.6 * sr), c, o);
        addNoise(sig, o.noise);
        const r = analyze(sig, sr);
        total++;
        const m = r.analyses.length ? GK.chroma.match(r.analyses[0].chroma, song.chords) : null;
        if (r.onsets.length === 1 && r.analyses.length === 1 && m.best === c && m.score >= normal.min) good++;
        else bad.push(song.id + ':' + c + '(' + r.onsets.length + (m ? ',' + m.best + ' ' + m.score.toFixed(2) : '') + ')');
      }));
      const rate = good / total;
      console.log(`single ${dir} ${name} @${sr}: ${good}/${total} (${(rate * 100).toFixed(0)}%)` + (bad.length ? '  miss: ' + bad.slice(0, 6).join(' ') : ''));
      const need = name === 'hard' && sr > 24000 ? 0 : (dir === 'U' ? MIN_PASS[name] - 0.05 : MIN_PASS[name]);
      ok(rate >= need, `זיהוי פריטה בודדת ${dir} ${name} @${sr}: ${(rate * 100).toFixed(0)}%`);
    }
  }
}

// ספירת פריטות: דפוס D D U U D U, שמינית כל 300ms, פריטות למעלה חלשות יותר; שלוש תיבות = 18 פריטות
{
  const sr = 16000, pat = ['D', 'D', 'U', 'U', 'D', 'U'];
  ['clean', 'realistic', 'hard'].forEach((name) => {
    const o = SCEN[name], sig = new Float32Array(Math.round(sr * 7));
    let t = 0.6, n = 0;
    for (let bar = 0; bar < 3; bar++) for (const d of pat) {
      addStrum(sig, sr, Math.round(t * sr), 'Am', Object.assign({}, o, { dir: d, amp: o.amp * (d === 'U' ? 0.6 : 1) }));
      t += 0.3; n++;
    }
    addNoise(sig, o.noise);
    const r = analyze(sig, sr);
    console.log(`count ${name}: ${r.onsets.length}/${n} strums`);
    if (name !== 'hard') ok(r.onsets.length >= n - 1 && r.onsets.length <= n + 1, `ספירת פריטות ${name}: ${r.onsets.length}/${n}`);   // hard מידעי בלבד
  });
}
// שקט ורעש בלבד: אפס פריטות
{
  const sr = 16000, sig = new Float32Array(sr * 3);
  addNoise(sig, 0.006);
  ok(analyze(sig, sr).onsets.length === 0, 'רעש רקע לא נספר כפריטות');
}

// ───── שופט הפריטות ─────
{
  const vocab = ['Am', 'C', 'G', 'F'], sr = 16000, o = SCEN.realistic;
  // רצף אקורדים: 4 פריטות לכל אקורד. אחרי אישור, שאר הפריטות של אותו אקורד לא מדווחות כשגיאה.
  const seq = ['Am', 'C', 'G', 'F'], sig = new Float32Array(Math.round(sr * 9));
  let t = 0.6;
  seq.forEach((c) => { for (let i = 0; i < 4; i++) { addStrum(sig, sr, Math.round(t * sr), c, Object.assign({ dir: i % 2 ? 'U' : 'D' }, o)); t += 0.4; } });
  addNoise(sig, o.noise);
  const r = analyze(sig, sr), m = GK.createMatcher(normal);
  let idx = 0, wrongs = 0, confirms = [];
  r.analyses.forEach((a) => {
    const j = m.judge(a, seq[idx] || 'X', vocab);
    if (j.status === 'confirm') { confirms.push(seq[idx]); idx++; }
    if (j.status === 'wrong') wrongs++;
  });
  ok(idx === 4 && confirms.join() === seq.join(), 'רצף אקורדים מאושר לפי הסדר: ' + confirms.join());
  ok(wrongs === 0, 'פריטות נוספות של האקורד הקודם לא נחשבות שגיאה: ' + wrongs);

  // אקורד שגוי מדווח, ולא מאשר
  const sig2 = new Float32Array(Math.round(sr * 2.2));
  addStrum(sig2, sr, Math.round(0.6 * sr), 'G', Object.assign({ dir: 'D' }, o)); addNoise(sig2, o.noise);
  const m2 = GK.createMatcher(normal), j2 = m2.judge(analyze(sig2, sr).analyses[0], 'Am', vocab);
  ok(j2.status === 'wrong' && j2.heard === 'G', 'אקורד שגוי מדווח: ' + JSON.stringify(j2));
  // אקורד לא ברור (רעש בלבד כרומה אקראית)
  const flat = { chroma: new Array(12).fill(1) };
  ok(GK.createMatcher(normal).judge(flat, 'Am', vocab).status === 'unclear', 'כרומה שטוחה = לא ברור');
  // חלש אבל נכון: פריטה ראשונה maybe, שנייה confirm
  const m3 = GK.createMatcher(GK.SENS[2]);
  const weakA = { chroma: GK.chroma.template('Am').map((v, i) => v + (i === 3 || i === 6 ? 0.55 : 0.12)) };
  const w1 = m3.judge(weakA, 'Am', vocab), w2 = m3.judge(weakA, 'Am', vocab);
  ok((w1.status === 'maybe' && w2.status === 'confirm') || w1.status === 'confirm', 'חלש: maybe ואז confirm (או confirm מיד): ' + w1.status + ',' + w2.status);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
