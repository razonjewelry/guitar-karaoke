/*
 * ייבוא שיר מטקסט שהודבק (למשל מעמוד אקורדים באתר כמו Tab4U) → פורמט ChordPro-קל של האפליקציה.
 * אין כאן שום גישה לאתרים: המשתמש מעתיק מהדפדפן ומדביק. לא ממציאים מילים, אקורדים, קצב או פריטה —
 * מה שלא מופיע במקור נשאר ריק (והאפליקציה אומרת "לא ידוע"). טהור (בלי דפדפן): נבדק ב-Node.
 *
 * מזהה: שורות אקורדים מעל שורות מילים (מיזוג לפי עמודה), אקורדים (#/b, 7, maj7, sus4, dim, aug, add9, סלאש), כותרות קטעים,
 * קאפו, טונליות, משקל, חזרות (x2), שורות ריקות. כיוון: RTL (ברירת מחדל לעברית) או LTR.
 */
(function () {
  var GK = (window.GK = window.GK || {});

  var CHORD = /^[A-G][#b♯♭]?(?:maj|min|dim|aug|sus|add|m|M|\+|°|ø)?(?:maj)?[0-9]*(?:(?:sus|add|b|#|♯|♭|dim|aug|maj)?[0-9]+)*(?:\([^)]*\))?(?:\/[A-G][#b♯♭]?)?$/;
  var SECTION_RE = /^[\[(]?\s*(בית|פזמון|גשר|מעבר|פתיחה|סיום|אינטרו|אאוטרו|סולו|קודה|verse|chorus|bridge|intro|outro|solo|pre-?chorus|refrain|interlude|coda)\s*\d*\s*[\])]?\s*:?\s*$/i;

  function normChord(tok) {
    var t = tok.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/[()]/g, function (c) { return c; });
    t = t.replace(/^([A-G][#b]?)min/, '$1m').replace(/^([A-G][#b]?)M(?!aj)/, '$1maj').replace(/°/g, 'dim');
    return t;
  }
  function isChordTok(tok) { return CHORD.test(tok.replace(/[♯]/g, '#').replace(/[♭]/g, 'b')) ; }

  /** שורה היא "שורת אקורדים" אם כל האסימונים בה אקורדים (או מפרידים כמו | - x2) ויש לפחות אחד */
  function chordLine(line) {
    var toks = line.trim().split(/\s+/).filter(Boolean), n = 0;
    if (!toks.length) return null;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (/^[|\-–—.:\/\\x×0-9]+$/i.test(t) || /^\(?x\d+\)?$/i.test(t)) continue;
      if (!isChordTok(t)) return null;
      n++;
    }
    return n ? true : null;
  }

  /** מיקומי האקורדים בשורה: [{c, col}] לפי עמודת התו */
  function chordCols(line) {
    var out = [], re = /\S+/g, m;
    while ((m = re.exec(line))) if (isChordTok(m[0])) out.push({ c: normChord(m[0]), col: m.index, end: m.index + m[0].length });
    return out;
  }

  function stripMarks(s) { return s.replace(/[‎‏‪-‮⁦-⁩]/g, ''); }

  /** ממזג שורת אקורדים + שורת מילים: מכניס [אקורד] לפני המילה שמתחתיו. mode: 'rtl' | 'ltr' */
  function merge(chordsLn, lyricLn, mode) {
    var cols = chordCols(chordsLn), text = lyricLn.replace(/\s+$/, '');
    if (!cols.length) return text;
    var W = Math.max(text.length, chordsLn.replace(/\s+$/, '').length) + 1;
    // בעמוד RTL שהודבק, העמודה הפיזית משתקפת: אקורד בקצה הימני של השורה שייך לתחילת המילים.
    var pts;
    if (mode === 'rtl') pts = cols.map(function (x) { return { c: x.c, idx: Math.round((1 - (x.col + x.end) / 2 / W) * text.length) }; });
    else pts = cols.map(function (x) { return { c: x.c, idx: Math.min(text.length, x.col) }; });
    // מצמידים לתחילת מילה: לא חותכים מילה באמצע
    pts.forEach(function (p) {
      var i = Math.max(0, Math.min(text.length, p.idx));
      if (i > 0 && i < text.length && /\S/.test(text[i - 1]) && /\S/.test(text[i])) {
        var L = text.lastIndexOf(' ', i - 1) + 1, R = text.indexOf(' ', i);
        i = (i - L <= (R < 0 ? text.length : R) - i) ? L : (R < 0 ? text.length : R + 1);
      }
      p.idx = i;
    });
    pts.sort(function (a, b) { return a.idx - b.idx; });
    var out = '', last = 0;
    pts.forEach(function (p) { out += text.slice(last, p.idx) + '[' + p.c + ']'; last = p.idx; });
    return out + text.slice(last);
  }

  var CHROME = /(tab4u|הוסף למועדפים|שתף|הדפס|פרסומת|advertisement|קרדיט|תגובות|למעלה|©|copyright|כל הזכויות|הצג אקורדים|מנוע חיפוש|עוד שירים|שירים נוספים|דרג|ציון|עריכה|הקלד)/i;

  /**
   * text: הטקסט שהודבק. opt: {mode:'rtl'|'ltr', title, artist}.
   * מחזיר {song: טקסט ChordPro, title, artist, warnings, stats}
   */
  GK.importPaste = function (text, opt) {
    opt = opt || {};
    var mode = opt.mode || 'rtl';
    var raw = stripMarks(String(text || '')).replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
    var warnings = [], out = [], meta = { capo: 0, time: null, key: null };
    var title = opt.title || '', artist = opt.artist || '';
    var i = 0, nChordLines = 0, nMerged = 0, nLyrics = 0, prevBlank = true, started = false;

    // כותרת: "שם השיר - אמן" / "אקורדים לשיר X של Y" בתחילת הטקסט (לא ממציאים אם אין)
    var titleIdx = -1;
    if (!title) {
      for (var k = 0; k < Math.min(raw.length, 8); k++) {
        var h = raw[k].trim();
        if (!h || chordLine(h) || CHROME.test(h) || SECTION_RE.test(h) || /^(קאפו|capo|טונליות|סולם|key|משקל|time)(?:\s|:|$)/i.test(h)) continue;
        var m = h.match(/^(?:אקורדים(?:\s+ל(?:שיר)?)?\s*)?(.+?)\s*(?:[-–—|]|של)\s*(.+)$/);
        titleIdx = k;
        if (m && h.length < 80) { title = m[1].replace(/^אקורדים\s*(?:ל(?:שיר)?)?\s*/, '').trim(); artist = artist || m[2].replace(/\s*[-–|].*$/, '').trim(); }
        else if (h.length < 60 && !/[.:,]$/.test(h)) title = title || h;
        break;
      }
    }

    while (i < raw.length) {
      var ln = raw[i], t = ln.trim();
      if (i === titleIdx) { i++; continue; }
      i++;
      if (!t) { if (started && !prevBlank) out.push(''); prevBlank = true; continue; }
      if (CHROME.test(t) && !chordLine(t) && t.length < 60 && !started) continue;
      var mm;
      if ((mm = t.match(/^(?:קאפו|capo)\s*[:\-]?\s*(\d+)/i))) { meta.capo = parseInt(mm[1], 10); continue; }
      if ((mm = t.match(/^(?:טונליות|סולם|key)\s*[:\-]?\s*([A-G][#b]?m?)\s*$/i))) { meta.key = mm[1]; continue; }
      if ((mm = t.match(/^(?:משקל|time)\s*[:\-]?\s*(\d\/\d)\s*$/i))) { meta.time = mm[1]; continue; }
      if (SECTION_RE.test(t)) {
        var label = t.replace(/^[\[(]\s*|\s*[\])]$|:$/g, '').trim();
        out.push('{section: ' + label + '}');
        started = true; prevBlank = true; continue;
      }
      if (chordLine(ln)) {
        nChordLines++;
        var rep = (t.match(/x\s*(\d+)|(\d+)\s*x/i) || [])[1] || (t.match(/(\d+)\s*x/i) || [])[1];
        var nxt = raw[i];
        // שורת מילים צמודה (לא ריקה, לא שורת אקורדים, לא כותרת קטע)?
        if (nxt !== undefined && nxt.trim() && !chordLine(nxt) && !SECTION_RE.test(nxt.trim())) {
          out.push(merge(ln, nxt, mode)); i++; nMerged++; started = true; prevBlank = false;
        } else {
          // שורת אקורדים בלי מילים (אינטרו/סיום): תיבה לכל אקורד
          var cs = chordCols(ln).map(function (x) { return '[' + x.c + ']'; }).join(' ');
          out.push(cs + (rep ? '' : ''));
          if (rep && +rep > 1 && +rep <= 4) for (var r = 1; r < +rep; r++) out.push(cs);
          started = true; prevBlank = false;
        }
        continue;
      }
      // שורת מילים בלבד (בלי אקורדים) — נשמרת כפי שהיא
      if (CHROME.test(t) && t.length < 40) continue;
      nLyrics++;
      out.push(t); started = true; prevBlank = false;
    }
    while (out.length && out[out.length - 1] === '') out.pop();

    if (!nChordLines) warnings.push('לא זוהו שורות אקורדים בטקסט. ודא שהעתקת את העמוד עם האקורדים, או הוסף אותם ידנית בעורך.');
    else if (nChordLines > nMerged && nLyrics === 0) warnings.push('זוהו אקורדים בלי מילים (ייתכן שרק אינטרו).');
    if (nMerged && mode === 'rtl') warnings.push('מיקום האקורדים מעל המילים נקבע לפי יישור משמאל-לימין/ימין-לשמאל משוער. עבור על התצוגה המקדימה ותקן ידנית אם צריך.');

    var head = [];
    head.push('{title: ' + (title || 'שיר מיובא') + '}');
    if (artist) head.push('{artist: ' + artist + '}');
    if (meta.time) head.push('{time: ' + meta.time + '}');
    if (meta.capo) head.push('{capo: ' + meta.capo + '}');
    if (meta.key) head.push('{key: ' + meta.key + '}');
    head.push('{note: יובא מטקסט שהודבק — המילים והאקורדים כפי שהם במקור}');
    return {
      song: head.join('\n') + '\n\n' + out.join('\n') + '\n',
      title: title, artist: artist, capo: meta.capo, time: meta.time, key: meta.key,
      warnings: warnings, stats: { chordLines: nChordLines, merged: nMerged, lyricLines: nLyrics }
    };
  };

  /** כתובת חיפוש ב-Tab4U (נפתחת בלשונית חדשה על ידי המשתמש; האפליקציה לא קוראת את האתר) */
  GK.tab4uSearchUrl = function (q) { return 'https://www.tab4u.com/resultsSimple?tab=songs&q=' + encodeURIComponent(q); };

  /** תוכן שהגיע מ-Web Share Target: title/text/url */
  GK.shareToText = function (p) {
    var parts = [];
    if (p.text) parts.push(p.text);
    return { text: parts.join('\n'), title: p.title || '', url: p.url || '' };
  };
})();
