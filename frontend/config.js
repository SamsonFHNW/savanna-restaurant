/* Runtime config — set the backend URL for the reservation/contact forms.
   Loaded before main.js on every page.

   Local dev:  leave as-is (defaults to http://localhost:8000 in main.js).
   Production: set this to your deployed backend, e.g.
     window.SAVANNA_API = 'https://savanna-api.onrender.com'; */
window.SAVANNA_API = window.SAVANNA_API || 'http://localhost:8000';
