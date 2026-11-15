/* מצב א׳ "לימוד פריטה": מורה שמקריא את הדפוס באנגלית, חצים גדולים, תרגול איטי, צעד-צעד וחזרות. בלי שיר ובלי מיקרופון. */
(function () {
  var GK = (window.GK = window.GK || {});
  GK.ui = GK.ui || {};
  var coach = null;

  GK.ui.learn = {
    open: function () {
      var root = document.getElementById('v-learn');
      this.close();
      var pr = GK.store.songPrefs('_learn');
      root.innerHTML =
        '<header class="p-top"><a class="btn icon" href="#/" aria-label="חזרה">→</a>' +
        '<div class="p-title"><h1>🥁 לימוד פריטה</h1><small>המורה מקריא באנגלית, אתה מתאמן לאט</small></div></header>' +
        '<div class="l-body"><div class="meterpick" id="l-meter"></div><div id="l-coach"></div>' +
        '<div class="note">איך מתרגלים: 1) לחץ "הסבר" ושמע את הפריטה. 2) לחץ על חץ כדי לראות אותו, או ◀ ▶ לעבור צעד-צעד. ' +
        '3) התחל ב-40–60 BPM. X = לא לפרוט בכלל, והיד ממשיכה לנוע. 4) הגבר מהירות רק כשזה נוח.</div></div>';
      var meter = pr.time || '4/4';
      function mount(m) {
        meter = m;
        GK.store.setSongPref('_learn', 'time', m);
        if (coach) coach.destroy();
        coach = GK.ui.createCoach(document.getElementById('l-coach'), {
          mode: 'learn', meter: m, patternId: GK.store.songPrefs('_learn')['pat_' + m],
          onPattern: function (p) { GK.store.setSongPref('_learn', 'pat_' + m, p.id); }
        });
        Array.prototype.forEach.call(document.querySelectorAll('#l-meter button'), function (b) { b.classList.toggle('on', b.getAttribute('data-m') === m); });
      }
      var mp = document.getElementById('l-meter');
      mp.innerHTML = ['4/4', '3/4', '6/8', '2/4'].map(function (m) { return '<button class="btn tog" data-m="' + m + '">' + m + '</button>'; }).join('');
      mp.addEventListener('click', function (e) {
        var m = e.target.getAttribute && e.target.getAttribute('data-m');
        if (!m) return;
        if (coach && coach.isActive()) { GK.toast('עצור כדי להחליף משקל'); return; }
        mount(m);
      });
      mount(meter);
    },
    close: function () { if (coach) { coach.destroy(); coach = null; } }
  };
})();
