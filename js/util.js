/* כלים משותפים: בריחת HTML והודעת טוסט */
(function () {
  var GK = (window.GK = window.GK || {});
  var MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /** בורח תווי HTML כדי שטקסט משתמש לא ישבור את הדף */
  GK.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return MAP[c]; });
  };

  /** מציג הודעה קצרה בתחתית המסך */
  GK.toast = function (msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(GK._toastTimer);
    GK._toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  };
})();
