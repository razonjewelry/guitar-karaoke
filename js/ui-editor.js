/* מסך עריכת שיר: תיבת טקסט + לוח אקורדים להכנסה + בדיקת תקינות חיה */
(function () {
  var GK = (window.GK = window.GK || {});
  GK.ui = GK.ui || {};
  var esc = GK.esc;

  var TEMPLATE =
    '{title: שם השיר}\n{artist: }\n{bpm: 90}\n{time: 4/4}\n{strum: D - D U - U D U}\n{bars: 2}\n\n' +
    '{section: בית}\n[Am]כאן כותבים את [C]המילים, והאקורד [G]מעל המילה\n[F]שורה שנייה של [E]השיר\n';
  var CHORDS = ['A', 'Am', 'A7', 'B7', 'Bm', 'C', 'C7', 'D', 'D7', 'Dm', 'E', 'E7', 'Em', 'F', 'G', 'G7'];
  var DIRS = [
    ['קטע', '{section: בית}'], ['פריטה', '{strum: D - D U - U D U}'],
    ['קצב', '{bpm: 90}'], ['תיבות', '{bars: 2}'], ['קאפו', '{capo: 2}']
  ];

  function insertAt(ta, text, newLine) {
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    if (newLine) {
      var ls = v.lastIndexOf('\n', s - 1) + 1;           // תחילת השורה הנוכחית
      ta.value = v.slice(0, ls) + text + '\n' + v.slice(ls);
      ta.selectionStart = ta.selectionEnd = ls + text.length + 1;
    } else {
      ta.value = v.slice(0, s) + text + v.slice(e);
      ta.selectionStart = ta.selectionEnd = s + text.length;
    }
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }

  GK.ui.editor = {
    /** id = 'new' או מזהה של שיר משתמש */
    open: function (id) {
      var root = document.getElementById('v-editor');
      var isNew = id === 'new', text = TEMPLATE;
      if (isNew) id = GK.store.newId();
      else {
        var u = GK.store.getUser(id);
        if (!u) { location.hash = '#/'; return; }
        text = u.text;
      }
      root.innerHTML =
        '<header class="e-top"><a class="btn icon" href="' + (isNew ? '#/' : '#/song/' + encodeURIComponent(id)) + '" aria-label="ביטול">→</a>' +
        '<h1>' + (isNew ? 'שיר חדש' : 'עריכת שיר') + '</h1>' +
        (isNew ? '' : '<button class="btn danger" id="e-del">מחק</button>') +
        '<button class="btn gold" id="e-save">שמור</button></header>' +
        '<div class="e-body">' +
        '<div class="pal" id="e-pal">' + CHORDS.map(function (c) { return '<button type="button" data-c="' + c + '">' + c + '</button>'; }).join('') + '</div>' +
        '<textarea class="e-area" id="e-ta" spellcheck="false"></textarea>' +
        '<div class="pal dirs" id="e-dirs">' + DIRS.map(function (d, i) { return '<button type="button" data-i="' + i + '">+ ' + d[0] + '</button>'; }).join('') + '</div>' +
        '<div id="e-msg"></div>' +
        '<details><summary>איך כותבים שיר?</summary>' +
        '<p>כל שורה היא שורת מילים. אקורד נכתב בסוגריים מרובעים <b>מיד לפני</b> המילה שמעליה הוא יושב: <code>[Am]שלום [C]עולם</code>.</p>' +
        '<p>הנחיות (שורה משלהן): <code>{title: ..}</code> <code>{bpm: 90}</code> <code>{time: 4/4}</code> (גם 3/4, 6/8, 2/4) ' +
        '<code>{strum: D - D U - U D U}</code> (D מטה, U מעלה, מקף = מנוחה, X = השתקה; 8 מקומות ב-4/4) ' +
        '<code>{bars: 2}</code> (כמה תיבות בכל שורה) <code>{section: בית}</code> <code>{capo: 2}</code>.</p>' +
        '<p>אפשר לקבוע תיבות לשורה בודדת: מוסיפים בסופה <code>|4</code>. שורה ריקה = רווח.</p></details></div>';

      var ta = root.querySelector('#e-ta'), msg = root.querySelector('#e-msg');
      ta.value = text;

      var check = function () {
        var s = GK.parseSong(ta.value, { id: id });
        var html = s.warnings.map(function (w) { return '<div class="warn">⚠ ' + esc(w) + '</div>'; }).join('');
        html += '<div class="ok">' + s.lines.length + ' שורות · ' + s.chords.length + ' אקורדים' +
          (s.chords.length ? ' (' + esc(s.chords.join(' ')) + ')' : '') + '</div>';
        var noShape = s.chords.filter(function (c) { return !GK.shapeFor(c); });
        if (noShape.length) html += '<div class="warn">אין דיאגרמה לאקורדים: ' + esc(noShape.join(' ')) + ' (עדיין יוצגו בטקסט)</div>';
        msg.innerHTML = html;
      };
      ta.addEventListener('input', check);
      check();

      root.querySelector('#e-pal').addEventListener('click', function (e) {
        var c = e.target.getAttribute && e.target.getAttribute('data-c');
        if (c) insertAt(ta, '[' + c + ']', false);
      });
      root.querySelector('#e-dirs').addEventListener('click', function (e) {
        var i = e.target.getAttribute && e.target.getAttribute('data-i');
        if (i !== null && i !== undefined) insertAt(ta, DIRS[+i][1], true);
      });
      root.querySelector('#e-save').addEventListener('click', function () {
        var s = GK.parseSong(ta.value, { id: id });
        if (!s.lines.length) { GK.toast('אין שורות שיר'); return; }
        if (!GK.store.saveUser(id, ta.value)) { GK.toast('השמירה נכשלה (אין מקום באחסון?)'); return; }
        GK.toast('נשמר ✓');
        location.hash = '#/song/' + encodeURIComponent(id);
      });
      var del = root.querySelector('#e-del');
      if (del) del.addEventListener('click', function () {
        if (confirm('למחוק את השיר הזה?')) { GK.store.removeUser(id); GK.toast('נמחק'); location.hash = '#/'; }
      });
    }
  };
})();
