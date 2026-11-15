/* מסך רשימת השירים + חיפוש + גיבוי/שחזור */
(function () {
  var GK = (window.GK = window.GK || {});
  GK.ui = GK.ui || {};
  var esc = GK.esc;

  function cardHtml(s) {
    var text = (s.title + ' ' + s.artist + ' ' + s.text.slice(0, 400)).toLowerCase();
    return '<a class="card" href="#/song/' + encodeURIComponent(s.id) + '" data-q="' + esc(text) + '">' +
      '<h3>' + esc(s.title) + (s.builtin ? '' : '<span class="badge">שלי</span>') + '</h3>' +
      (s.artist ? '<p>' + esc(s.artist) + '</p>' : '') +
      '<div class="chips">' + s.chords.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</div>' +
      '<div class="meta">' + GK.buildSteps(s).length + ' אקורדים · ' + (s.timeKnown || s.builtin ? '<bdi>' + s.time + '</bdi>' : 'משקל לא ידוע') + (s.capo ? ' · קאפו ' + s.capo : '') + '</div></a>';
  }

  function download(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  GK.ui.library = {
    render: function () {
      var root = document.getElementById('v-library');
      var songs = GK.catalog.all();
      root.innerHTML =
        '<div class="lib-head"><h1>🎸 קריוקי לגיטרה<small>מילים, אקורדים ופריטה — תמיד איתך</small></h1>' +
        '<input class="search" id="lib-q" type="search" placeholder="חיפוש שיר…" autocomplete="off"></div>' +
        '<div class="lib-list" id="lib-list">' + (songs.map(cardHtml).join('') || '<div class="empty">אין שירים</div>') + '</div>' +
        '<div class="lib-foot"><a class="btn gold" href="#/find">🎸 חיפוש והוספת שירים</a><a class="btn" href="#/learn">🥁 לימוד פריטה</a><a class="btn" href="#/edit/new">＋ שיר חדש</a>' +
        '<button class="btn" id="lib-exp">⬇ גיבוי</button>' +
        '<label class="btn" for="lib-imp">⬆ שחזור</label><input id="lib-imp" type="file" accept=".json,application/json" hidden>' +
        '<div class="note">השירים המובנים: טקסטים בנחלת הכלל (מקרא, תפילה, המנון), עם הרמוניה בסיסית שלי. ' +
        'שירים שתוסיף נשמרים רק בטלפון שלך; מומלץ לגבות מדי פעם.</div></div>';

      var list = root.querySelector('#lib-list');
      root.querySelector('#lib-q').addEventListener('input', function (e) {
        var q = e.target.value.trim().toLowerCase();
        Array.prototype.forEach.call(list.children, function (c) {
          c.hidden = !!q && (c.getAttribute('data-q') || '').indexOf(q) < 0;
        });
      });
      root.querySelector('#lib-exp').addEventListener('click', function () {
        if (!GK.store.users().length) { GK.toast('אין עדיין שירים משלך לגיבוי'); return; }
        download('guitar-karaoke-backup.json', GK.store.exportJson());
        GK.toast('הגיבוי ירד כקובץ');
      });
      root.querySelector('#lib-imp').addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          try { var n = GK.store.importJson(String(r.result)); GK.toast('שוחזרו ' + n + ' שירים'); GK.ui.library.render(); }
          catch (err) { GK.toast('הקובץ לא תקין'); }
        };
        r.readAsText(f);
      });
    }
  };
})();
