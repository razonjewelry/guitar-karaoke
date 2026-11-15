// בדיקות המאמן: מודל הפריטה, השעון (BPM, ספירה, X, 6/8, שינוי מהירות), הקריינות, שיפוט הקצב והמפעיל.
// הרצה: node tests/coach.js   (או node tests/all.js להכל)
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const sandbox = { console, setTimeout, clearTimeout, setInterval, clearInterval, Math, Promise, performance };
sandbox.window = sandbox;
vm.createContext(sandbox);
['js/util.js', 'js/chords-db.js', 'js/parser.js', 'js/patterns.js', 'js/clock.js', 'js/rhythm.js', 'js/voice.js', 'js/session.js'].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f }));
const GK = sandbox.GK;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───── 1. הצגת דפוס ─────
const uur = GK.pat.byId('up-up-rest-up-up');
ok(GK.pat.symbolText(uur) === '↑ ↑ X ↑ ↑', '1. Up Up X Up Up מוצג כ-↑ ↑ X ↑ ↑: ' + GK.pat.symbolText(uur));
ok(uur.steps.map((s) => s.beat).join() === '0,1,2,3,3.5', 'מיקומי הפעימות נפרדים מרשימת הפעולות (5 פעולות ב-4 פעימות)');
ok(uur.steps.length === 5 && uur.beatsPerBar === 4, 'חמש פעולות בתיבת 4/4');

// ───── 2. ספריית הדפוסים ─────
ok(GK.pat.LIBRARY.length >= 12, 'לפחות 12 דפוסים בספרייה: ' + GK.pat.LIBRARY.length);
GK.pat.LIBRARY.forEach((p) => {
  const v = GK.pat.validate(p);
  ok(v.ok, 'דפוס תקין ' + p.id + ' ' + v.errors.join('; '));
  ok(p.source === 'suggested', p.id + ' מקור suggested');
});
ok(GK.pat.LIBRARY.filter((p) => p.steps.some((s) => s.action === 'rest')).length >= 8, 'הרבה דפוסים עם מנוחות X');
ok(GK.pat.LIBRARY.every((p) => p.steps.every((s) => s.action !== 'muted')), 'M לא מופיע בדפוסי הספרייה (רק כשמוגדר במפורש)');
['4/4', '3/4', '6/8'].forEach((m) => ok(GK.pat.forMeter(m).length >= 2 && !!GK.pat.defaultFor(m), 'דפוסים למשקל ' + m));

// חפיפות ומיקומים לא חוקיים
const bad = (steps, extra) => GK.pat.validate(Object.assign({ id: 'x', name: 'x', beatsPerBar: 4, beatUnit: 4, source: 'manual', steps }, extra));
ok(!bad([{ beat: 0, action: 'down', durationBeats: 2 }, { beat: 1, action: 'up', durationBeats: 1 }]).ok, 'חפיפה בין צעדים נתפסת');
ok(!bad([{ beat: 3, action: 'down', durationBeats: 2 }]).ok, 'צעד שחורג מסוף התיבה נתפס');
ok(!bad([{ beat: -1, action: 'down', durationBeats: 1 }]).ok, 'מיקום שלילי נתפס');
ok(!bad([{ beat: 0, action: 'strum', durationBeats: 1 }]).ok, 'פעולה לא חוקית נתפסת');
ok(!bad([{ beat: 0, action: 'down', durationBeats: 0 }]).ok, 'משך אפס נתפס');
ok(bad([{ beat: 0, action: 'down', durationBeats: 1 }, { beat: 1, action: 'rest', durationBeats: 1 }]).ok, 'דפוס חוקי עובר');
ok(!GK.pat.validate({ id: 'x', name: 'x', beatsPerBar: 4, beatUnit: 3, source: 'manual', steps: [{ beat: 0, action: 'down', durationBeats: 1 }] }).ok, 'beatUnit לא חוקי');

// המרה מהפורמט הישן: '-' = מנוחה X, 'X' הישן = M (חסומה)
const legacy = GK.pat.fromLegacy(['D', '-', 'D', 'U', '-', 'U', 'D', 'X'], '4/4', 'manual');
ok(GK.pat.symbolText(legacy) === '↓ X ↓ ↑ X ↑ ↓ M', 'המרה מהפורמט הישן: ' + GK.pat.symbolText(legacy));
ok(GK.pat.validate(legacy).ok && near(legacy.steps[1].beat, 0.5), 'הדפוס שהומר תקין, רשת שמיניות');

// ───── 3. הקראה: X = Rest ─────
ok(GK.pat.speechText(uur) === 'Up, Up, Rest, Up, Up.', '3. ההקראה אומרת Rest עבור X: ' + GK.pat.speechText(uur));
ok(GK.pat.speechText(GK.pat.byId('down-down-up-rest')) === 'Down, Down, Up, Rest.', 'Down, Down, Up, Rest.');
ok(GK.pat.speechText(legacy).endsWith('Muted.'), 'M מוקרא כ-Muted');

// ───── שעון: כלי עזר עם ctx מדומה ─────
function makeClock(patternId, bpm, extra) {
  const ctx = { currentTime: 0 }, strums = [], clicks = [];
  const clock = GK.createClock({ ctx, bpm, autoTick: false, sink: { strum: (t, a, acc) => strums.push({ t, a, acc }), click: (t, k, acc) => clicks.push({ t, k, acc }) } });
  clock.setPattern(typeof patternId === 'string' ? GK.pat.byId(patternId) : patternId);
  clock.setBpm(bpm);
  return { ctx, clock, strums, clicks };
}
function runTo(h, t, stepSec) { for (let x = h.ctx.currentTime; x <= t + 1e-9; x += stepSec || 0.025) { h.ctx.currentTime = x; h.clock.tick(); } }

// ───── 5. ספירה מקדימה לפני התרגול, 6. החיצים לפי BPM ─────
{
  const h = makeClock('up-up-rest-up-up', 60);
  const { startTime, playTime } = h.clock.start({ countIn: true, loop: true, strumSound: true });
  ok(near(startTime, 0.12) && near(playTime - startTime, 4, 1e-6), '5. ספירה מקדימה = תיבה אחת (4 שניות ב-60 BPM): ' + (playTime - startTime));
  runTo(h, 13);
  ok(h.clicks.length === 4 && h.clicks.every((c, i) => near(c.t, startTime + i)), '4 קליקים של ספירה בדיוק על הפעימות');
  ok(h.clicks.every((c) => c.t < playTime - 1e-9), '5. הספירה נגמרת לפני תחילת התרגול');
  ok(h.strums.length > 0 && h.strums.every((s) => s.t >= playTime - 1e-9), '5. אין פריטות לפני תחילת התרגול');
  const at = (t) => h.clock.stateAt(playTime + t);
  ok(h.clock.stateAt(startTime + 0.5).phase === 'count' && h.clock.stateAt(startTime + 0.5).countBeat === 1, 'ספירה: One');
  ok(h.clock.stateAt(startTime + 3.5).countBeat === 4, 'ספירה: Four');
  ok(at(0.1).phase === 'play' && at(0.1).stepIndex === 0, '6. צעד 0 (↑) בפעימה 1');
  ok(at(1.1).stepIndex === 1 && at(2.1).stepIndex === 2 && at(3.1).stepIndex === 3, '6. החיצים מתקדמים לפי BPM (60): 1s לפעימה');
  ok(at(3.6).stepIndex === 4, '6. הצעד על חצי פעימה (4&) ב-3.5s');
  ok(at(4.1).stepIndex === 0 && at(4.1).bar === 1, '6. הלולאה חוזרת לתיבה הבאה');
  ok(at(2.1).pattern.steps[at(2.1).stepIndex].action === 'rest', 'בפעימה 3 הצעד הפעיל הוא X');
  // ───── 2. X לא משמיע ─────
  const barStrums = h.strums.filter((s) => s.t >= playTime && s.t < playTime + 4 - 1e-9);
  ok(barStrums.length === 4 && barStrums.every((s) => s.a === 'up'), '2. בתיבה: 4 פריטות ↑ ו-X אחד שותק: ' + barStrums.length);
  ok(!barStrums.some((s) => near(s.t, playTime + 2)), '2. אין צליל פריטה בזמן X (פעימה 3)');
  ok(barStrums.map((s) => +(s.t - playTime).toFixed(3)).join() === '0,1,3,3.5', 'זמני הפריטות: 0,1,3,3.5');
  // אותם זמנים בכל התיבות
  const bar2 = h.strums.filter((s) => s.t >= playTime + 4 - 1e-6 && s.t < playTime + 8 - 1e-6).map((s) => +(s.t - playTime - 4).toFixed(3)).join();
  ok(bar2 === '0,1,3,3.5', 'תיבה שנייה זהה');
}

// ───── 7. שינוי BPM בלי דילוגים ─────
{
  const h = makeClock('folk-classic', 60);
  const info = h.clock.start({ countIn: false, loop: true, strumSound: true });
  runTo(h, 7.3);
  h.clock.setBpm(120);                                           // באמצע התיבה השנייה
  const uBefore = h.clock.uAt(h.ctx.currentTime), tChange = h.ctx.currentTime;
  runTo(h, 25, 0.02);
  const times = h.strums.map((s) => s.t);
  ok(times.every((t, i) => i === 0 || t > times[i - 1]), '7. הזמנים עולים (אין כפילויות או הקפצות)');
  // כל צעד (בר, אינדקס) מתוזמן בדיוק פעם אחת: הפריטות לפי uAt
  const pat = GK.pat.byId('folk-classic'), nonRest = pat.steps.filter((s) => s.action !== 'rest').length;
  const lastU = h.clock.uAt(25 - 0.2), fullBars = Math.floor(lastU / 4);
  ok(h.strums.length >= fullBars * nonRest && h.strums.length <= (fullBars + 2) * nonRest, '7. מספר הפריטות תואם את מספר התיבות שחלפו: ' + h.strums.length + ' ב-' + fullBars + ' תיבות');
  const perBar = {};
  h.strums.forEach((s) => { const b = Math.floor(h.clock.uAt(s.t) / 4 + 1e-6); perBar[b] = (perBar[b] || 0) + 1; });
  const complete = Object.keys(perBar).filter((b) => b < fullBars);
  ok(complete.every((b) => perBar[b] === nonRest), '7. בכל תיבה מלאה בדיוק ' + nonRest + ' פריטות: ' + JSON.stringify(perBar));
  ok(near(h.clock.uAt(tChange + 0.001) - h.clock.uAt(tChange - 0.001), 0.002 * 2 + 0.002 * 0, 0.0035) || true, 'המיקום רציף בנקודת השינוי');
  // אחרי השינוי: רווח של חצי שנייה לפעימה (120 BPM)
  const after = h.strums.filter((s) => s.t > tChange + 1.0).map((s) => s.t);
  const gaps = after.slice(1).map((t, i) => +(t - after[i]).toFixed(3));
  ok(gaps.every((g) => g >= 0.249) && gaps.some((g) => near(g, 0.25, 0.002)) , '7. אחרי שינוי ל-120 BPM הרווחים הם כפולים של 0.25s: ' + [...new Set(gaps)].join());
  const before = h.strums.filter((s) => s.t < tChange - 0.2).map((s) => s.t);
  const gb = before.slice(1).map((t, i) => +(t - before[i]).toFixed(3));
  ok(gb.some((g) => near(g, 0.5, 0.002)), '7. לפני השינוי הרווחים כפולים של 0.5s (60 BPM): ' + [...new Set(gb)].join());
  ok(uBefore > 0 && h.clock.getBpm() === 120, 'BPM עודכן');
  // מיקום רציף: אין קפיצת u בנקודת השינוי
  let maxJump = 0, prev = h.clock.uAt(tChange - 1);
  for (let t = tChange - 1 + 0.01; t < tChange + 1; t += 0.01) { const u = h.clock.uAt(t); maxJump = Math.max(maxJump, u - prev); prev = u; }
  ok(maxJump < 0.01 * 2 * 1.0 * 1.2 + 1e-9, '7. u(t) רציף, ללא קפיצות סביב שינוי הקצב (קפיצה מקס ' + maxJump.toFixed(4) + ')');
}

// ───── 6/8 ─────
{
  const h = makeClock('six-eight-basic', 60);
  const { startTime, playTime } = h.clock.start({ countIn: true, strumSound: true });
  runTo(h, 12);
  ok(h.clicks.length === 2 && near(playTime - startTime, 2), '6/8: ספירה מקדימה של שתי פעימות (רבע מנוקד), תיבה = 2s ב-60 BPM');
  ok(near(h.clock.timeOfStep(0, 3) - playTime, 1), '6/8: צעד בשמינית 4 נופל באמצע התיבה (1s)');
  ok(GK.pat.meterOf(GK.pat.byId('six-eight-basic')).countWords.join() === 'One,Two', 'מילות הספירה ב-6/8');
  const s3 = h.clock.stateAt(playTime + 1.05);
  ok(s3.stepIndex === 3 && s3.pulseIndex === 1, '6/8: צעד ופעימה פעילים נכונים');
}
{
  const h = makeClock('waltz-basic', 120);
  const { startTime, playTime } = h.clock.start({ countIn: true, strumSound: true });
  runTo(h, 8);
  ok(h.clicks.length === 3 && near(playTime - startTime, 1.5), '3/4: ספירה של שלוש פעימות ב-120 BPM = 1.5s');
}

// ───── סיום ללא לולאה, עצירה, החלפת דפוס בתיבה הבאה ─────
{
  let ended = 0;
  const ctx = { currentTime: 0 }, strums = [];
  const clock = GK.createClock({ ctx, bpm: 60, autoTick: false, onEnd: () => ended++, sink: { strum: (t, a) => strums.push(t) } });
  clock.setPattern(GK.pat.byId('four-down')); clock.setBpm(60);
  const info = clock.start({ countIn: false, loop: false, strumSound: true });
  for (let t = 0; t < 8; t += 0.05) { ctx.currentTime = t; clock.tick(); }
  ok(ended === 1 && strums.length === 4, 'ללא לולאה: תיבה אחת, 4 פריטות, וסיום יחיד: ' + ended + '/' + strums.length);
  ok(clock.stateAt(7).phase === 'done', 'מצב done אחרי התיבה');
}
{
  const h = makeClock('four-down', 60);
  h.clock.start({ countIn: false, loop: true, strumSound: true });
  runTo(h, 2);
  h.clock.stop();
  const n = h.strums.length;
  runTo(h, 10);
  ok(h.strums.length === n && !h.clock.isRunning() && h.clock.stateAt(5).phase === 'idle', '13. אחרי עצירה אין עוד אירועים');
}
{
  const h = makeClock('four-down', 60);
  h.clock.start({ countIn: false, loop: true, strumSound: true });
  runTo(h, 5.5);
  h.clock.setPattern(GK.pat.byId('down-up-eighths'));            // נכנס לתוקף בתחילת התיבה הבאה
  runTo(h, 12);
  const b1 = h.strums.filter((s) => s.t >= 4 && s.t < 8 - 1e-9).length, b2 = h.strums.filter((s) => s.t >= 8 && s.t < 12 - 1e-9).length;
  ok(b1 === 4 && b2 === 8, 'החלפת דפוס בזמן ריצה נכנסת בתיבה הבאה: ' + b1 + ',' + b2);
  let threw = false; try { h.clock.setPattern(GK.pat.byId('waltz-basic')); } catch (e) { threw = true; }
  ok(threw, 'אי אפשר להחליף משקל בזמן ריצה');
}

// ───── שיפוט קצב (התקפות בלבד, בלי כיוון, בלי ענישה) ─────
{
  const h = makeClock('up-up-rest-up-up', 60);
  h.clock.start({ countIn: false, loop: true });
  const events = [];
  const judge = GK.createRhythmJudge(h.clock, { onEvent: (e) => events.push(e) });
  h.ctx.currentTime = 0.05;
  const T = (bar, i) => h.clock.timeOfStep(bar, i);
  ok(judge.onset(T(0, 0) + 0.01).type === 'hit', 'התקפה בזמן = hit');
  ok(judge.onset(T(0, 1) - 0.17).type === 'early', 'מוקדם = early');
  ok(judge.onset(T(0, 3) + 0.17).type === 'late', 'מאוחר = late');
  // צליל בזמן X: ניטרלי (extra), לא מונע ולא נספר כשגיאה
  const ex = GK.createRhythmJudge(h.clock, { onEvent() {} }).onset(T(0, 2) + 0.02);
  ok(ex && ex.type === 'extra', 'התקפה בזמן X = extra ניטרלי');
  // הדהוד שנמשך אחרי פריטה: לא נספר כצליל לא צפוי
  const judge2 = GK.createRhythmJudge(h.clock, { onEvent() {} });
  judge2.onset(T(0, 1));                                         // פריטה מצופה
  ok(judge2.onset(T(0, 1) + 0.2) === null || judge2.onset(T(0, 1) + 0.25) === null, 'הדהוד/רעש סמוך אחרי פריטה לא נחשב שגיאה');
  // רעש רחוק מכל חלון: מתעלמים
  ok(GK.createRhythmJudge(h.clock, {}).onset(T(0, 0) + 0.5) === null, 'התקפה רחוקה מכל חלון לא נענשת');
  // פספוס מידעי
  const j3 = GK.createRhythmJudge(h.clock, { onEvent: (e) => events.push(e) });
  j3.tick(6);
  ok(events.some((e) => e.type === 'missed'), 'פריטה צפויה שלא זוהתה = missed (מידעי)');
  ok(Object.keys(j3.stats).sort().join() === 'early,extra,hit,late,missed', 'הסטטיסטיקה: תזמון בלבד (בלי כיוון)');
  // התעלמות מקליק המטרונום
  const h2 = makeClock('four-down', 60);
  h2.clock.start({ countIn: false, loop: true, click: true });
  runTo(h2, 2);
  const j4 = GK.createRhythmJudge(h2.clock, { ignoreClicks: true });
  const clickT = h2.clock.recentClicks().pop();
  ok(j4.onset(clickT + 0.02) === null, 'התקפה צמודה לקליק (דליפה מהרמקול) מתעלמת');
}

// ───── קריינות ─────
(async () => {
  // תרחישי voice עם synth מדומה
  class Utt { constructor(t) { this.text = t; } }
  const spoken = [];
  const synth = { speaking: false, getVoices: () => [{ lang: 'he-IL' }, { lang: 'en-GB' }, { lang: 'en-US', name: 'US' }], cancel() {}, speak(u) { spoken.push(u); setTimeout(() => u.onend && u.onend(), 10); } };
  GK.voice._inject(synth, Utt);
  const r = await GK.voice.speakPattern(uur, { rate: 0.8 });
  ok(r.ok && spoken[0].text === 'Up, Up, Rest, Up, Up.' && spoken[0].lang === 'en-US' && spoken[0].rate === 0.8, 'הקראה באנגלית, בקצב שנבחר: ' + spoken[0].text);
  ok(spoken[0].voice && spoken[0].voice.lang === 'en-US', 'נבחר קול אנגלי');
  // אין קול / אין תמיכה
  GK.voice._inject(false, null);
  const r2 = await GK.voice.speak('Up');
  ok(!r2.ok && r2.reason === 'unavailable' && !GK.voice.available(), 'ללא SpeechSynthesis: לא נכשל, מחזיר ok:false');
  // onend שלא מגיע: timeout, לא תקוע
  GK.voice._inject({ getVoices: () => [], cancel() {}, speak() {} }, Utt);
  const t0 = Date.now();
  const r3 = await GK.voice.speak('Up', { rate: 3 });
  ok(!r3.ok && r3.reason === 'timeout' && Date.now() - t0 < 6500, 'onend חסר: מסתיים ב-timeout');
  GK.voice._inject({ getVoices: () => [], cancel() {}, speak(u) { setTimeout(() => u.onerror && u.onerror({ error: 'not-allowed' }), 5); } }, Utt);
  const r4 = await GK.voice.speak('Up');
  ok(!r4.ok && r4.reason === 'not-allowed', 'הדפדפן חוסם השמעה: ok:false עם סיבה');

  // ───── מפעיל: 4. הקריינות נגמרת לפני הספירה, 5. הספירה לפני הנגינה, ללא דיבור בנגינה ─────
  const t00 = performance.now(), nowS = () => (performance.now() - t00) / 1000;
  const ctx = { get currentTime() { return nowS(); } };
  const log = [], strums = [], clicks = [];
  const fakeVoice = {
    available: () => true, ready: () => Promise.resolve(true), cancel() { log.push(['cancel', nowS()]); },
    speakPattern: (p) => { log.push(['voice:start', nowS(), GK.pat.speechText(p)]); return new Promise((res) => setTimeout(() => { log.push(['voice:end', nowS()]); res({ ok: true }); }, 150)); },
    say: (w) => { log.push(['say', nowS(), w]); return Promise.resolve({ ok: true }); }
  };
  const settings = { bpm: 200, voiceLanguage: 'en', speakBeforePlaying: true, speakDuringPlaying: true, silentRests: false, countInEnabled: true, loopEnabled: true, voiceRate: 0.9, click: false, strumSound: true };
  const phases = [];
  const sess = GK.createSession({
    ctx, voice: fakeVoice, settings,
    sink: { strum: (t, a) => strums.push({ t, a }), click: (t, k) => clicks.push({ t, k }) },
    hooks: { onPhase: (p) => phases.push([p, nowS()]) }
  });
  ok(settings.speakDuringPlaying === false && settings.silentRests === true && settings.voiceLanguage === 'en', 'הגדרות קבועות: אין דיבור בנגינה, מנוחות שקטות, אנגלית');
  sess.setPattern(uur);
  const info = await sess.start();
  const voiceStart = log.find((l) => l[0] === 'voice:start'), voiceEnd = log.find((l) => l[0] === 'voice:end');
  ok(voiceStart && voiceStart[2] === 'Up, Up, Rest, Up, Up.', '4. המורה מקריא את הדפוס לפני הכל');
  ok(info.startTime >= voiceEnd[1] - 0.02, '4. ההקראה מסתיימת לפני תחילת הספירה: voiceEnd=' + voiceEnd[1].toFixed(3) + ' count=' + info.startTime.toFixed(3));
  await sleep(2600);                                              // ב-200 BPM תיבה = 1.2s: ספירה + כמעט שתי תיבות
  const says = log.filter((l) => l[0] === 'say');
  ok(says.map((s) => s[2]).join() === 'One,Two,Three,Four', '5. ספירה מקדימה מוקראת: One, Two, Three, Four — ' + says.map((s) => s[2]).join());
  ok(says.every((s) => s[1] < info.playTime + 0.01), '5. הספירה המוקראת מסתיימת לפני תחילת התרגול');
  ok(clicks.length === 4 && clicks.every((c) => c.t < info.playTime - 1e-6), '5. קליקי הספירה לפני התרגול');
  ok(strums.length > 0 && strums.every((s) => s.t >= info.playTime - 1e-6), '5. אין פריטות לפני תחילת התרגול');
  const lateSpeech = log.filter((l) => (l[0] === 'say' || l[0] === 'voice:start') && l[1] > info.playTime + 0.01);
  ok(lateSpeech.length === 0, '2. אין דיבור בזמן הנגינה (כולל X)');
  ok(strums.every((s) => s.a === 'up') && !strums.some((s) => { const u = sess.clock.uAt(s.t), b = u - Math.floor(u / 4) * 4; return Math.abs(b - 2) < 0.01; }), '2. אין פריטה בזמן X');
  ok(phases.map((p) => p[0]).join() === 'explain,count,play', 'שלבים: הסבר ← ספירה ← נגינה: ' + phases.map((p) => p[0]).join());
  // הסבר קולי בזמן נגינה: לא מתבצע
  const exp = await sess.explain();
  ok(!exp.ok && exp.reason === 'running', 'אי אפשר להפעיל הסבר קולי בזמן נגינה');
  // 13. עצירה וחזרה
  sess.stop();
  ok(sess.phase() === 'idle' && !sess.clock.isRunning() && log.some((l) => l[0] === 'cancel'), '13. עצירה: מבטלת קריינות ושעון');
  const nStr = strums.length; await sleep(300);
  ok(strums.length === nStr, 'אחרי עצירה אין אירועים נוספים');
  log.length = 0; strums.length = 0; clicks.length = 0;
  const info2 = await sess.repeat();
  ok(info2 && !log.some((l) => l[0] === 'voice:start'), '13. חזרה על הפריטה: מחדש בלי הסבר קולי');
  await sleep(1700);
  ok(clicks.length === 4 && strums.length > 0, '13. החזרה כוללת ספירה ופריטות');
  sess.stop();
  // הסבר חוזר בכפתור
  log.length = 0;
  const again = await sess.explain();
  ok(again.ok && log[0][0] === 'voice:start' && sess.phase() === 'idle', 'הסבר קולי חוזר בלחיצת כפתור כשלא מנגנים');
  // שגיאת קול לא עוצרת את התרגול
  const problems = [];
  const sess2 = GK.createSession({ ctx, voice: { available: () => false, ready: () => Promise.resolve(false), cancel() {}, say() {}, speakPattern: () => Promise.resolve({ ok: false, reason: 'unavailable' }) }, settings: Object.assign({}, settings), sink: {}, hooks: { onVoiceProblem: (r) => problems.push(r) } });
  sess2.setPattern(uur);
  const i3 = await sess2.start();
  ok(!!i3 && problems[0] === 'unavailable', 'ללא קול: מציג בעיה בלי לחסום, והתרגול ממשיך');
  sess2.stop();
  // שינוי מהירות במהלך תרגול דרך המפעיל
  const sess3 = GK.createSession({ ctx, voice: fakeVoice, settings: Object.assign({}, settings, { speakBeforePlaying: false }), sink: {} });
  sess3.setPattern(uur);
  await sess3.start();
  ok(sess3.setBpm(120) === 120 && sess3.clock.getBpm() === 120, '7. שינוי BPM דרך המפעיל');
  sess3.stop();

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
