/* WebAudio: לחיצת מטרונום מתוזמנת במדויק (נוצר רק אחרי לחיצה של המשתמש) */
(function () {
  var GK = (window.GK = window.GK || {});
  var ctx = null;

  /** יוצר/מעיר את ה-AudioContext. מחזיר null אם אין תמיכה. */
  function ensure() {
    if (!ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  GK.audio = {
    ensure: ensure,
    now: function () { return ctx ? ctx.currentTime : 0; },
    /** לחיצה בזמן t (שניות של ה-context). accent = לחיצה חזקה בראש תיבה */
    click: function (t, accent) {
      if (!ctx) return;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = accent ? 1700 : 1100;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 0.06);
    }
  };
})();
