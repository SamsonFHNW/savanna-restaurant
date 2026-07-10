/* Root language redirect for "/" (frontend/index.html).
   Sends the visitor to their preferred language: a saved choice in
   localStorage > browser language > French. Kept as an external file so the
   site can use a strict Content-Security-Policy (script-src 'self', no
   'unsafe-inline'). A <meta http-equiv="refresh"> in index.html is the no-JS
   fallback. */
(function () {
  var supported = ['fr', 'en', 'de', 'it'];
  var saved = null;
  try { saved = localStorage.getItem('savanna_lang'); } catch (e) {}
  var browser = (navigator.language || 'fr').slice(0, 2).toLowerCase();
  var lang = (saved && supported.indexOf(saved) > -1) ? saved
    : (supported.indexOf(browser) > -1 ? browser : 'fr');
  window.location.replace('/' + lang + '/');
})();
