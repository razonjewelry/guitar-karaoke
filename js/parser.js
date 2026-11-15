/*
 * פרסר שירים בפורמט ChordPro-קל:
 *   {title: ..} {artist: ..} {bpm: 90} {time: 4/4} {capo: 2} {strum: D - D U - U D U}
 *   {bars: 2}  {section: בית}  {note: ..}   |   [Am]מילים [C]עם אקורדים   |2  (תיבות לשורה)
 * שורה ריקה = רווח; שורה שמתחילה ב-# = הערה.
 */
(function () {
  var GK = (window.GK = window.GK || {});

  // q = רבעים בתיבה, slots = שמיניות בתיבה, acc = שמיניות מודגשות (לחיצות מטרונום)
  var TIME = {
    '4/4': { q: 4, slots: 8, acc: [0, 2, 4, 6], labels: ['1', '&', '2', '&', '3', '&', '4', '&'], def: 'D - D U - U D U' },
    '3/4': { q: 3, slots: 6, acc: [0, 2, 4], labels: ['1', '&', '2', '&', '3', '&'], def: 'D - D U D U' },
    '6/8': { q: 3, slots: 6, acc: [0, 3], labels: ['1', '2', '3', '4', '5', '6'], def: 'D - U D - U' },
    '2/4': { q: 2, slots: 4, acc: [0, 2], labels: ['1', '&', '2', '&'], def: 'D - D U' }
  };
  GK.TIME = TIME;

  /** "D - D U" -> ['D','-','D','U'] מרופד/חתוך לאורך slots. סימנים: D מטה, U מעלה, - מנוחה, X השתקה */
  function parseStrum(str, slots) {
    var out = String(str).trim().split(/\s+/).filter(Boolean).map(function (t) {
      var c = t.toUpperCase();
      if (c === 'D' || t === '↓') return 'D';
      if (c === 'U' || t === '↑') return 'U';
      if (c === 'X' || t === '×') return 'X';
      return '-';
    });
    while (out.length < slots) out.push('-');
    return out.slice(0, slots);
  }

  /** מפרק שורת מילים לקטעים: [{c: אקורד|null, t: טקסט}] ואת מספר התיבות אם צוין ב-|N */
  function parseLyricLine(raw) {
    var bars = null;
    var m = raw.match(/\s*\|\s*(\d+)\s*$/);
    if (m) { bars = parseInt(m[1], 10); raw = raw.slice(0, m.index); }
    var segs = [];
    var cur = { c: null, t: '' };
    var i = 0;
    while (i < raw.length) {
      if (raw[i] === '[') {
        var j = raw.indexOf(']', i);
        if (j > i) {
          if (cur.c !== null || cur.t !== '') segs.push(cur);
          cur = { c: raw.slice(i + 1, j).trim() || null, t: '' };
          i = j + 1;
          continue;
        }
      }
      cur.t += raw[i];
      i++;
    }
    if (cur.c !== null || cur.t !== '') segs.push(cur);
    segs.forEach(function (s) { s.t = s.t.replace(/\s+/g, ' '); });
    if (segs.length) {
      segs[0].t = segs[0].t.replace(/^\s+/, '');
      var last = segs[segs.length - 1];
      last.t = last.t.replace(/\s+$/, '');
    }
    return { segs: segs, bars: bars };
  }

  /** מחשב לכל קטע ולכל מילה את מיקומה היחסי (0..1) בתוך השורה — לצביעת קריוקי */
  function layoutLine(line) {
    var total = 0;
    line.segs.forEach(function (s) {
      s.wgt = Math.max(2, s.t.replace(/\s/g, '').length);
      total += s.wgt;
    });
    var acc = 0;
    line.segs.forEach(function (s) {
      s.f0 = total ? acc / total : 0;
      acc += s.wgt;
      s.f1 = total ? acc / total : 1;
      var letters = s.t.replace(/\s/g, '').length || 1;
      var pos = 0;
      s.parts = s.t.split(/(\s+)/).filter(function (p) { return p !== ''; }).map(function (p) {
        if (/^\s+$/.test(p)) return { t: p, w: false };
        var f0 = s.f0 + (s.f1 - s.f0) * (pos / letters);
        pos += p.length;
        return { t: p, w: true, f0: f0 };
      });
    });
  }

  /** מפרסר טקסט שיר שלם לאובייקט שיר. meta: {id, builtin} */
  GK.parseSong = function (text, meta) {
    meta = meta || {};
    var song = {
      id: meta.id || null, builtin: !!meta.builtin, text: String(text),
      title: '', artist: '', timeKnown: false, strumDeclared: false, strumVerified: false, bpm: 90, time: '4/4', capo: 0, note: '', lines: [], chords: [], warnings: []
    };
    var T = TIME['4/4'];
    var strumStr = null, defBars = 2, pendingSection = null, gap = false, prevKey = null;

    song.text.replace(/\r/g, '').split('\n').forEach(function (row, ri) {
      var s = row.replace(/\s+$/, '');
      if (!s.trim()) { gap = true; return; }
      if (s.trim()[0] === '#') return;
      var d = s.trim().match(/^\{\s*([A-Za-z_]+)\s*:?\s*(.*?)\s*\}$/);
      if (d) {
        var key = d[1].toLowerCase(), val = d[2], n;
        if (key === 'title' || key === 'artist' || key === 'note') song[key] = val;
        else if (key === 'bpm') { n = parseFloat(val); if (n >= 30 && n <= 240) song.bpm = n; else song.warnings.push('שורה ' + (ri + 1) + ': bpm חייב להיות בין 30 ל-240'); }
        else if (key === 'time') { if (TIME[val]) { song.time = val; song.timeKnown = true; T = TIME[val]; } else song.warnings.push('שורה ' + (ri + 1) + ': קצב לא נתמך ' + val + ' (4/4, 3/4, 6/8, 2/4)'); }
        else if (key === 'capo') song.capo = parseInt(val, 10) || 0;
        else if (key === 'strum') { strumStr = val; song.strumDeclared = true; }
        else if (key === 'strumsrc') song.strumVerified = /^(original|verified|מקור)$/i.test(val);
        else if (key === 'bars') { n = parseInt(val, 10); if (n >= 1 && n <= 8) defBars = n; else song.warnings.push('שורה ' + (ri + 1) + ': bars בין 1 ל-8'); }
        else if (key === 'section') { pendingSection = val; gap = true; }
        else if (key !== 'key') song.warnings.push('שורה ' + (ri + 1) + ': הנחיה לא מוכרת {' + d[1] + '}');
        return;
      }
      var pl = parseLyricLine(s.trim());
      var strum = parseStrum(strumStr || T.def, T.slots);
      var pkey = strum.join('');
      var line = {
        i: song.lines.length, section: pendingSection, gap: gap, bars: pl.bars || defBars,
        strum: strum, strumChanged: pkey !== prevKey, segs: pl.segs
      };
      prevKey = pkey; pendingSection = null; gap = false;
      layoutLine(line);
      song.lines.push(line);
      pl.segs.forEach(function (c) { if (c.c && song.chords.indexOf(c.c) < 0) song.chords.push(c.c); });
    });

    if (!song.title) song.title = 'ללא שם';
    song.q = T.q; song.slots = T.slots; song.acc = T.acc; song.labels = T.labels;
    return song;
  };
})();
