// בדיקות ייבוא (הדבקה → ChordPro), פרסור אקורדים מורחב, ושמירה מקומית של שיר מיובא.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const sb = { console, Math }; sb.window = sb; vm.createContext(sb);
['js/util.js', 'js/chords-db.js', 'js/parser.js', 'js/fft.js', 'js/chroma.js', 'js/importer.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sb, { filename: f }));
const GK = sb.GK; let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

// 10. עברית + אקורדים בסדר הנכון (מעל המילים, LTR)
const txt = ['שיר בדיקה - אמן לדוגמה', 'קאפו 3', 'בית', 'Am         G', 'שלום עולם גדול', 'F        C', 'ואנחנו כאן יחד'].join('\n');
const r = GK.importPaste(txt, { mode: 'ltr' });
const s = GK.parseSong(r.song);
ok(s.title === 'שיר בדיקה' && s.artist === 'אמן לדוגמה' && s.capo === 3, 'כותרת, אמן וקאפו זוהו: ' + s.title + '/' + s.artist + '/' + s.capo);
ok(s.chords.join() === 'Am,G,F,C', 'אקורדים לפי הסדר: ' + s.chords.join());
ok(s.lines[0].segs[0].c === 'Am' && s.lines[0].segs[0].t.startsWith('שלום'), 'Am מעל תחילת "שלום"');
ok(s.lines[0].segs.map((x) => x.t).join('').replace(/\s+/g, ' ').trim() === 'שלום עולם גדול', 'המילים לא נפגעו ולא נוספו מילים');
ok(s.lines[1].segs.map((x) => x.t).join('').replace(/\s+/g, ' ').trim() === 'ואנחנו כאן יחד', 'שורה שנייה תקינה');
ok(s.section === undefined && s.lines[0].section === 'בית', 'קטע "בית" נשמר');
ok(s.timeKnown === false, 'משקל לא ידוע כשלא מופיע במקור (לא ממציאים)');
ok(s.strumVerified === false && s.strumDeclared === false, 'אין פריטת מקור (לא ממציאים)');
// אקורדים מורחבים
['Cmaj7', 'Dsus4', 'Dsus2', 'G/B', 'F#m7', 'Bb', 'E5', 'Bdim', 'Caug', 'Cadd9', 'A7sus4', 'Bm7b5'].forEach((c) => ok(!!GK.chroma.parseChord(c), 'parseChord ' + c));
ok(!GK.chroma.parseChord('H') && !GK.chroma.parseChord('Xm'), 'אקורד לא חוקי נדחה');
const r2 = GK.importPaste('Cmaj7  Dsus4  G/B  F#m7  Bb\nמילים כאן ועוד', { mode: 'ltr' });
ok(GK.parseSong(r2.song).chords.join() === 'Cmaj7,Dsus4,G/B,F#m7,Bb', 'ייבוא אקורדים מורחבים: ' + GK.parseSong(r2.song).chords.join());
// חזרות
const r3 = GK.importPaste('Am G F C x2', {});
ok(GK.parseSong(r3.song).lines.length === 2, 'x2 מתפרש לשתי שורות');
// קלט ללא אקורדים: אזהרה, לא המצאה
const r4 = GK.importPaste('שורה אחת\nשורה שנייה', {});
ok(r4.warnings.length > 0 && GK.parseSong(r4.song).chords.length === 0, 'טקסט בלי אקורדים: אזהרה ובלי אקורדים מומצאים');
// משקל במקור
const r5 = GK.importPaste('משקל 3/4\nAm\nלה לה', { mode: 'ltr' });
ok(GK.parseSong(r5.song).timeKnown && GK.parseSong(r5.song).time === '3/4', 'משקל שמופיע במקור נקלט');
// שורת אקורדים לא מתבלבלת עם מילים אנגליות
ok(GK.importPaste('Am\nAbout love', { mode: 'ltr' }).stats.merged === 1 && GK.importPaste('A day\nAbout love', { mode: 'ltr' }).stats.chordLines === 0, 'מילים באנגלית לא נחשבות אקורדים');
// RTL: האקורד הימני שייך לתחילת המילים
const r6 = GK.importPaste('                 Am\nשלום עולם', { mode: 'rtl' });
ok(GK.parseSong(r6.song).lines[0].segs[0].c === 'Am' || GK.parseSong(r6.song).lines[0].segs[0].t === '' , 'יישור RTL: אקורד בקצה הימני צמוד לתחילת השורה');

// ───── אנגלית: Ultimate-Guitar-style, זיהוי אוטומטי של כיוון, ChordPro בתוך השורה ─────
{
  const ug = ['Let It Be Chords by The Beatles', 'Tuning: Standard', 'Capo: 2nd fret', '[Verse 1]', '[ch]C[/ch]           [ch]G[/ch]', 'When I find myself in times of trouble', '[ch]Am[/ch]        [ch]F[/ch]', 'Mother Mary comes to me', 'e|---0---1---|', 'B|---1---0---|'].join('\n');
  const e = GK.importPaste(ug, {});                 // בלי mode: אוטומטי → LTR
  const es = GK.parseSong(e.song);
  ok(es.title === 'Let It Be' && es.artist === 'The Beatles', 'כותרת/אמן מ-"X Chords by Y": ' + es.title + '/' + es.artist);
  ok(es.capo === 2, 'קאפו מ-"2nd fret": ' + es.capo);
  ok(es.chords.join() === 'C,G,Am,F', 'אקורדים עם תגי [ch]: ' + es.chords.join());
  ok(es.lines[0].segs[0].c === 'C' && es.lines[0].segs[0].t.startsWith('When'), 'C בתחילת "When" (LTR אוטומטי)');
  ok(!/e\|---/.test(e.song) && !/Tuning/.test(e.song), 'שורות טאב ו-Tuning הוסרו');
  const cp = GK.importPaste('{title: Test Song}\n[C]Hello [G]world [Am]how are [F]you\n[C]Fine [G]thanks [Am]and [F]you', {});
  const cps = GK.parseSong(cp.song);
  ok(cps.title === 'Test Song' && cps.chords.join() === 'C,G,Am,F', 'ChordPro בתוך השורה עובר כמו שהוא: ' + cps.chords.join());
}
// כתובת חיפוש
ok(GK.tab4uSearchUrl('אמן שיר').startsWith('https://www.tab4u.com/resultsSimple?tab=songs&q=%D7'), 'כתובת חיפוש Tab4U');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
