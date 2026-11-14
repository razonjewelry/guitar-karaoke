/* FFT רדיקס-2 במקום (re, im באורך חזקת 2) + חלון בלקמן. בלי תלות בדפדפן, כך שאותו קוד רץ גם בבדיקות. */
(function () {
  var GK = (window.GK = window.GK || {});
  var tw = {}, win = {};

  function twiddle(n) {
    if (!tw[n]) {
      var c = new Float64Array(n / 2), s = new Float64Array(n / 2);
      for (var k = 0; k < n / 2; k++) { c[k] = Math.cos((-2 * Math.PI * k) / n); s[k] = Math.sin((-2 * Math.PI * k) / n); }
      tw[n] = { c: c, s: s };
    }
    return tw[n];
  }

  /** FFT במקום. re, im: Float64Array באורך חזקת 2 */
  GK.fft = function (re, im) {
    var n = re.length, t = twiddle(n), i, j, k, bit;
    for (i = 1, j = 0; i < n; i++) {
      bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { var a = re[i]; re[i] = re[j]; re[j] = a; a = im[i]; im[i] = im[j]; im[j] = a; }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var half = len >> 1, step = n / len;
      for (i = 0; i < n; i += len) {
        for (k = 0; k < half; k++) {
          var wr = t.c[k * step], wi = t.s[k * step];
          var xr = re[i + k + half] * wr - im[i + k + half] * wi;
          var xi = re[i + k + half] * wi + im[i + k + half] * wr;
          re[i + k + half] = re[i + k] - xr; im[i + k + half] = im[i + k] - xi;
          re[i + k] += xr; im[i + k] += xi;
        }
      }
    }
  };

  /** חלון בלקמן באורך n (נשמר במטמון) */
  GK.blackman = function (n) {
    if (!win[n]) {
      var w = new Float64Array(n);
      for (var i = 0; i < n; i++) w[i] = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (n - 1));
      win[n] = w;
    }
    return win[n];
  };
})();
