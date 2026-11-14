/* קטלוג: שירי משתמש (מ-localStorage) + שירים מובנים (data/songs.js), כולם מפורסרים */
(function () {
  var GK = (window.GK = window.GK || {});
  var cache = null;

  GK.catalog = {
    builtin: function () {
      if (!cache) {
        cache = (GK.BUILTIN || []).map(function (b) {
          return GK.parseSong(b.text, { id: b.id, builtin: true });
        });
      }
      return cache;
    },
    users: function () {
      return GK.store.users().map(function (u) { return GK.parseSong(u.text, { id: u.id }); });
    },
    /** שירי המשתמש קודם, אחריהם המובנים */
    all: function () { return this.users().concat(this.builtin()); },
    get: function (id) {
      return this.all().filter(function (s) { return s.id === id; })[0] || null;
    }
  };
})();
