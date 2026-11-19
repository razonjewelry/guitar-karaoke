/*
 * "חיפוש והוספת שירים". ייבוא אוטומטי מ-Tab4U לא פעיל: האתר לא חושף API ולא מאפשר CORS לקריאה מדפדפן,
 * ואנחנו לא עוקפים הגנות. במקום זה: פותחים את החיפוש של Tab4U בלשונית חדשה, מעתיקים את העמוד עם האקורדים (או משתפים אליו),
 * מדביקים כאן, בודקים תצוגה מקדימה ושומרים. כל מה שנשמר נשאר בטלפון.
 */
(function () {
  var GK = (window.GK = window.GK || {});
  GK.ui = GK.ui || {};
  var esc = GK.esc, lastShare = null;

  GK.ui.find = {
    /** נקרא מ-app.js כשהאפליקציה נפתחת דרך "שתף" מדפדפן */
    setShare: function (p) { lastShare = p; },
    close: function () {},
    open: function () {
      var root = document.getElementById('v-find'), share = lastShare; lastShare = null;
      root.innerHTML =
        '<header class="p-top"><a class="btn icon" href="#/" aria-label="חזרה">→</a>' +
        '<div class="p-title"><h1>🎸 חיפוש והוספת שירים</h1><small>חיפוש ב-Tab4U ← הדבקה ← שמירה</small></div></header>' +
        '<div class="e-body">' +
        '<div class="f-step"><b>1. חפש שיר</b><div class="f-search"><input class="search" id="f-q" type="search" placeholder="שם שיר או אמן" autocomplete="off">' +
        '<button class="btn gold" id="f-open">פתח ב-Tab4U ↗</button></div>' +
        '<div class="note">הייבוא האוטומטי מ-Tab4U <b>לא פעיל</b>: האתר לא מאפשר לאפליקציה לקרוא אותו, ואנחנו לא עוקפים הגנות. ' +
        'בחר שיר באתר, סמן והעתק את העמוד עם האקורדים (או השתמש ב"שתף" ← האפליקציה, אם הותקנה על המסך הראשי).</div></div>' +
        '<div class="f-step"><b>או: הדבק קישור לדף שיר</b><div class="f-search"><input class="search" id="f-url" type="url" dir="ltr" placeholder="https://…">' +
        '<button class="btn" id="f-fetch">🔗 הבא מהקישור</button></div><div class="note">עובד רק באתרים שמאפשרים קריאה (למשל אתרי וורדפרס). Tab4U לא מאפשר — שם מעתיקים ומדביקים. אם יש בדף קישור ליוטיוב, הוא נשמר עם השיר.</div></div>' +
        '<div class="f-step"><b>📚 ספרייה פתוחה באנגלית</b><div class="f-search"><input class="search" id="f-lq" type="search" placeholder="חפש בספרייה (למשל Amazing, Silent, Abide)" dir="ltr"></div>' +
        '<div class="f-lib" id="f-lib"><span class="note">טוען רשימה…</span></div>' +
        '<div class="note">שירי חג ומזמורים שפורסמו בקבצי ChordPro פתוחים. לחץ על שיר כדי לראות תצוגה מקדימה ולשמור.</div></div>' +
        '<div class="f-step"><b>2. הדבק</b><div class="f-search"><button class="btn" id="f-paste">📋 הדבק מהלוח</button>' +
        '<label class="f-mode">יישור אקורדים: <select id="f-mode"><option value="rtl">ימין-לשמאל (עברית)</option><option value="ltr">שמאל-לימין</option></select></label></div>' +
        '<textarea class="e-area" id="f-txt" placeholder="הדבק כאן את הטקסט עם האקורדים…" spellcheck="false"></textarea>' +
        '<div class="f-search"><input class="search" id="f-title" placeholder="שם השיר (אם לא זוהה)"><input class="search" id="f-artist" placeholder="אמן (אופציונלי)"></div></div>' +
        '<div class="f-step"><b>3. תצוגה מקדימה</b><div id="f-warn" class="warn"></div><div class="lyrics f-prev" id="f-prev"></div></div>' +
        '<div class="f-step f-act"><button class="btn gold" id="f-save" disabled>💾 שמור ופתח לתרגול</button><button class="btn" id="f-edit" disabled>✎ שמור וערוך</button></div>' +
        '<div class="note">המילים והאקורדים נשמרים כפי שהודבקו; האפליקציה לא ממציאה תוכן. אם משקל או פריטה לא מופיעים במקור, תתבקש לבחור פריטה לתרגול בעצמך.</div></div>';
      var q = function (s) { return root.querySelector(s); }, cur = null, timer = 0, vid = '';
      function preview() {
        var txt = q('#f-txt').value;
        if (!txt.trim()) { q('#f-prev').innerHTML = ''; q('#f-warn').textContent = ''; q('#f-save').disabled = q('#f-edit').disabled = true; cur = null; return; }
        var r = GK.importPaste(txt, { video: vid, mode: q('#f-mode').value, title: q('#f-title').value.trim(), artist: q('#f-artist').value.trim() });
        cur = r;
        if (!q('#f-title').value && r.title) q('#f-title').placeholder = 'זוהה: ' + r.title;
        var song = GK.parseSong(r.song);
        q('#f-prev').innerHTML = GK.ui.lyricsHtml(song);
        q('#f-warn').innerHTML = r.warnings.concat(song.chords.length ? [] : ['לא נמצאו אקורדים']).map(esc).join('<br>') + '<br><span class="ok">' + song.chords.length + ' אקורדים · ' + r.stats.merged + ' שורות מחוברות</span>';
        q('#f-save').disabled = q('#f-edit').disabled = !song.chords.length;
      }
      function save(edit) {
        if (!cur) return;
        var id = GK.store.newId();
        if (!GK.store.saveUser(id, cur.song)) { GK.toast('השמירה נכשלה (אין מקום באחסון)'); return; }
        GK.toast('השיר נשמר בספרייה');
        location.hash = (edit ? '#/edit/' : '#/song/') + encodeURIComponent(id);
      }
      q('#f-txt').addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(preview, 250); });
      ['#f-mode', '#f-title', '#f-artist'].forEach(function (s) { q(s).addEventListener('input', preview); });
      q('#f-open').addEventListener('click', function () {
        var v = q('#f-q').value.trim();
        if (!v) { GK.toast('הקלד שם שיר או אמן'); return; }
        window.open(GK.tab4uSearchUrl(v), '_blank', 'noopener');
      });
      q('#f-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') q('#f-open').click(); });
      q('#f-paste').addEventListener('click', function () {
        if (!navigator.clipboard || !navigator.clipboard.readText) { GK.toast('הדפדפן לא מאפשר קריאת לוח — הדבק ידנית בתיבה'); q('#f-txt').focus(); return; }
        navigator.clipboard.readText().then(function (t) { q('#f-txt').value = t; preview(); }, function () { GK.toast('אין הרשאה ללוח — הדבק ידנית בתיבה'); q('#f-txt').focus(); });
      });
      function renderLib(items, term) {
        var t = (term || '').toLowerCase().trim(), box = q('#f-lib');
        var list = items.filter(function (x) { return !t || x.name.toLowerCase().indexOf(t) >= 0; }).slice(0, 40);
        box.innerHTML = list.length ? list.map(function (x, i) { return '<button class="btn" data-li="' + items.indexOf(x) + '" dir="ltr">' + esc(x.name) + '</button>'; }).join('') : '<span class="note">לא נמצא שיר כזה בספרייה</span>';
      }
      var libItems = [];
      GK.libIndex().then(function (items) {
        libItems = items;
        if (!items.length) { q('#f-lib').innerHTML = '<span class="note">הספרייה לא זמינה כרגע (אין חיבור?)</span>'; return; }
        renderLib(items, '');
      });
      q('#f-lq').addEventListener('input', function () { renderLib(libItems, q('#f-lq').value); });
      q('#f-lib').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-li]') : null; if (!b) return;
        var it = libItems[+b.getAttribute('data-li')];
        GK.libFetch(it).then(function (txt) {
          var r = GK.chordproToSong(txt, it.src.repo);
          cur = { song: r.song, warnings: [], stats: { merged: 0 } };
          var song = GK.parseSong(r.song);
          q('#f-prev').innerHTML = GK.ui.lyricsHtml(song);
          q('#f-warn').innerHTML = esc(r.title || it.name) + '<br><span class="ok">' + song.chords.length + ' אקורדים · ' + esc(it.src.label) + '</span>';
          q('#f-save').disabled = q('#f-edit').disabled = !song.chords.length;
          q('#f-prev').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, function (err) { GK.toast(err.message || 'הטעינה נכשלה'); });
      });
      q('#f-fetch').addEventListener('click', function () {
        var b = q('#f-fetch'); b.disabled = true; b.textContent = '⏳ טוען…';
        GK.importLink(q('#f-url').value).then(function (r) {
          q('#f-txt').value = r.text; vid = r.video || '';
          if (r.title && !q('#f-title').value) q('#f-title').value = r.title.replace(/\s+[-–—]\s+.*$/, '');
          preview(); GK.toast('הדף נקרא — בדוק את התצוגה המקדימה');
        }, function (e) { GK.toast(e.message); }).then(function () { b.disabled = false; b.textContent = '🔗 הבא מהקישור'; });
      });
      q('#f-save').addEventListener('click', function () { save(false); });
      q('#f-edit').addEventListener('click', function () { save(true); });
      if (share && (share.text || share.title)) {
        var sh = GK.shareToText(share);
        q('#f-txt').value = sh.text || sh.title;
        if (sh.title && !sh.text) q('#f-q').value = sh.title;
        preview();
        GK.toast('התקבל תוכן משיתוף — בדוק ושמור');
      }
    }
  };
})();
