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

  /** כתובת חיפוש ב-Tab4U (נפתחת בלשונית חדשה על ידי המשתמש; האפליקציה לא קוראת את האתר) */
  GK.tab4uSearchUrl = function (q) { return 'https://www.tab4u.com/resultsSimple?tab=songs&q=' + encodeURIComponent(q); };

  /** תוכן שהגיע מ-Web Share Target: title/text/url */
  GK.shareToText = function (p) {
    var parts = [];
    if (p.text) parts.push(p.text);
    return { text: parts.join('\n'), title: p.title || '', url: p.url || '' };
  };
})();
