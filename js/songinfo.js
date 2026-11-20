/*
 * "מה הקצב והפריטה של השיר?" — בלי לשאול את המשתמש.
 * 1. מחפשים את השיר ב-Deezer (API ציבורי, JSONP כי אין CORS ל-API) ומקבלים קטע מקורי של 30 שניות.
 * 2. מנתחים את הקטע בדפדפן: מעטפת התקפות (spectral flux) → אוטוקורלציה → קצב (BPM), משקל (4/4, 3/4, 6/8)
 *    והאם יש פריטות על חצאי פעימה (למעלה). ה-BPM של Deezer משמש רק כרמז (הוא לרוב כפול).
 * 3. ממליצים פריטה מהספרייה לפי הקצב והמשקל. התוצאה נשמרת בטלפון לכל שיר.
 * החלק המתמטי (analyzeSamples / recommend) טהור, כדי שנוכל לבדוק אותו ב-Node.
 */
(function () {
  var GK = (window.GK = window.GK || {});
  var KEY = 'gk_info_v1';

  function jsonp(url, ms) {
    return new Promise(function (res, rej) {
      var cb = 'gkjp' + Math.random().toString(36).slice(2), s = document.createElement('script'), done = false;
      var end = function () { done = true; try { delete window[cb]; } catch (e) { window[cb] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); };
      window[cb] = function (d) { if (done) return; end(); res(d); };
      s.onerror = function () { if (done) return; end(); rej(new Error('network')); };
      s.src = url + (url.indexOf('?') < 0 ? '?' : '&') + 'output=jsonp&callback=' + cb;
      document.head.appendChild(s);
      setTimeout(function () { if (!done) { end(); rej(new Error('timeout')); } }, ms || 9000);
    });
  }

  function norm(s) { return String(s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9֐-׿ ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

  /** חיפוש ב-Deezer: מחזיר {id, title, artist, bpm, preview, link} או null */
  function lookup(title, artist) {
    var q = (title || '') + (artist ? ' ' + artist : '');
    if (!q.trim()) return Promise.resolve(null);
    return jsonp('https://api.deezer.com/search?q=' + encodeURIComponent(q) + '&limit=5').then(function (r) {
      var list = (r && r.data) || [], nt = norm(title);
      var hit = list.filter(function (d) { return norm(d.title).indexOf(nt) >= 0 || nt.indexOf(norm(d.title)) >= 0; })[0] || list[0];
      if (!hit || !hit.preview) return null;
      return jsonp('https://api.deezer.com/track/' + hit.id).then(function (t) {
        return { id: hit.id, title: hit.title, artist: hit.artist && hit.artist.name, bpm: (t && t.bpm) || 0, preview: hit.preview, link: hit.link };
      }, function () { return { id: hit.id, title: hit.title, artist: hit.artist && hit.artist.name, bpm: 0, preview: hit.preview, link: hit.link }; });
    });
  }

  // ───── ניתוח אות (טהור) ─────
  /** x: Float32Array מונו, sr: קצב דגימה. hint: BPM מ-Deezer (0 = אין) */
  function analyzeSamples(x, sr, hint) {
    var N = 1024, hop = Math.round(sr / 86), fps = sr / hop, kMax = Math.min(N / 2, Math.round(6000 / sr * N));
    var re = new Float64Array(N), im = new Float64Array(N), w = GK.blackman(N), prev = new Float64Array(kMax), env = [];
    for (var p = 0; p + N <= x.length; p += hop) {
      for (var i = 0; i < N; i++) { re[i] = x[p + i] * w[i]; im[i] = 0; }
      GK.fft(re, im);
      var f = 0;
      for (var k = 1; k < kMax; k++) {
        var m = Math.log(1 + 1000 * Math.sqrt(re[k] * re[k] + im[k] * im[k]));
        var d = m - prev[k]; if (d > 0) f += d; prev[k] = m;
      }
      env.push(f);
    }
    // הסרת מגמה איטית + חצי-גל
    var L = env.length, o = new Float64Array(L), W = Math.round(fps * 0.5);
    for (i = 0; i < L; i++) {
      var s = 0, c = 0;
      for (var j = Math.max(0, i - W); j <= Math.min(L - 1, i + W); j++) { s += env[j]; c++; }
      o[i] = Math.max(0, env[i] - s / c);
    }
    function acf(lag) {                                   // אוטוקורלציה מנורמלת בפיגור לא שלם (אינטרפולציה)
      var l0 = Math.floor(lag), fr = lag - l0, a = 0, b = 0;
      for (var n = 0; n + l0 + 1 < L; n++) { var v = o[n + l0] * (1 - fr) + o[n + l0 + 1] * fr; a += o[n] * v; b += o[n] * o[n]; }
      return b ? a / b : 0;
    }
    // ציון קצב: הפעימה + חצי ממנה (שמיניות) + כפולה (חצי תיבה), כפול "העדפה" לקצב סביר לנגינה בגיטרה
    var best = null, cands = [];
    for (var bpm = 48; bpm <= 200; bpm += 0.5) {
      var T = fps * 60 / bpm;
      var sc = acf(T) + 0.5 * acf(2 * T) + 0.25 * acf(4 * T);
      var prior = Math.exp(-0.5 * Math.pow(Math.log(bpm / 92) / Math.log(2) / 0.55, 2));
      if (hint > 0) { var r = Math.min(Math.abs(bpm - hint), Math.abs(bpm - hint / 2), Math.abs(bpm - hint * 2)); if (r < 4) prior *= 1.25; }
      cands.push({ bpm: bpm, raw: sc, sc: sc * prior });
    }
    cands.forEach(function (c) { if (!best || c.sc > best.sc) best = c; });
    var T0 = fps * 60 / best.bpm;
    var a1 = acf(T0), a2 = acf(T0 / 2);
    // משקל: האם השיר חוזר על עצמו כל 3 פעימות (ו-6) יותר מאשר כל 4 (ו-8)? נבדק על 14 שירים מוכרים:
    // יחס 1.3 תפס ואלסים ו-6/8 בלי אף שיר 4/4 שזוהה בטעות. בספק — 4/4 (רוב השירים).
    var tri = acf(3 * T0) + acf(6 * T0), quad = acf(4 * T0) + acf(8 * T0);
    var meter = tri > quad * 1.3 ? '3/4' : '4/4', outBpm = best.bpm;
    var eighths = a2 / (a1 || 1);                                            // כמה חזקות ההתקפות על חצאי פעימה
    var second = cands.filter(function (c) { return Math.abs(c.bpm - best.bpm * 2) < 3 || Math.abs(c.bpm - best.bpm / 2) < 2; }).sort(function (a, b) { return b.sc - a.sc; })[0];
    var conf = second ? best.sc / (best.sc + second.sc) : 0.8;
    return { bpm: Math.round(outBpm), meter: meter, eighths: Math.round(eighths * 100) / 100, conf: Math.round(conf * 100) / 100, alt: second ? Math.round(second.bpm) : 0 };
  }

  /** בחירת פריטה מהספרייה לפי הניתוח */
  function recommend(a) {
    var id, why;
    if (a.meter === '6/8') { id = a.eighths > 0.45 ? 'six-eight-basic' : 'six-eight-two'; why = 'שיר במשקל 6/8 (תחושת "אחת-שתיים-שלוש")'; }
    else if (a.meter === '3/4') { id = a.eighths > 0.5 ? 'waltz-rest' : 'waltz-basic'; why = 'שיר במשקל 3/4 (ואלס)'; }
    else if (a.bpm < 72) { id = a.eighths > 0.55 ? 'ballad-soft' : 'ballad-halves'; why = 'בלדה איטית'; }
    else if (a.bpm <= 118) { id = a.eighths > 0.4 ? 'folk-classic' : 'down-rest-down-up'; why = a.eighths > 0.4 ? 'קצב בינוני עם פריטות למעלה בין הפעימות' : 'קצב בינוני, פריטות בעיקר על הפעימה'; }
    else { id = a.eighths > 0.5 ? 'down-rest-down-up' : 'four-down'; why = 'שיר מהיר — פריטה פשוטה כדי להספיק'; }
    return { meter: a.meter, patternId: id, why: why };
  }

  function cache() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function save(id, v) { try { var c = cache(); c[id] = v; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }

  /** פענוח ה-mp3 של הקטע ל-22050Hz מונו וניתוח */
  function analyzeUrl(url, hint) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('preview'); return r.arrayBuffer(); }).then(function (buf) {
      var C = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      var ctx = new C(1, 22050 * 31, 22050);
      return new Promise(function (res, rej) { ctx.decodeAudioData(buf, res, rej); });
    }).then(function (ab) { return analyzeSamples(ab.getChannelData(0), ab.sampleRate, hint); });
  }

  /**
   * הכל ביחד לשיר: מחזיר {found, title, artist, preview, link, bpm, meter, eighths, conf, patternId, why} (נשמר במטמון).
   * force = לנתח מחדש.
   */
  function forSong(song, force) {
    var c = cache()[song.id];
    if (c && !force) return Promise.resolve(c);
    return lookup(song.title, song.artist).then(function (h) {
      if (!h) { var nf = { found: false, t: Date.now() }; save(song.id, nf); return nf; }
      return analyzeUrl(h.preview, h.bpm).then(function (a) {
        var rec = recommend(a);
        var out = { found: true, title: h.title, artist: h.artist, preview: h.preview, link: h.link, deezerBpm: h.bpm, bpm: a.bpm, alt: a.alt, meter: a.meter, eighths: a.eighths, conf: a.conf, patternId: rec.patternId, why: rec.why, t: Date.now() };
        save(song.id, out); return out;
      });
    });
  }

  GK.songInfo = { lookup: lookup, analyzeSamples: analyzeSamples, analyzeUrl: analyzeUrl, recommend: recommend, forSong: forSong, cached: function (id) { return cache()[id] || null; }, set: save };
})();
