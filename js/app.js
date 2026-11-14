/* ניווט (hash) ואתחול. #/ = ספרייה · #/song/ID = נגן · #/edit/ID|new = עורך */
(function () {
  var GK = (window.GK = window.GK || {});

  function show(id) {
    ['v-library', 'v-player', 'v-editor'].forEach(function (v) {
      document.getElementById(v).hidden = v !== id;
    });
  }

  function route() {
    var h = location.hash || '#/', m;
    if ((m = h.match(/^#\/song\/(.+)$/))) {
      var s = GK.catalog.get(decodeURIComponent(m[1]));
      if (!s) { location.hash = '#/'; return; }
      show('v-player');
      GK.ui.player.open(s);
    } else if ((m = h.match(/^#\/edit\/(.+)$/))) {
      GK.ui.player.close();
      show('v-editor');
      GK.ui.editor.open(decodeURIComponent(m[1]));
    } else {
      GK.ui.player.close();
      show('v-library');
      GK.ui.library.render();
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);
  route();

  // התקנה כאפליקציה + עבודה בלי אינטרנט (רק בכתובת http/https)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    var hadController = !!navigator.serviceWorker.controller, reloaded = false;
    // כשיוצאת גרסה חדשה: רענון אוטומטי (לא באמצע נגינה)
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloaded) return;
      if (GK.ui.player.isPlaying()) { GK.toast('יש גרסה חדשה — תיטען בפתיחה הבאה'); return; }
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
