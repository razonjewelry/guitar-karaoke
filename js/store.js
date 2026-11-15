/* שמירה מקומית (localStorage): שירי המשתמש, הגדרות, גיבוי ושחזור */
(function () {
  var GK = (window.GK = window.GK || {});
  var K_SONGS = 'gk_user_songs_v1', K_SET = 'gk_settings_v1', K_PRAC = 'gk_practice_v1', K_PREF = 'gk_songprefs_v1';
  var PRACTICE = { bpm: 60, voiceLanguage: 'en', speakBeforePlaying: true, speakDuringPlaying: false, silentRests: true, countInEnabled: true, loopEnabled: true, voiceRate: 0.9, click: true, strumSound: true };
  var DEFAULTS = { fontPx: 22, sens: 1, full: false };

  function read(key, def) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }

  GK.store = {
    /** כל שירי המשתמש: [{id, text, updated}] */
    users: function () { return read(K_SONGS, []); },
    getUser: function (id) { return this.users().filter(function (x) { return x.id === id; })[0] || null; },
    /** שומר/מעדכן שיר משתמש */
    saveUser: function (id, text) {
      var a = this.users(), found = false;
      a.forEach(function (x) { if (x.id === id) { x.text = text; x.updated = Date.now(); found = true; } });
      if (!found) a.push({ id: id, text: text, updated: Date.now() });
      return write(K_SONGS, a);
    },
    removeUser: function (id) {
      return write(K_SONGS, this.users().filter(function (x) { return x.id !== id; }));
    },
    newId: function () { return 'u' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36); },

    settings: function () {
      var s = read(K_SET, {}), o = {};
      Object.keys(DEFAULTS).forEach(function (k) { o[k] = s[k] === undefined ? DEFAULTS[k] : s[k]; });
      return o;
    },
    setSetting: function (k, v) { var s = read(K_SET, {}); s[k] = v; write(K_SET, s); },

    /** PracticeSettings: מהירות תרגול (ברירת מחדל 60), הגדרות קול וספירה. speakDuringPlaying/silentRests/voiceLanguage קבועים. */
    practice: function () {
      var s = read(K_PRAC, {}), o = {};
      Object.keys(PRACTICE).forEach(function (k) { o[k] = s[k] === undefined ? PRACTICE[k] : s[k]; });
      o.speakDuringPlaying = false; o.silentRests = true; o.voiceLanguage = 'en';
      return o;
    },
    setPractice: function (k, v) { var s = read(K_PRAC, {}); s[k] = v; write(K_PRAC, s); },
    /** העדפות לכל שיר: {patternId, time, step} — פריטה שנבחרה, משקל שנבחר כשלא ידוע, התקדמות */
    songPrefs: function (id) { return read(K_PREF, {})[id] || {}; },
    setSongPref: function (id, k, v) { var a = read(K_PREF, {}); a[id] = a[id] || {}; a[id][k] = v; write(K_PREF, a); },

    /** גיבוי: JSON של כל שירי המשתמש */
    exportJson: function () { return JSON.stringify({ app: 'guitar-karaoke', v: 1, songs: this.users() }); },
    /** שחזור: ממזג לפי id; מחזיר כמה שירים נקלטו (זורק שגיאה אם הקובץ לא תקין) */
    importJson: function (str) {
      var o = JSON.parse(str);
      if (!o || o.app !== 'guitar-karaoke' || !Array.isArray(o.songs)) throw new Error('bad file');
      var n = 0, self = this;
      o.songs.forEach(function (s) { if (s && s.id && typeof s.text === 'string') { self.saveUser(s.id, s.text); n++; } });
      return n;
    }
  };
})();
