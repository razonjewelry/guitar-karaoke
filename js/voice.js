/*
 * הדרכה קולית באנגלית (SpeechSynthesis). נשמעת רק לפני הנגינה (הסבר הדפוס + ספירה מקדימה); לא בזמן נגינה ולא בזמן X.
 * משך ההקראה לא משמש לתזמון מוזיקלי: speak() רק מחזיר Promise שמסתיים כשהקריינות נגמרה (או אחרי timeout),
 * והספירה המקדימה מתוזמנת בנפרד על שעון האודיו.
 * אם הדפדפן לא מאפשר או שאין קול — לא נכשלים: מחזירים ok:false והמסך ממשיך להציג את הטקסט.
 */
(function () {
  var GK = (window.GK = window.GK || {});
  var synth = null, uttCtor = null, voicesReady = false;

  function env() {
    if (synth === null) {
      synth = (typeof window !== 'undefined' && window.speechSynthesis) || false;
      uttCtor = (typeof window !== 'undefined' && window.SpeechSynthesisUtterance) || null;
    }
  }

  function pickVoice() {
    var vs = (synth && synth.getVoices && synth.getVoices()) || [];
    var en = vs.filter(function (v) { return /^en[-_]/i.test(v.lang) || v.lang === 'en'; });
    return en.filter(function (v) { return /en[-_]US/i.test(v.lang); })[0] || en[0] || null;
  }

  var V = (GK.voice = {
    speaking: false,
    /** לבדיקות: מזריק synth/Utterance מדומים */
    _inject: function (s, u) { synth = s; uttCtor = u; voicesReady = true; },
    available: function () { env(); return !!(synth && uttCtor); },
    /** מחכה (עד ~700ms) לטעינת רשימת הקולות; ממשיך בכל מקרה */
    ready: function () {
      env();
      return new Promise(function (resolve) {
        if (!synth || voicesReady || (synth.getVoices && synth.getVoices().length)) { voicesReady = true; resolve(!!pickVoice()); return; }
        var done = false, fin = function () { if (done) return; done = true; voicesReady = true; resolve(!!pickVoice()); };
        if (synth.addEventListener) synth.addEventListener('voiceschanged', fin, { once: true });
        setTimeout(fin, 700);
      });
    },
    /** מקריא טקסט. מחזיר Promise<{ok, reason}> שמתממש בסיום הקריינות (או timeout/שגיאה). */
    speak: function (text, o) {
      o = o || {};
      env();
      if (!V.available()) return Promise.resolve({ ok: false, reason: 'unavailable' });
      return new Promise(function (resolve) {
        var finished = false, rate = o.rate || 0.9;
        var fin = function (ok, reason) { if (finished) return; finished = true; V.speaking = false; resolve({ ok: ok, reason: reason }); };
        try {
          if (!o.queue) synth.cancel();
          var u = new uttCtor(text);
          u.lang = 'en-US'; u.rate = rate; u.volume = 1;
          var v = pickVoice(); if (v) u.voice = v;
          u.onstart = function () { V.speaking = true; };
          u.onend = function () { fin(true); };
          u.onerror = function (e) { fin(false, (e && e.error) || 'error'); };
          synth.speak(u);
          var words = String(text).split(/\s+/).length;
          setTimeout(function () { fin(false, 'timeout'); }, Math.max(3500, (words * 900) / rate + 2500));   // מגן מ-onend שלא מגיע
        } catch (e) { fin(false, 'exception'); }
      });
    },
    /** מילה בודדת (ספירה מקדימה): לא מבטל הקראה שכבר רצה אחרי מילה קודמת, כדי שלא יצטברו */
    say: function (word, o) { return V.speak(word, { rate: (o && o.rate) || 1, queue: false }); },
    speakPattern: function (pattern, o) { return V.speak(GK.pat.speechText(pattern), o); },
    cancel: function () { env(); try { if (synth) synth.cancel(); } catch (e) {} V.speaking = false; }
  });
})();
