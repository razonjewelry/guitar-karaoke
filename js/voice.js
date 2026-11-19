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
    /** מקריא את הדפוס בקצב הפריטה: כל מילה בזמן של הצעד שלה (לפי BPM). o.bpm — אם חסר, מקריא ברצף. התזמון המוזיקלי עצמו לא תלוי בקול. */
    speakPattern: function (pattern, o) {
      o = o || {};
      if (!o.bpm) return V.speak(GK.pat.speechText(pattern), o);
      env();
      if (!V.available()) return Promise.resolve({ ok: false, reason: 'unavailable' });
      var pulse = GK.pat.meterOf(pattern).pulse, secPerUnit = 60 / (o.bpm * pulse), steps = pattern.steps, token = (V._tk = (V._tk || 0) + 1);
      return new Promise(function (resolve) {
        var bad = null, last = steps.length ? steps[steps.length - 1].beat * secPerUnit : 0;
        try { synth.cancel(); } catch (e) {}
        steps.forEach(function (s, i) {
          var gap = ((steps[i + 1] ? steps[i + 1].beat : pattern.beatsPerBar) - s.beat) * secPerUnit;
          setTimeout(function () {
            if (V._tk !== token) return;
            V.speak(GK.pat.WORD[s.action], { rate: gap < 0.35 ? 1.6 : gap < 0.6 ? 1.3 : 1.05, queue: false }).then(function (r) { if (!r.ok && !bad) bad = r.reason; });
          }, s.beat * secPerUnit * 1000);
        });
        setTimeout(function () { if (V._tk === token) resolve({ ok: !bad, reason: bad }); }, (last + 0.9) * 1000);
      });
    },
    cancel: function () { V._tk = (V._tk || 0) + 1; env(); try { if (synth) synth.cancel(); } catch (e) {} V.speaking = false; }
  });
})();
