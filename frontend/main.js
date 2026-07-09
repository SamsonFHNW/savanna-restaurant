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

  /* ═══ Shared motion capabilities ═══ */
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FINE_POINTER = window.matchMedia('(pointer: fine)').matches;

  /* ═══ Adaptive navigation (colour + solidity from the section behind) ═══ */
  var header = document.getElementById('site-header');
  var isHome = header && header.hasAttribute('data-home');
  if (header) {
    var hero = document.querySelector('.hero');
    // Which theme sits under the nav line right now?
    var themed = Array.prototype.slice.call(document.querySelectorAll('[data-theme]'));
    var navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height'), 10) || 72;

    function setNavTheme(theme) {
      header.classList.toggle('on-dark', theme === 'dark');
      header.classList.toggle('on-light', theme === 'light');
    }
    // Observe each themed section; the one crossing the nav band wins.
    if ('IntersectionObserver' in window && themed.length) {
      var navObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) setNavTheme(e.target.getAttribute('data-theme'));
        });
      }, { rootMargin: '-' + (navH / 2) + 'px 0px -' + (window.innerHeight - navH / 2 - 1) + 'px 0px', threshold: 0 });
      themed.forEach(function (s) { navObserver.observe(s); });
    }
    // Solid background once we've scrolled past the hero; interior pages are solid from the top.
    var lastSolid = null;
    var onNavScroll = function () {
      var solid = hero ? window.scrollY > (hero.offsetHeight - navH) : true;
      if (solid !== lastSolid) { header.classList.toggle('is-solid', solid); lastSolid = solid; }
    };
    window.addEventListener('scroll', onNavScroll, { passive: true });
    // Seed the initial theme: hero (dark) on home, else the first themed section.
    setNavTheme(isHome ? 'dark' : (themed[0] ? themed[0].getAttribute('data-theme') : 'light'));
    onNavScroll();
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
      // Skip elements we've split into word-spans for the hero entrance —
      // rewriting textContent would destroy the animation markup.
      if (el.hasAttribute('data-words')) return;
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

  /* ═══ Hero entrance — split the title into word-spans and animate ═══ */
  document.querySelectorAll('[data-words]').forEach(function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach(function (w, i) {
      var outer = document.createElement('span');
      outer.className = 'word';
      var inner = document.createElement('span');
      inner.textContent = w;
      inner.style.setProperty('--word-delay', (i * 100) + 'ms');
      outer.appendChild(inner);
      el.appendChild(outer);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
    // Trigger on next frame so the initial hidden state paints first.
    requestAnimationFrame(function () { el.classList.add('words-in'); });
  });

  /* ═══ Scroll-triggered reveals (IntersectionObserver, once, staggered) ═══ */
  (function () {
    var groups = document.querySelectorAll('[data-reveal]');
    var singles = document.querySelectorAll('.reveal');
    // Stagger direct-child reveals inside a [data-reveal] container by ~80ms.
    groups.forEach(function (group) {
      var items = group.querySelectorAll('.reveal');
      items.forEach(function (item, i) {
        if (!item.style.getPropertyValue('--reveal-delay')) {
          item.style.setProperty('--reveal-delay', (i * 80) + 'ms');
        }
      });
    });
    if (REDUCED || !('IntersectionObserver' in window)) {
      singles.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.2 });
    singles.forEach(function (el) { io.observe(el); });
  })();

  /* ═══ Hero parallax — image scrolls 20% slower than the page ═══ */
  (function () {
    if (REDUCED) return;
    var layer = document.querySelector('.hero__parallax');
    if (!layer) return;
    var ticking = false;
    function update() {
      layer.style.transform = 'translate3d(0,' + (window.scrollY * 0.2) + 'px,0)';
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
  })();

  /* ═══ Hero fire — glow + embers rising from the shekla coals ═══ */
  (function () {
    if (REDUCED) return;
    var canvas = document.getElementById('hero-fire');
    if (!canvas || !canvas.getContext) return;
    var hero = canvas.closest('.hero');
    var ctx = canvas.getContext('2d');
    var img = hero.querySelector('.hero__bg');
    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, coalX = 0, coalY = 0;
    var FX = 0.62, FY = 0.53;          // coal window within the photo
    function computeCoal() {
      var nw = img && img.naturalWidth, nh = img && img.naturalHeight;
      if (!nw || !nh) { coalX = W * FX; coalY = H * FY; return; }
      var s = Math.max(W / nw, H / nh), rw = nw * s, rh = nh * s;   // object-fit: cover
      coalX = (W - rw) / 2 + FX * rw;
      coalY = (H - rh) / 2 + FY * rh;
    }
    function size() {
      var r = hero.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      computeCoal();
    }
    size();
    window.addEventListener('resize', size, { passive: true });
    if (img) img.addEventListener('load', size);

    var embers = [];
    function spawn() {
      embers.push({
        x: coalX + (Math.random() - 0.5) * W * 0.07,
        y: coalY + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(0.35 + Math.random() * 0.85),
        r: 0.8 + Math.random() * 1.7,
        life: 0, max: 90 + Math.random() * 90,
        hue: 20 + Math.random() * 22
      });
    }
    var visible = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; })
        .observe(hero);
    }
    function frame() {
      requestAnimationFrame(frame);
      ctx.clearRect(0, 0, W, H);
      if (!visible || document.hidden) return;
      ctx.globalCompositeOperation = 'lighter';
      var flick = 0.5 + 0.08 * Math.sin(Date.now() / 130) + Math.random() * 0.12;
      // Soft flickering glow over the coals
      var gr = Math.max(W, H) * 0.2;
      var gg = ctx.createRadialGradient(coalX, coalY, 0, coalX, coalY, gr);
      gg.addColorStop(0, 'hsla(22,100%,55%,' + (0.32 * flick) + ')');
      gg.addColorStop(1, 'hsla(22,100%,50%,0)');
      ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H);
      // Flame licking up from the coals
      var fh = Math.min(W, H) * (0.17 + 0.035 * Math.sin(Date.now() / 90) + Math.random() * 0.03);
      var fw = Math.min(W, H) * 0.06;
      ctx.save();
      ctx.translate(coalX + (Math.random() - 0.5) * fw * 0.4, coalY + fh * 0.08);
      var fg = ctx.createLinearGradient(0, 0, 0, -fh);
      fg.addColorStop(0, 'hsla(32,100%,62%,' + (0.55 * flick) + ')');
      fg.addColorStop(0.5, 'hsla(24,100%,52%,' + (0.24 * flick) + ')');
      fg.addColorStop(1, 'hsla(18,100%,45%,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.ellipse(0, -fh / 2, fw, fh / 2, 0, 0, 6.283); ctx.fill();
      ctx.restore();
      // Rising embers
      if (embers.length < 90 && Math.random() < 0.9) spawn();
      for (var i = embers.length - 1; i >= 0; i--) {
        var p = embers[i];
        p.life++;
        p.x += p.vx; p.y += p.vy;
        p.vy -= 0.0018;
        p.vx += (Math.random() - 0.5) * 0.05;
        var t = p.life / p.max;
        if (t >= 1) { embers.splice(i, 1); continue; }
        var a = Math.sin((1 - t) * Math.PI) * 0.9 * (0.7 + Math.random() * 0.3);
        var rad = p.r * 4;
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        g.addColorStop(0, 'hsla(' + p.hue + ',100%,72%,' + a + ')');
        g.addColorStop(0.35, 'hsla(' + p.hue + ',100%,58%,' + (a * 0.7) + ')');
        g.addColorStop(1, 'hsla(' + p.hue + ',100%,50%,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 6.283); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    requestAnimationFrame(frame);
  })();

  /* ═══ Menu — active chapter in the sticky sub-nav ═══ */
  (function () {
    var chapters = document.querySelectorAll('.menu-chapter[id]');
    var links = document.querySelectorAll('.menu-nav__list a');
    if (!chapters.length || !links.length || !('IntersectionObserver' in window)) return;
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var mio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          links.forEach(function (a) { a.classList.remove('is-active'); });
          var a = byId[e.target.id];
          if (a) a.classList.add('is-active');
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
    chapters.forEach(function (c) { mio.observe(c); });
  })();

  /* ═══ Custom cursor (desktop pointer devices only) ═══ */
  (function () {
    if (REDUCED || !FINE_POINTER) return;
    var dot = document.createElement('div'); dot.className = 'cursor-dot';
    var ring = document.createElement('div'); ring.className = 'cursor-ring';
    dot.style.opacity = '0'; ring.style.opacity = '0';   // hidden until the pointer first moves
    document.body.appendChild(dot); document.body.appendChild(ring);
    document.body.classList.add('has-cursor');
    var rx = 0, ry = 0, dx = 0, dy = 0, raf, shown = false;
    document.addEventListener('mousemove', function (e) {
      dx = e.clientX; dy = e.clientY;
      if (!shown) { dot.style.opacity = '1'; ring.style.opacity = '1'; shown = true; }
      dot.style.transform = 'translate(' + dx + 'px,' + dy + 'px) translate(-50%,-50%)';
      if (!raf) raf = requestAnimationFrame(follow);
    });
    function follow() {
      rx += (dx - rx) * 0.2; ry += (dy - ry) * 0.2;
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px) translate(-50%,-50%)';
      raf = (Math.abs(dx - rx) > 0.1 || Math.abs(dy - ry) > 0.1) ? requestAnimationFrame(follow) : null;
    }
    var INTERACTIVE = 'a, button, input, select, textarea, [role="menuitem"], .dish-card, .masonry img';
    document.addEventListener('mouseover', function (e) {
      if (e.target.closest(INTERACTIVE)) ring.classList.add('is-hover');
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target.closest(INTERACTIVE)) ring.classList.remove('is-hover');
    });
  })();

  /* ═══ Page transitions — fade to espresso, then navigate (no framework) ═══ */
  (function () {
    var root = document.documentElement;
    root.classList.add('js-fade');
    var overlay = document.createElement('div'); overlay.className = 'page-fade';
    document.body.appendChild(overlay);

    // Fade the new page up from dark on arrival.
    requestAnimationFrame(function () { document.body.classList.add('is-ready'); });
    // Restore state if the page is served from the bfcache (back/forward).
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) { overlay.classList.remove('is-leaving'); document.body.classList.add('is-ready'); }
    });
    if (REDUCED) return;

    function isInternal(a) {
      if (!a || !a.href) return false;
      if (a.target === '_blank' || a.hasAttribute('download')) return false;
      if (a.getAttribute('href').indexOf('#') === 0) return false;
      if (a.dataset.noTransition != null) return false;
      var url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return false;
      if (url.pathname === location.pathname && url.hash) return false; // same-page anchor
      return url.protocol === 'http:' || url.protocol === 'https:';
    }
    document.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      var a = e.target.closest('a');
      if (!isInternal(a)) return;
      e.preventDefault();
      overlay.classList.add('is-leaving');
      setTimeout(function () { window.location.href = a.href; }, 300);
    });
  })();

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
