/* הקשבה למיקרופון: AnalyserNode -> פריימים {t, env, chroma} כל 50ms. דורש https (או localhost) והרשאת משתמש. */
(function () {
  var GK = (window.GK = window.GK || {});
  var ctx = null, stream = null, an = null, timer = null, tb = null, fb = null, cb = null, N = 4096;

  function tick() {
    if (!an) return;
    an.getFloatTimeDomainData(tb);
    var n = Math.min(1024, tb.length), e = 0;
    for (var i = tb.length - n; i < tb.length; i++) e += tb[i] * tb[i];
    var env = Math.sqrt(e / n);                       // עוצמה של ~64ms אחרונים
    var chroma = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (env > 0.004) {                                // בשקט לא מחשבים ספקטרום
      an.getFloatFrequencyData(fb);
      chroma = GK.chroma.fromDb(fb, ctx.sampleRate, N);
    }
    if (cb) cb({ t: performance.now(), env: env, chroma: chroma });
  }

  GK.listen = {
    /** מתחיל להקשיב; onFrame נקרא כל 50ms. מחזיר Promise עם קצב הדגימה, או נדחה אם אין הרשאה. */
    start: function (onFrame) {
      GK.listen.stop();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return Promise.reject(new Error('no mic api'));
      }
      return navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }   // לא לעבד את הגיטרה
      }).then(function (s) {
        stream = s;
        var C = window.AudioContext || window.webkitAudioContext;
        try { ctx = new C({ sampleRate: 16000 }); } catch (e) { ctx = new C(); }
        if (ctx.state === 'suspended') ctx.resume();
        N = ctx.sampleRate > 24000 ? 8192 : 4096;     // רזולוציית תדר סבירה גם כשהדפדפן מתעקש על 44.1/48k
        an = ctx.createAnalyser();
        an.fftSize = N; an.smoothingTimeConstant = 0; an.minDecibels = -120;
        ctx.createMediaStreamSource(s).connect(an);
        tb = new Float32Array(N); fb = new Float32Array(N / 2);
        cb = onFrame;
        timer = setInterval(tick, 50);
        return ctx.sampleRate;
      });
    },
    stop: function () {
      clearInterval(timer); timer = null; cb = null; an = null;
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
      if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; }
    }
  };
})();
