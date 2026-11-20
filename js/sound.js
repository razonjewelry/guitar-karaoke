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

  // ───── צליל גיטרה (Karplus-Strong): מיתר מדומה לכל תו, נשמר במטמון. לפי צורת האקורד מ-chords-db ─────
  var OPEN = [40, 45, 50, 55, 59, 64], ks = {};
  function pluck(midi) {
    if (ks[midi]) return ks[midi];
    var sr = ctx.sampleRate, f = 440 * Math.pow(2, (midi - 69) / 12), P = Math.round(sr / f), len = Math.round(sr * 2.2);
    var b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0), ring = new Float32Array(P), i;
    for (i = 0; i < P; i++) ring[i] = Math.random() * 2 - 1;
    var decay = midi < 50 ? 0.997 : 0.995;
    for (i = 0; i < len; i++) {                                   // מסנן ממוצע עם דעיכה = מיתר שדועך באופן טבעי
      var k = i % P;
      d[i] = ring[k];
      ring[k] = decay * 0.5 * (ring[k] + ring[(k + 1) % P]);
    }
    ks[midi] = b; return b;
  }
  var ringing = [];
  function chordNotes(name) {
    var sh = GK.shapeFor && GK.shapeFor(name);
    if (!sh) return [];
    var capo = (GK.chroma && GK.chroma.getCapo) ? GK.chroma.getCapo() : 0;
    return sh.f.map(function (fr, s) { return fr === null ? null : OPEN[s] + fr + capo; });
  }

  GK.sound = {
    ensure: ensure,
    /**
     * פריטת אקורד בגיטרה מסונתזת. action: down (מהבס למעלה, כל המיתרים) | up (מהגבוה למטה, 4 מיתרים עליונים)
     * | muted (נקישה חסומה) | rest (שקט). פריטה חדשה משתיקה את הקודמת (כמו יד על המיתרים).
     */
    guitar: function (t, chord, action, accent) {
      if (!ctx || action === 'rest') return;
      var notes = chordNotes(chord);
      if (!notes.length || action === 'muted') { GK.sound.strum(t, 'muted', accent); return; }
      ringing.forEach(function (g) { try { g.gain.setTargetAtTime(0.0001, t, 0.02); } catch (e) {} });
      ringing = [];
      var idx = [0, 1, 2, 3, 4, 5].filter(function (s) { return notes[s] !== null; });
      if (action === 'up') idx = idx.slice(-4).reverse();
      var vol = (action === 'up' ? 0.16 : 0.22) * (accent ? 1.3 : 1);
      idx.forEach(function (s, j) {
        var src = ctx.createBufferSource(), g = ctx.createGain(), at = t + j * (action === 'up' ? 0.009 : 0.013);
        src.buffer = pluck(notes[s]);
        g.gain.setValueAtTime(vol, at);
        src.connect(g); g.connect(ctx.destination);
        src.start(at); src.stop(at + 2.2);
        ringing.push(g);
      });
    },
    hush: function () { var t = ctx ? ctx.currentTime : 0; ringing.forEach(function (g) { try { g.gain.setTargetAtTime(0.0001, t, 0.03); } catch (e) {} }); ringing = []; },
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
