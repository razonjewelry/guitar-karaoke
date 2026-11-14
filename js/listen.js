/*
 * הקשבה למיקרופון: זרם דגימות רציף -> מנתח פריטות (strum.js).
 * onResult נקרא כ-30 פעמים בשנייה עם {onsets, analyses, level}. דורש https (או localhost) והרשאת משתמש.
 */
(function () {
  var GK = (window.GK = window.GK || {});
  var ctx = null, stream = null, src = null, proc = null, analyzer = null;

  GK.listen = {
    /** מתחיל להקשיב. מחזיר Promise עם קצב הדגימה, או נדחה אם אין הרשאה/מיקרופון. k = רגישות הגילוי. */
    start: function (onResult, k) {
      GK.listen.stop();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('no mic api'));
      return navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }   // לא לעבד את הגיטרה
      }).then(function (s) {
        stream = s;
        var C = window.AudioContext || window.webkitAudioContext;
        try { ctx = new C({ sampleRate: 16000 }); } catch (e) { ctx = new C(); }
        if (ctx.state === 'suspended') ctx.resume();
        analyzer = GK.createStrumAnalyzer({ sr: ctx.sampleRate, k: k });
        src = ctx.createMediaStreamSource(s);
        proc = ctx.createScriptProcessor(512, 1, 1);
        proc.onaudioprocess = function (e) {
          if (analyzer) onResult(analyzer.push(e.inputBuffer.getChannelData(0)));
        };
        src.connect(proc);
        proc.connect(ctx.destination);                // הפלט שקט; החיבור נדרש כדי שהמעבד ירוץ
        return ctx.sampleRate;
      });
    },
    setK: function (k) { if (analyzer) analyzer.setK(k); },
    stop: function () {
      if (proc) { proc.onaudioprocess = null; try { proc.disconnect(); } catch (e) {} proc = null; }
      if (src) { try { src.disconnect(); } catch (e) {} src = null; }
      analyzer = null;
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
      if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; }
    }
  };
})();
