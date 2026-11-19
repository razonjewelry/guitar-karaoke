/* ניווט (hash) ואתחול. #/ = ספרייה · #/song/ID = נגן · #/edit/ID|new = עורך */
(function () {
  var GK = (window.GK = window.GK || {});

  function show(id) {
    ['v-library', 'v-player', 'v-editor', 'v-find', 'v-learn', 'v-course'].forEach(function (v) {
      document.getElementById(v).hidden = v !== id;
    });
  }

  function route() {
    var h = location.hash || '#/', m;
    if ((m = h.match(/^#\/song\/(.+)$/))) {
      var s = GK.catalog.get(decodeURIComponent(m[1]));
      if (!s) { location.hash = '#/'; return; }
      GK.ui.course.close();
      show('v-player');
      GK.ui.player.open(s);
    } else if (h === '#/find') {
      GK.ui.player.close(); GK.ui.learn.close(); GK.ui.course.close();
      show('v-find');
      GK.ui.find.open();
    } else if ((m = h.match(/^#\/course(?:\/(.+))?$/))) {
      GK.ui.player.close(); GK.ui.learn.close();
      show('v-course');
      GK.ui.course.open(m[1] ? decodeURIComponent(m[1]) : '');
    } else if (h === '#/learn') {
      GK.ui.player.close(); GK.ui.course.close();
      show('v-learn');
      GK.ui.learn.open();
    } else if ((m = h.match(/^#\/edit\/(.+)$/))) {
      GK.ui.player.close(); GK.ui.course.close();
      show('v-editor');
      GK.ui.editor.open(decodeURIComponent(m[1]));
    } else {
      GK.ui.player.close(); GK.ui.learn.close(); GK.ui.course.close();
      show('v-library');
      GK.ui.library.render();
    }
    window.scrollTo(0, 0);
  }

  // שיתוף לאפליקציה (Web Share Target): ?title=&text=&url= → מסך ההוספה, ואז מנקים את הכתובת
  try {
    var qs = new URLSearchParams(location.search);
    if (qs.get('text') || qs.get('title') || qs.get('url')) {
      GK.ui.find.setShare({ title: qs.get('title') || '', text: qs.get('text') || '', url: qs.get('url') || '' });
      history.replaceState(null, '', location.pathname + '#/find');
    }
  } catch (e) {}
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
