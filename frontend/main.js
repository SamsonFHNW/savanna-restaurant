/* ═══════════════════════════════════════════════════════
   Savanna — Frontend JS (shared across all pages/languages)
   Language is determined by the URL folder (/fr/ /en/ /de/ /it/)
   and reflected in <html lang>. Content is baked per language;
   this script handles the selector, dynamic strings, and forms.
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var API_BASE = window.SAVANNA_API || 'http://localhost:8000';
  var SUPPORTED = ['fr', 'en', 'de', 'it'];
  var STORAGE_KEY = 'savanna_lang';

  // Current language = the folder we're in, mirrored on <html lang>.
  var currentLang = (document.documentElement.lang || 'fr').toLowerCase();
  if (SUPPORTED.indexOf(currentLang) === -1) currentLang = 'fr';
  // Remember it so the root redirect ("/") sends the visitor back here next time.
  try { localStorage.setItem(STORAGE_KEY, currentLang); } catch (e) {}

  var DICT = null; // loaded translation dict for the current language

  // FR fallbacks for dynamic strings, used only if the dict hasn't loaded yet.
  var FALLBACK = {
    form_required: 'Veuillez remplir tous les champs obligatoires.',
    res_tuesday: 'Nous sommes fermés le mardi.',
    sending: 'Envoi en cours…',
    res_success: 'Merci ! Nous vous confirmerons votre réservation par téléphone dans les 24h.',
    generic_error: 'Une erreur est survenue. Réessayez.',
    network_error: 'Impossible de contacter le serveur. Réessayez plus tard.',
    contact_required: 'Veuillez remplir tous les champs.',
    contact_success: 'Merci ! Votre message a bien été envoyé.',
    slot_pick_date: 'Choisir la date d’abord…',
    slot_closed: 'Fermé le mardi',
    slot_none: 'Aucun créneau',
    slot_choose: 'Choisir…'
  };

  function jm(key) {
    if (DICT && DICT.js && DICT.js[key] != null) return DICT.js[key];
    return FALLBACK[key] || '';
  }

  /* ─── Opening hours (weekday 0=Sun … 6=Sat, JS getDay convention) ─── */
  var HOURS = {
    0: { open: 600, close: 1380 },  // Sunday   10:00–23:00
    1: { open: 660, close: 1380 },  // Monday   11:00–23:00
    2: null,                        // Tuesday  closed
    3: { open: 660, close: 1380 },  // Wednesday 11:00–23:00
    4: { open: 660, close: 1380 },  // Thursday 11:00–23:00
    5: { open: 630, close: 90 },    // Friday   10:30–01:30 (next day)
    6: { open: 630, close: 90 }     // Saturday 10:30–01:30 (next day)
  };
  var SLOT_STEP = 30;
  var LAST_SEATING = 60;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function minutesToLabel(mins) {
    var m = ((mins % 1440) + 1440) % 1440;
    return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  }
  function slotsForWeekday(day) {
    var h = HOURS[day];
    if (!h) return [];
    var open = h.open, close = h.close;
    if (close <= open) close += 1440;
    var last = close - LAST_SEATING, out = [];
    for (var t = open; t <= last; t += SLOT_STEP) out.push(minutesToLabel(t));
    return out;
  }

  /* ═══ Navigation (scroll + hamburger) ═══ */
  var header = document.getElementById('site-header');
  var isHome = header && header.hasAttribute('data-home');
  if (isHome) {
    var lastSolid = false;
    var onScroll = function () {
      var solid = window.scrollY > 80;
      if (solid !== lastSolid) {
        header.classList.toggle('site-header--solid', solid);
        header.classList.toggle('site-header--over-hero', !solid);
        lastSolid = solid;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  var navToggle = document.getElementById('nav-toggle');
  var navCluster = document.getElementById('nav-cluster');
  if (navToggle && navCluster) {
    navToggle.addEventListener('click', function () {
      var open = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', String(!open));
      navCluster.classList.toggle('nav__cluster--open', !open);
    });
    navCluster.querySelectorAll('.nav__link').forEach(function (link) {
      link.addEventListener('click', function () {
        navToggle.setAttribute('aria-expanded', 'false');
        navCluster.classList.remove('nav__cluster--open');
      });
    });
  }

  /* ═══ Language selector ═══ */
  var lang = document.getElementById('lang');
  var langToggle = document.getElementById('lang-toggle');
  if (lang && langToggle) {
    langToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = lang.classList.toggle('lang--open');
      langToggle.setAttribute('aria-expanded', String(open));
    });
    // Remember the chosen language before navigating to that folder.
    lang.querySelectorAll('.lang__option').forEach(function (opt) {
      opt.addEventListener('click', function () {
        try { localStorage.setItem(STORAGE_KEY, opt.getAttribute('data-lang')); } catch (e) {}
      });
    });
    document.addEventListener('click', function (e) {
      if (!lang.contains(e.target)) {
        lang.classList.remove('lang--open');
        langToggle.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        lang.classList.remove('lang--open');
        langToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ═══ i18n dict (content is baked; re-apply is a safety net + powers dynamic strings) ═══ */
  function getNested(obj, path) {
    return path.split('.').reduce(function (o, k) { return o && o[k]; }, obj);
  }
  function applyDict(dict) {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var val = getNested(dict, el.getAttribute('data-i18n'));
      if (val != null) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var val = getNested(dict, el.getAttribute('data-i18n-placeholder'));
      if (val != null) el.placeholder = val;
    });
  }

  /* ═══ Date + time-slot wiring (reservation page) ═══ */
  var dateInput = document.getElementById('res-date');
  var timeSelect = document.getElementById('res-time');
  var todayStr = new Date().toISOString().split('T')[0];

  function addOption(sel, value, label) {
    var o = document.createElement('option');
    o.value = value; o.textContent = label;
    sel.appendChild(o);
  }
  function refreshTimeSlots() {
    if (!dateInput || !timeSelect) return;
    var val = dateInput.value;
    timeSelect.innerHTML = '';
    if (!val) { addOption(timeSelect, '', jm('slot_pick_date')); return; }
    var day = new Date(val + 'T00:00:00').getDay();
    if (day === 2) { addOption(timeSelect, '', jm('slot_closed')); return; }
    var slots = slotsForWeekday(day);
    if (!slots.length) { addOption(timeSelect, '', jm('slot_none')); return; }
    addOption(timeSelect, '', jm('slot_choose'));
    slots.forEach(function (s) { addOption(timeSelect, s, s); });
  }
  if (dateInput) {
    dateInput.setAttribute('min', todayStr);
    var max = new Date();
    max.setDate(max.getDate() + 60);
    dateInput.setAttribute('max', max.toISOString().split('T')[0]);
    dateInput.addEventListener('change', refreshTimeSlots);
  }

  /* ═══ Reservation form ═══ */
  var resForm = document.getElementById('reservation-form');
  if (resForm) {
    var resStatus = document.getElementById('form-status');
    resForm.addEventListener('submit', function (e) {
      e.preventDefault();
      setStatus(resStatus, '', '');
      var data = Object.fromEntries(new FormData(resForm).entries());
      if (data.website) return; // honeypot

      if (!data.name || !data.email || !data.phone || !data.date || !data.time) {
        setStatus(resStatus, 'error', jm('form_required')); return;
      }
      if (new Date(data.date + 'T00:00:00').getDay() === 2) {
        setStatus(resStatus, 'error', jm('res_tuesday')); return;
      }

      var btn = resForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      var original = btn.textContent;
      btn.textContent = jm('sending');

      fetch(API_BASE + '/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          phone: data.phone,
          date: data.date,
          time: data.time,
          guests: parseInt(data.guests, 10),
          message: data.message || '',
          lang: currentLang,
          website: data.website || ''
        })
      })
        .then(function (res) { return res.json().then(function (b) { return { ok: res.ok, body: b }; }); })
        .then(function (r) {
          if (r.ok && r.body.status === 'ok') {
            setStatus(resStatus, 'success', jm('res_success'));
            resForm.reset();
            refreshTimeSlots();
          } else {
            setStatus(resStatus, 'error', r.body.message || jm('generic_error'));
          }
        })
        .catch(function () { setStatus(resStatus, 'error', jm('network_error')); })
        .finally(function () { btn.disabled = false; btn.textContent = original; });
    });
  }

  /* ═══ Contact form ═══ */
  var contactForm = document.getElementById('contact-form');
  if (contactForm) {
    var contactStatus = document.getElementById('contact-status');
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      setStatus(contactStatus, '', '');
      var data = Object.fromEntries(new FormData(contactForm).entries());
      if (data.website) return;

      if (!data.name || !data.email || !data.message) {
        setStatus(contactStatus, 'error', jm('contact_required')); return;
      }

      var btn = contactForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      var original = btn.textContent;
      btn.textContent = jm('sending');

      fetch(API_BASE + '/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name, email: data.email, message: data.message, website: data.website || ''
        })
      })
        .then(function (res) { return res.json().then(function (b) { return { ok: res.ok, body: b }; }); })
        .then(function (r) {
          if (r.ok && r.body.status === 'ok') {
            setStatus(contactStatus, 'success', jm('contact_success'));
            contactForm.reset();
          } else {
            setStatus(contactStatus, 'error', r.body.message || jm('generic_error'));
          }
        })
        .catch(function () { setStatus(contactStatus, 'error', jm('network_error')); })
        .finally(function () { btn.disabled = false; btn.textContent = original; });
    });
  }

  function setStatus(el, type, msg) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'form__status' + (type ? ' form__status--' + type : '');
  }

  /* ═══ Gallery lightbox ═══ */
  var masonry = document.getElementById('masonry');
  var lightbox = document.getElementById('lightbox');
  if (masonry && lightbox) {
    var lbImg = document.getElementById('lightbox-img');
    var lbClose = document.getElementById('lightbox-close');
    masonry.addEventListener('click', function (e) {
      var img = e.target.closest('img');
      if (!img) return;
      lbImg.src = img.src; lbImg.alt = img.alt;
      lightbox.classList.add('lightbox--open');
      document.body.style.overflow = 'hidden';
    });
    function closeLb() {
      lightbox.classList.remove('lightbox--open');
      lbImg.src = '';
      document.body.style.overflow = '';
    }
    lbClose.addEventListener('click', closeLb);
    lightbox.addEventListener('click', function (e) { if (e.target === lightbox) closeLb(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && lightbox.classList.contains('lightbox--open')) closeLb();
    });
  }

  /* ═══ Lazy-load fade-in (+ menu-thumbnail fallback) ═══ */
  var PLACEHOLDER = '/assets/dish-placeholder.svg';
  document.querySelectorAll('img[loading="lazy"]').forEach(function (img) {
    var isThumb = img.classList.contains('menu-item__thumb');
    img.addEventListener('load', function () { img.classList.add('loaded'); });
    img.addEventListener('error', function () {
      if (isThumb && img.src.indexOf('dish-placeholder') === -1) img.src = PLACEHOLDER;
    });
    if (img.complete) {
      if (img.naturalWidth > 0) img.classList.add('loaded');
      else if (isThumb && img.src.indexOf('dish-placeholder') === -1) img.src = PLACEHOLDER;
    }
  });

  /* ═══ Load the current language dict (dynamic strings + safety re-apply) ═══ */
  fetch('/i18n/' + currentLang + '.json')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      DICT = d;
      applyDict(d);
      refreshTimeSlots(); // now that dynamic labels are available
    })
    .catch(function () { refreshTimeSlots(); }); // fall back to baked/placeholder text
})();
