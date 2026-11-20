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

  /** האם רוב האותיות בטקסט לטיניות (אנגלית) — אז היישור הוא משמאל לימין */
  function isMostlyLatin(t) {
    var he = (t.match(/[\u0590-\u05FF]/g) || []).length, la = (t.match(/[A-Za-z]/g) || []).length;
    return la > he * 2;
  }
  /** ניקוי סימוני אתרי אקורדים באנגלית: [ch]C[/ch], [tab]…[/tab], שורות טאב (e|--3--|) */
  function cleanEnglishMarkup(t) {
    t = t.replace(/\[\/?ch\]/gi, '').replace(/\[\/?tab\]/gi, '');
    return t.split('\n').filter(function (l) { return !/^\s*[eEBGDAa]\|?[-0-9hpbrx\/\~|().]{6,}\s*$/.test(l) && !/^\s*(tuning|difficulty|rating|views|author|submitted|last edit)\b/i.test(l); }).join('\n');
  }
  /** טקסט שכבר בפורמט ChordPro (אקורדים בתוך השורה [C]) ובלי שורות אקורדים נפרדות */
  function inlineChordpro(t) {
    var inl = (t.match(/\[[A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?[0-9]*(?:\/[A-G][#b]?)?\]/g) || []).length;
    if (inl < 4) return false;
    var only = t.split('\n').filter(function (l) { return chordLine(l); }).length;
    return only < 2;
  }
  // ───── עיבוד מקדים חכם: פריטה מהמקור, שורות "Intro: Am - G", ואקורדים שנדבקו למילים ─────
  var CH_RE = '[A-G](?:#|b)?(?:maj7|maj9|maj|m7b5|m7|m9|m6|m|7sus4|sus2|sus4|sus|dim7|dim|aug|add9|add|6|7|9|11|13|5)?(?:\/[A-G](?:#|b)?)?';
  var GLUE = new RegExp('^(' + CH_RE + ')(.+)$');
  var LABEL = /^\s*(intro|outro|interlude|instrumental|solo|verse|chorus|bridge|pre-?chorus|ending|פתיחה|סיום|מעבר|סולו|פזמון|בית)\s*\d*\s*[:\-–]\s*(.+)$/i;
  var COMMON = {};
  ('the and to of in is it you that he was for on are with as his they be at one have this from or had by but what all were we when your can said there an each ' +
   'which she do how their if will up out many then them these so some her would make like him into time has look two more go see no way could my me than first been ' +
   'call who its now find long down day did get come made may part over new love heart night light know never away again home feel baby say just only still where here ' +
   'round through old cold sweet blue sky eyes life world dream rain sun moon road soul free fire tonight tomorrow yesterday alone wind hair air river morning valley ' +
   'song sing dance let take give hold hand hands man woman girl boy good bad little big young yeah oh ooh la na hey well back ever every always cause mind town city ' +
   'sea tears cry friend friends bring sometimes kiss arms wild walk run fly high low slow slowly lost found wanna gonna gotta our us out off end last same live die ' +
   'god lord shine stars star fall rise rising open door window wall street car train name words word true lie lies hope pain hurt sound silence tell told talk ' +
   'heaven hell place face room year voice head sight dim she he his her him they them their there then than this that these those were was ' +
   'stay leave left right wrong best better there\'s i\'m don\'t can\'t won\'t it\'s you\'re she\'s he\'s we\'re they\'re that\'s what\'s').split(/\s+/).forEach(function (w) { COMMON[w] = 1; });
  function isHebrewCh(c) { return /[\u05D0-\u05EA]/.test(c); }
  /** מפריד אקורד שנדבק לתחילת מילה. strong = ודאי; weak = רק אם בטקסט יש הרבה ודאיים */
  function glueKind(tok, first, prevTok) {
    var m = GLUE.exec(tok); if (!m) return null;
    var ch = m[1], rest = m[2], c0 = rest[0];
    if (!/[A-Za-z\u05D0-\u05EA'"(]/.test(c0)) return null;
    if (isHebrewCh(c0)) return { ch: ch, rest: rest, strong: true };
    if (/['"(]/.test(c0) && /^['"(]+[A-Zא-ת]/.test(rest)) return { ch: ch, rest: rest, strong: true };   // A"We… — אקורד לפני מירכאות
    var fancy = /[#b0-9\/]|sus|maj|dim|aug|add/.test(ch.slice(1));
    if (/[A-Z]/.test(c0)) {
      if (rest.length > 1 && !/[a-z]/.test(rest)) return null;          // מילה באותיות גדולות (BABY) — לא אקורד
      return { ch: ch, rest: rest, strong: true };
    }
    if (fancy) return { ch: ch, rest: rest, strong: true };
    if (first || (prevTok && /[.!?]$/.test(prevTok))) return null;       // תחילת משפט: מילה רגילה באות גדולה (Every, And)
    // באמצע שורה, אות גדולה ואחריה קטנות: אקורד דבוק (Erising) או שם פרטי (California)? רק אם השארית נראית כמו מילה
    var w = rest.toLowerCase().replace(/[^a-z']+$/, '');
    if (!(COMMON[w] || (w.length >= 4 && /(ing|ed|ly|ness|less|ful)$/.test(w)))) return null;
    return { ch: ch, rest: rest, strong: false };
  }
  function preprocess(text) {
    var lines = text.replace(/\r/g, '').split('\n'), out = [], strumNote = '', strong = 0, known = {};
    // סבב 1: סופרים אקורדים דבוקים ודאיים כדי להחליט אם הטקסט בכלל בפורמט הזה, ואוספים את האקורדים של השיר
    lines.forEach(function (l) {
      var lm = l.trim().match(LABEL), cl = chordLine(l) ? l : (lm && chordLine(lm[2].replace(/\([^)]*\)/g, '')) ? lm[2] : null);
      if (cl) { chordCols(cl).forEach(function (x) { known[x.c] = 1; }); return; }
      var toks = l.trim().split(/\s+/);
      toks.forEach(function (t, i) { var g = glueKind(t, i === 0, toks[i - 1]); if (g && g.strong) { strong++; known[normChord(g.ch)] = 1; } });
    });
    var glueOn = strong >= 3, glued = 0;
    var inlineOn = glueOn || (text.match(/\[[A-G][#b]?[^\]\s]{0,6}\]/g) || []).length >= 4;   // הטקסט בפורמט "אקורד בתוך השורה"
    var MID = new RegExp('([a-z\\u05D0-\\u05EA])(' + CH_RE + ')(?=[a-z\\u05D0-\\u05EA])', 'g');
    var PUNCT = new RegExp('([,.;:!?])(' + CH_RE + ')$');
    lines.forEach(function (l) {
      var t = l.trim(), m;
      if ((m = t.match(/^strum(?:ming)?(?:\s*pattern)?\s*[:\-]?\s*([dDuUxX][dDuUxX\/\s,.\-–]*)$/i))) {
        var seq = m[1].toUpperCase().match(/[DUX]/g) || [];
        strumNote = 'פריטה לפי המקור: ' + seq.map(function (x) { return x === 'D' ? '↓' : x === 'U' ? '↑' : 'X'; }).join(' ');
        return;
      }
      if ((m = t.match(LABEL)) && chordLine(m[2].replace(/\(\s*\d+\s*x\s*\)|\(\s*x\s*\d+\s*\)/ig, ''))) {
        out.push('{section: ' + m[1] + '}');
        out.push(inlineOn ? chordCols(m[2]).map(function (x) { return '[' + x.c + ']'; }).join(' ') : m[2]);
        return;
      }
      if (!glueOn || chordLine(l) || /^\s*\{/.test(l)) { out.push(l); return; }
      var toks = l.split(/(\s+)/), k = 0;
      out.push(toks.map(function (tok, i) {
        if (/^\s*$/.test(tok) || /\[/.test(tok)) return tok;
        var prev = null; for (var j = i - 1; j >= 0; j--) if (!/^\s*$/.test(toks[j])) { prev = toks[j]; break; }
        var first = k++ === 0, pm;
        // אקורד לבד באמצע שורת מילים ("G Welcome") — בטקסט דבוק זה תמיד אקורד; חוץ מ-"A" שהיא גם מילה
        if (isChordTok(tok) && known[normChord(tok)] && tok !== 'A') { glued++; return '[' + normChord(tok) + ']'; }
        // אקורד שנדבק אחרי סימן פיסוק ("candle,D")
        if ((pm = PUNCT.exec(tok)) && known[normChord(pm[2])]) { glued++; return tok.slice(0, pm.index + 1) + ' [' + normChord(pm[2]) + ']'; }
        var g = glueKind(tok, first, prev), res = tok;
        if (g && (g.strong || known[normChord(g.ch)])) { glued++; res = '[' + normChord(g.ch) + ']' + g.rest; }     // "California" לא מפוצל אם C לא מופיע בשיר
        // אקורד באמצע מילה ("CaliDfornia" → Cali[D]fornia): אות גדולה של אקורד מוכר בין אותיות קטנות
        return res.replace(MID, function (all, a, ch) { if (!known[normChord(ch)]) return all; glued++; return a + '[' + normChord(ch) + ']'; });
      }).join(''));
    });
    return { text: out.join('\n'), strumNote: strumNote, glued: glued };
  }

  /**
   * הדבקה עם עיצוב (text/html מהלוח): באתרי אקורדים האקורד הוא אלמנט נפרד בתוך שורת המילים
   * (למשל chordie: <span class="absc Bm">Bm</span>). ממירים כל אלמנט כזה ל-[Bm] במקום המדויק — בלי לנחש עמודות.
   * מחזיר טקסט (ChordPro או אקורדים-מעל-מילים) או null אם אין מבנה אקורדים.
   */
  GK.htmlToSongText = function (html) {
    if (!html || typeof DOMParser === 'undefined') return null;
    var doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,noscript,iframe,svg,button,select,input,[class*="bracket"]').forEach(function (e) { e.remove(); });
    var marked = 0;
    // אתרים "מובנים" (למשל נגנו): כל מילה בתא משלה — [נתיב אקורד][מילה]. מאחדים כל תא ל-"[Am]מילה " באותה שורה.
    var isCh = function (e) { var t = (e.getAttribute('data-chord') || e.textContent || '').trim(); return !!t && t.length <= 12 && isChordTok(t); };
    var cellOf = function (e) {
      if (e.children.length !== 2) return null;
      var lane = e.children[0], word = e.children[1], lt = lane.textContent.trim(), wt = word.textContent.trim();
      if (!wt || isChordTok(wt) || (lt && !isChordTok(lt))) return null;
      return { c: lt ? normChord((lane.querySelector('[data-chord]') || lane).getAttribute('data-chord') || lt) : '', w: word.textContent.replace(/\s+/g, ' ').trim() };
    };
    var cells = [];
    doc.querySelectorAll('body *').forEach(function (e) {
      var c = cellOf(e); if (!c || !e.parentElement) return;
      var sib = 0; for (var k = 0; k < e.parentElement.children.length; k++) if (cellOf(e.parentElement.children[k])) sib++;
      if (sib >= 2 || (c.c && e.parentElement.children.length === 1)) cells.push([e, c]);
    });
    cells.forEach(function (p) {
      if (!p[0].parentNode) return;
      if (p[1].c) marked++;
      p[0].replaceWith(doc.createTextNode((p[1].c ? '\u0001' + p[1].c + '\u0002' : '') + p[1].w + ' '));
    });
    doc.querySelectorAll('body *').forEach(function (el) {
      if (el.children.length) return;
      if (el.getAttribute('data-chord') && isCh(el) && !/\u0001/.test(el.textContent)) { el.textContent = '\u0001' + normChord(el.getAttribute('data-chord').trim()) + '\u0002'; marked++; return; }
      var t = (el.textContent || '').trim();
      if (!t || t.length > 12 || !isChordTok(t)) return;
      // אקורד שהוא אלמנט משלו (span/b/sup…). מסמנים אותו כאקורד בתוך השורה.
      el.textContent = '\u0001' + normChord(t) + '\u0002';
      marked++;
    });
    if (marked < 3) return null;
    var txt = nodeToText(doc.body);
    // שורה שכולה אקורדים (סגנון "אקורדים מעל המילים" בתוך <pre>): מחזירים לשמות רגילים כדי לשמור על העמודות
    txt = txt.split('\n').map(function (l) {
      var only = l.replace(/\u0001[^\u0002]*\u0002/g, '').replace(/[\s|\-–.:x0-9()]/gi, '') === '';
      return only ? l.replace(/\u0001([^\u0002]*)\u0002/g, '$1') : l.replace(/\u0001([^\u0002]*)\u0002\s*/g, '[$1]');
    }).join('\n');
    txt = txt.replace(/\[\s*(\[[^\]]+\])\s*\]/g, '$1');                   // [[Bm]] → [Bm] כשהסוגריים לא סומנו כ-bracket
    return txt;
  };

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
    text = cleanEnglishMarkup(String(text || ''));
    var pre = preprocess(text); text = pre.text;
    if (inlineChordpro(text)) {
      var cp = GK.chordproToSong(text, 'טקסט שהודבק');
      var song = cp.song;
      if (opt.title) song = song.replace(/^\{title: .*\}/, '{title: ' + opt.title + '}');
      if (opt.artist && !cp.artist) song = song.replace(/^(\{title: .*\})/, '$1\n{artist: ' + opt.artist + '}');
      if (pre.strumNote) song = song.replace(/\{note: /, '{note: ' + pre.strumNote + ' · ');
      if (opt.video) song = song.replace(/\{note: /, '{video: ' + opt.video + '}\n{note: ');
      return { song: song, title: cp.title, artist: cp.artist, capo: 0, time: null, key: null, warnings: pre.glued ? ['האקורדים היו צמודים למילים (כך מעתיקים מאתרים כמו chordie) — הופרדו אוטומטית. עבור על התצוגה המקדימה.'] : [], stats: { chordLines: 0, merged: 0, lyricLines: 0, glued: pre.glued } };
    }
    var mode = opt.mode && opt.mode !== 'auto' ? opt.mode : (isMostlyLatin(text) ? 'ltr' : 'rtl');
    var raw = stripMarks(String(text || '')).replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
    var video = opt.video || '';
    raw = raw.filter(function (l) { var y = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)[^\s]*/i.exec(l); if (y) { video = video || y[0]; return false; } return true; });
    var warnings = [], out = [], meta ={ capo: 0, time: null, key: null };
    var title = opt.title || '', artist = opt.artist || '';
    var i = 0, nChordLines = 0, nMerged = 0, nLyrics = 0, prevBlank = true, started = false;

    // כותרת: "שם השיר - אמן" / "אקורדים לשיר X של Y" בתחילת הטקסט (לא ממציאים אם אין)
    var titleIdx = -1;
    if (!title) {
      for (var k = 0; k < Math.min(raw.length, 8); k++) {
        var h = raw[k].trim();
        if (!h || chordLine(h) || CHROME.test(h) || SECTION_RE.test(h) || /^(קאפו|capo|טונליות|סולם|key|משקל|time)(?:\s|:|$)/i.test(h)) continue;
        var m = h.match(/^(.+?)\s+(?:chords?|tabs?)\s+by\s+(.+)$/i) || h.match(/^(?:אקורדים(?:\s+ל(?:שיר)?)?\s*)?(.+?)\s*(?:[-–—|]|של)\s*(.+)$/);
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
    if (video) head.push('{video: ' + video + '}');
    head.push('{note: יובא מטקסט שהודבק — המילים והאקורדים כפי שהם במקור}');
    return {
      song: head.join('\n') + '\n\n' + out.join('\n') + '\n',
      title: title, artist: artist, capo: meta.capo, time: meta.time, key: meta.key,
      warnings: warnings, stats: { chordLines: nChordLines, merged: nMerged, lyricLines: nLyrics }
    };
  };


  // ───── ייבוא מקישור: קריאה ישירה רק כשהאתר מרשה (CORS), או דרך ה-API הציבורי הרשמי של וורדפרס. בלי פרוקסי ובלי עקיפה ─────
  var BLOCK = { P: 1, DIV: 1, LI: 1, UL: 1, OL: 1, TR: 1, TABLE: 1, SECTION: 1, ARTICLE: 1, MAIN: 1, BLOCKQUOTE: 1, H1: 1, H2: 1, H3: 1, PRE: 1, CENTER: 1 };
  function nodeToText(root) {
    var out = [];
    (function walk(n, pre) {
      if (n.nodeType === 3) { out.push(pre ? n.nodeValue : n.nodeValue.replace(/[ \t\r\n\f]+/g, ' ')); return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName.toUpperCase();
      if (tag === 'BR') { out.push('\n'); return; }
      var isPre = pre || tag === 'PRE', blk = BLOCK[tag];
      if (blk) out.push('\n');
      if (tag === 'TD' || tag === 'TH') out.push(' ');
      for (var c = n.firstChild; c; c = c.nextSibling) walk(c, isPre);
      if (tag === 'TD' || tag === 'TH') out.push(' ');
      if (blk) out.push('\n');
    })(root, false);
    return out.join('').split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function findVideo(root) {
    var els = root.querySelectorAll('a[href], iframe[src]');
    for (var i = 0; i < els.length; i++) {
      var u = els[i].getAttribute('href') || els[i].getAttribute('src') || '';
      if (/youtu\.?be/i.test(u)) return u.indexOf('//') === 0 ? 'https:' + u : u;
    }
    return '';
  }
  function pageFromHtml(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var og = doc.querySelector('meta[property="og:title"]');
    var title = ((og && og.getAttribute('content')) || (doc.querySelector('h1') || {}).textContent || doc.title || '').replace(/\s*[|·»]\s*[^|·»]*$/, '').trim();
    var area = doc.querySelector('[itemprop="articleBody"], .entry-content, .post-content, article, main') || doc.body;
    var video = findVideo(area);
    doc.querySelectorAll('script,style,noscript,nav,header,footer,aside,form,iframe,svg,button,select,input,[class*="comment"],[class*="share"],[class*="related"],[class*="menu"],[class*="cookie"]').forEach(function (e) { e.remove(); });
    return { title: title, text: nodeToText(area), video: video };
  }
  function wpPage(u) {
    var slug = decodeURIComponent(u.pathname.replace(/\/+$/, '').split('/').pop() || '');
    var p = u.searchParams.get('p') || u.searchParams.get('page_id');
    var urls = p ? [u.origin + '/wp-json/wp/v2/posts/' + p + '?_fields=title,content'] : (slug ? [u.origin + '/wp-json/wp/v2/posts?slug=' + encodeURIComponent(slug) + '&_fields=title,content', u.origin + '/wp-json/wp/v2/pages?slug=' + encodeURIComponent(slug) + '&_fields=title,content'] : []);
    return urls.reduce(function (chain, url) {
      return chain.then(function (got) {
        if (got) return got;
        return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; }).then(function (d) {
          var post = Array.isArray(d) ? d[0] : d;
          if (!post || !post.content || !post.content.rendered) return null;
          var body = new DOMParser().parseFromString(post.content.rendered, 'text/html').body;
          var t = new DOMParser().parseFromString('<p>' + ((post.title && post.title.rendered) || '') + '</p>', 'text/html').body.textContent;
          return { title: t.trim(), text: nodeToText(body), video: findVideo(body) };
        });
      });
    }, Promise.resolve(null));
  }
  /** מחזיר Promise עם {title, text, video}; נדחה עם Error(message בעברית) אם אי אפשר לקרוא את האתר */
  GK.importLink = function (input) {
    var m = /https?:\/\/[^\s<>"']+/i.exec(input || ''), u;
    try { u = new URL(m ? m[0] : ''); } catch (e) { return Promise.reject(new Error('הקישור לא תקין. צריך קישור מלא שמתחיל ב-https://')); }
    if (u.protocol !== 'https:') return Promise.reject(new Error('הקישור חייב להתחיל ב-https://'));
    if (/(^|\.)tab4u\.com$/i.test(u.hostname)) return Promise.reject(new Error('Tab4U לא מאפשר לאפליקציה לקרוא אותו. פתח את השיר באתר, העתק את הטקסט והדבק בשלב 2.'));
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 15000);
    return fetch(u.href, { headers: { Accept: 'text/html,text/plain' }, signal: ctl.signal }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('האתר החזיר שגיאה (' + res.status + '). נסה להעתיק ולהדביק את הטקסט.');
      return res.text().then(function (t) { return /text\/plain/i.test(res.headers.get('content-type') || '') ? { title: '', text: t, video: '' } : pageFromHtml(t); });
    }, function () {
      clearTimeout(timer);
      return wpPage(u).then(function (r) {
        if (r) return r;
        throw new Error('האתר לא מאפשר קריאה ישירה מהאפליקציה. פתח אותו, העתק את הטקסט והדבק בשלב 2.');
      });
    });
  };

  // ───── ספריית שירים באנגלית (קבצי ChordPro פתוחים ב-GitHub, נטענים דרך jsDelivr שמאפשר קריאה מדפדפן) ─────
  GK.LIB_SOURCES = [
    { id: 'xmas', repo: 'pathawks/Christmas-Songs', label: 'שירי חג (נחלת הכלל)', pick: function (p) { return /\.cho$/i.test(p) && p.split('/').length === 2; } },
    { id: 'hymn', repo: 'dsmithco/worship-chordpro', label: 'מזמורים (בעיקר נחלת הכלל)', pick: function (p) { return /\.cho$/i.test(p) && /^\/songs\//.test(p); } }
  ];
  var libIndex = null;
  /** Promise<[{src, path, name}]> — רשימת הקבצים (נטענת פעם אחת) */
  GK.libIndex = function () {
    if (libIndex) return libIndex;
    libIndex = Promise.all(GK.LIB_SOURCES.map(function (s) {
      return fetch('https://data.jsdelivr.com/v1/packages/gh/' + s.repo + '@master?structure=flat').then(function (r) { return r.ok ? r.json() : { files: [] }; }, function () { return { files: [] }; }).then(function (d) {
        return (d.files || []).filter(function (f) { return s.pick(f.name); }).map(function (f) {
          var base = f.name.split('/').pop().replace(/\.cho$/i, '');
          return { src: s, path: f.name, name: base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() };
        });
      });
    })).then(function (a) { var all = [].concat.apply([], a); if (!all.length) libIndex = null; return all; });
    return libIndex;
  };
  GK.libFetch = function (item) {
    return fetch('https://cdn.jsdelivr.net/gh/' + item.src.repo + '@master' + item.path).then(function (r) {
      if (!r.ok) throw new Error('לא הצלחתי לטעון את השיר (' + r.status + ')');
      return r.text();
    });
  };
  /** ChordPro → פורמט האפליקציה. משאיר title/artist/time/capo/key, ממיר כותרות קטעים, מוריד פקודות לא מוכרות. אקורדים [C] זהים. */
  GK.chordproToSong = function (text, src) {
    var head = [], body = [], d, title = '', artist = '';
    String(text || '').replace(/\r/g, '').split('\n').forEach(function (l) {
      var t = l.trim();
      if (t[0] === '#') return;
      if ((d = t.match(/^\{\s*([a-z_]+)\s*:?\s*(.*?)\s*\}$/i))) {
        var k = d[1].toLowerCase(), v = d[2];
        if (k === 'title' || k === 't') title = v;
        else if (k === 'artist' || k === 'composer' || k === 'lyricist' || k === 'text' || k === 'music') { if (!artist && v) artist = v.replace(/,?\s*\d{4}.*$/, ''); }
        else if (k === 'time' && /^\d\/\d$/.test(v)) head.push('{time: ' + v + '}');
        else if (k === 'capo' && /^\d+$/.test(v)) head.push('{capo: ' + v + '}');
        else if (k === 'key') head.push('{key: ' + v + '}');
        else if (k === 'comment' || k === 'c' || k === 'comment_italic' || k === 'ci' || k === 'cb') body.push('{section: ' + v + '}');
        else if (/^(start_of_|sov|soc|sob)/.test(k)) body.push('{section: ' + (v || (/^(start_of_chorus|soc)/.test(k) ? 'פזמון' : 'בית')) + '}');
        return;
      }
      body.push(l.replace(/\[(?:\*[^\]]*|[^\]]*\/\/[^\]]*)\]/g, ''));
    });
    var out = ['{title: ' + (title || 'שיר חדש') + '}'];
    if (artist) out.push('{artist: ' + artist + '}');
    out = out.concat(head);
    out.push('{note: מקור: ' + (src || 'ספריית ChordPro פתוחה') + '}');
    return { song: out.join('\n') + '\n\n' + body.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n', title: title, artist: artist };
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
