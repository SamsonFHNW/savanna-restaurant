/* Runtime config — picks the backend URL for the reservation/contact forms.
   Loaded before main.js on every page.

   Local dev (localhost / 127.0.0.1)  → http://localhost:8000
   Production (any other hostname)    → https://api.savanna-restaurant.ch */
(function () {
  var host = window.location.hostname;
  var isLocal = host.indexOf('localhost') !== -1 || host.indexOf('127.0.0.1') !== -1;
  window.SAVANNA_API = isLocal
    ? 'http://localhost:8000'
    : 'https://api.savanna-restaurant.ch';
})();
