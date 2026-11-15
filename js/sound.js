/*
 * צלילי העזר של המאמן (Web Audio, ללא קבצי אודיו): קליק ספירה/מטרונום, וצליל פריטה להדגמה.
 * X (מנוחה) לא משמיע כלום. M (חסומה) = נקישה קצרה ושקטה. הכל מתוזמן על שעון ה-AudioContext.
 * הקול של ההקראה נפרד (voice.js) ולא קשור לתזמון.
 */
(function () {
  var GK = (window.GK = window.GK || {});
  var ctx = null, noise = null;

  function ensure() {
    if (!ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function noiseBuf() {
    if (!noise) {
      noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.2), ctx.sampleRate);
      var d = noise.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noise;
  }

  GK.sound = {
    ensure: ensure,
    ctx: function () { return ctx; },
    now: function () { return ctx ? ctx.currentTime : 0; },
    /** kind: 'count' | 'beat' */
    click: function (t, kind, accent) {
      if (!ctx) return;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = kind === 'count' ? (accent ? 1500 : 1100) : (accent ? 1250 : 900);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(accent ? 0.45 : 0.3, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 0.06);
    },
    /** פריטה להדגמה: למטה = נמוך ועמוק, למעלה = גבוה וקצר, חסומה = נקישה יבשה */
    strum: function (t, action, accent) {
      if (!ctx || action === 'rest') return;
      var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf();
      f.type = 'bandpass';
      var dur = action === 'muted' ? 0.03 : action === 'up' ? 0.09 : 0.14;
      f.frequency.value = action === 'down' ? 700 : action === 'up' ? 1700 : 500;
      f.Q.value = 0.9;
      var peak = (action === 'muted' ? 0.18 : action === 'up' ? 0.3 : 0.42) * (accent ? 1.35 : 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(ctx.destination);
      src.start(t); src.stop(t + dur + 0.02);
    }
  };
})();
