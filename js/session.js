/*
 * מפעיל תרגול: מתאם בין הקריינות, הספירה המקדימה והשעון.
 *   1. הסבר קולי באנגלית על הדפוס ("Up, Up, Rest, Up, Up.") — מסתיים לפני הספירה
 *   2. ספירה מקדימה לפי המשקל ("One, Two, Three, Four") — מסתיימת בדיוק לפני תחילת הנגינה, על שעון האודיו
 *   3. נגינה: בלי דיבור בכלל. X שותק. הקריינות לעולם לא משפיעה על התזמון.
 * הגדרות (PracticeSettings): bpm, voiceLanguage:'en', speakBeforePlaying, speakDuringPlaying:false, silentRests:true,
 *   countInEnabled, loopEnabled (+ voiceRate, click, strumSound).
 */
(function () {
  var GK = (window.GK = window.GK || {});

  GK.createSession = function (o) {
    var ctx = o.ctx, voice = o.voice || GK.voice, S = o.settings, hooks = o.hooks || {};
    S.voiceLanguage = 'en'; S.speakDuringPlaying = false; S.silentRests = true;      // קבועים לפי ההגדרה
    var phase = 'idle', token = 0, playTimer = null, countTimers = [];

    function setPhase(p) { phase = p; if (hooks.onPhase) hooks.onPhase(p); }
    function clearTimers() { countTimers.forEach(clearTimeout); countTimers = []; clearTimeout(playTimer); }

    function onCount(n, t, word) {
      var tk = token, delay = Math.max(0, (t - ctx.currentTime) * 1000 - 30);
      countTimers.push(setTimeout(function () {
        if (tk !== token || phase !== 'count') return;
        if (hooks.onCountWord) hooks.onCountWord(n, word);
        if (S.speakBeforePlaying && voice.available()) voice.say(word, { rate: 1 });     // ספירה מקדימה בלבד
      }, delay));
    }

    var clock = GK.createClock({
      ctx: ctx, sink: o.sink, autoTick: o.autoTick, bpm: S.bpm, onCount: onCount,
      onEnd: function () { if (hooks.onEnd) hooks.onEnd(); api.stop(); }
    });

    var api = {
      clock: clock,
      phase: function () { return phase; },
      isActive: function () { return phase !== 'idle'; },
      setPattern: function (p) { clock.setPattern(p); },
      setBpm: function (b) { S.bpm = clock.setBpm(b); return S.bpm; },

      /** מתחיל: הסבר קולי (אם מופעל) ← ספירה ← נגינה. opt.explain=false מדלג על ההסבר (חזרה על הפריטה). */
      start: async function (opt) {
        opt = opt || {};
        if (phase !== 'idle') return false;
        var p = clock.getPattern();
        if (!p) throw new Error('אין דפוס');
        var tk = ++token;
        if (opt.explain !== false && S.speakBeforePlaying) {
          setPhase('explain');
          if (hooks.onCaption) hooks.onCaption(GK.pat.speechText(p));
          await voice.ready();
          var r = await voice.speakPattern(p, { rate: S.voiceRate });
          if (tk !== token) return false;
          if (!r.ok && hooks.onVoiceProblem) hooks.onVoiceProblem(r.reason);
        }
        if (tk !== token) return false;
        setPhase('count');
        var info = clock.start({ countIn: S.countInEnabled, loop: S.loopEnabled, click: S.click, strumSound: S.strumSound });
        playTimer = setTimeout(function () { if (tk === token) setPhase('play'); }, Math.max(0, (info.playTime - ctx.currentTime) * 1000));
        return info;
      },

      stop: function () {
        token++;
        clearTimers();
        voice.cancel();
        clock.stop();
        if (phase !== 'idle') setPhase('idle');
      },

      /** חוזר על הפריטה מההתחלה (עם ספירה, בלי הסבר קולי) */
      repeat: function () { api.stop(); return api.start({ explain: false }); },

      /** משמיע שוב את ההסבר הקולי — רק כשלא מנגנים */
      explain: async function () {
        if (phase !== 'idle') return { ok: false, reason: 'running' };
        var p = clock.getPattern();
        setPhase('explain');
        if (hooks.onCaption) hooks.onCaption(GK.pat.speechText(p));
        var tk = ++token;
        await voice.ready();
        var r = await voice.speakPattern(p, { rate: S.voiceRate });
        if (tk === token && phase === 'explain') setPhase('idle');
        return r;
      }
    };
    return api;
  };
})();
