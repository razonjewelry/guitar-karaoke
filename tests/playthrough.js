// בדיקות: פרסר, שירים מובנים, זיהוי אקורדים וספירת פריטות על גיטרה מסונתזת ריאליסטית, ושופט הפריטות. הרצה: node tests/run.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { console, setInterval, clearInterval, setTimeout, Math };
ctx.window = ctx;
vm.createContext(ctx);
['js/util.js', 'js/chords-db.js', 'js/parser.js', 'js/fft.js', 'js/chroma.js', 'js/strum.js', 'js/stepper.js', 'data/songs.js', 'js/patterns.js'].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }));
const GK = ctx.GK;
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

// ═════ סימולציית מנגן: כל שיר מנוגן כמו שהשחקן היה מנגן, והלוגיקה של הנגן (stepper + כללי ההתקדמות) שופטת ═════
const SR = 16000;
const NAMES = Object.keys(SCEN);
function playSong(song, scen, bpm, strumsPerChord, nextAfterBeats, rep) {
  const steps = GK.buildSteps(song), beat = 60 / bpm, o0 = SCEN[scen];
  const per = nextAfterBeats * beat, total = 1.0 + steps.length * per + 1.5;
  const sig = new Float32Array(Math.round(SR * total)), owner = [];     // owner = אקורד אמיתי בכל פריטה
  steps.forEach((st, i) => {
    for (let j = 0; j < strumsPerChord; j++) {
      const t = 1.0 + i * per + j * (per / strumsPerChord), dir = j % 2 ? 'U' : 'D';
      addStrum(sig, SR, Math.round(t * SR), st.chord, Object.assign({}, o0, { dir, amp: o0.amp * (dir === 'U' ? 0.7 : 1) }));
      owner.push({ t: t * 1000, i });
    }
  });
  addNoise(sig, o0.noise);
  const r = analyze(sig, SR), sens = GK.SENS[1], matcher = GK.createMatcher(sens);
  let idx = 0, lastAdv = -1e9, falseAdv = 0, sameChord = 0, advances = 0, wrongSeen = 0, stuckAt = -1;
  r.analyses.forEach((a) => {
    if (idx >= steps.length) return;
    if (a.t - lastAdv < 350) return;
    const j = matcher.judge(a, steps[idx].chord, song.chords, steps[idx - 1] ? steps[idx - 1].chord : null);
    if (j.status === 'wrong') wrongSeen++;
    if (j.status === 'confirm') {
      // מי באמת ניגן בזמן ההתקפה הזו? הקרוב ביותר בזמן
      let best = owner[0], d = 1e9; owner.forEach((x) => { const dd = Math.abs(x.t - a.t); if (dd < d) { d = dd; best = x; } });
      if (best.i !== idx) { if (steps[best.i].chord === steps[idx].chord) sameChord++; else falseAdv++; }
      advances++; idx++; lastAdv = a.t; matcher.reset(true);
    }
  });
  return { steps: steps.length, reached: idx, falseAdv, sameChord, wrongSeen, onsets: r.onsets.length, strums: owner.length };
}
module.exports = { GK, songs: GK.BUILTIN.map((b) => GK.parseSong(b.text, { id: b.id, builtin: true })), playSong, SCEN, addStrum, addNoise, analyze, rnd };
if (require.main === module) {
  const songs = GK.BUILTIN.map((b) => GK.parseSong(b.text, { id: b.id, builtin: true }));
  let bad = 0;
  for (const scen of NAMES) {
    for (const [label, spc, beats] of [['נגינה מלאה (4 פריטות/אקורד, 2 פעימות)', 4, 2], ['אקורד כל תיבה (פריטה אחת/2 פעימות)', 2, 4], ['מהיר: פריטה אחת לאקורד, פעימה אחת', 1, 1]]) {
      console.log(`\n── ${scen} · ${label}`);
      songs.forEach((s) => {
        seed = 7;
        const bpm = Math.min(s.bpm || 80, 100);
        const r = playSong(s, scen, bpm, spc, beats);
        const pct = Math.round(100 * r.reached / r.steps);
        const flag = pct < 90 || r.falseAdv ? '  ⚠' : '';
        if (flag) bad++;
        console.log(`${s.id.padEnd(16)} ${String(bpm).padStart(3)}bpm  הושלם ${String(pct).padStart(3)}%  (${r.reached}/${r.steps})  התקדמות-שווא ${r.falseAdv} (אותו אקורד ברצף ${r.sameChord})  אקורד-שגוי נשמע ${r.wrongSeen}  התקפות ${r.onsets}/${r.strums}${flag}`);
      });
    }
  }
  console.log('\nשורות עם בעיה:', bad);
}
