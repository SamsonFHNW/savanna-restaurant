# Savanna — Restaurant Éthiopien et Érythréen & Bar

Website for Savanna, a family-run Ethiopian & Eritrean restaurant in Delémont (Jura, Switzerland).

- **Frontend** — static HTML/CSS/JS, no framework. **4 languages** (FR default · EN · DE · IT)
  with path-based routing (`/fr/`, `/en/`, `/de/`, `/it/`) and localized slugs.
  Aesthetic is *elegant · moody · luxurious* (dual-mode dark/light sections, slow motion) —
  see [DESIGN.md](DESIGN.md) for the full visual/motion spec.
- **Backend** — FastAPI reservation + contact service. Email-only (powered by SMTP or
  Resend): emails the owner a notification and emails the customer a confirmation
  **in their language**. **No database** — reservations live in the owner's inbox.

```
frontend/
  src/            language-neutral page templates (edit these)
  build_i18n.py   generator: src/ + i18n/*.json → fr/ en/ de/ it/
  i18n/           fr.json  en.json  de.json  it.json
  fr/ en/ de/ it/ GENERATED — one folder per language (do not edit by hand)
  index.html      redirects "/" to the visitor's language
  style.css  main.js  config.js  assets/
  _headers  _redirects  robots.txt  sitemap.xml   Cloudflare Pages config + SEO
backend/    app/ (FastAPI, app/templates/ for emails) · requirements.txt · .env.example
render.yaml Render blueprint for the backend (repo root)
DEPLOYMENT.md  full production deploy guide (Render + Cloudflare + Resend + DNS)
```

### Internationalization
The site is generated: edit `src/*.html` (page structure) and `i18n/*.json` (all strings),
then rebuild. **Never edit the `fr/ en/ de/ it/` folders directly — they are overwritten.**

```bash
cd frontend
python3 build_i18n.py     # regenerates all 24 pages
```

- URLs: `/fr/`, `/fr/menu`, `/fr/reserver`, `/fr/contact`, `/fr/gallerie` — and the
  localized equivalents, e.g. `/de/reservieren`, `/it/prenotare`, `/en/gallery`.
- Each page carries `<html lang>` + `hreflang` alternates; translations are baked in
  (good for SEO), with a `?v=<hash>` on `style.css`/`main.js` for cache-busting.
- **`de.json` and `it.json` are machine-drafted** (flagged in their `_meta.review` key) —
  have a native speaker review them before launch. Dish names stay in the original; only
  descriptions are translated.

## Facts rendered on the site
- **Address:** Rue Albert Schnyder 4, 2800 Delémont
- **Phone:** 032 422 73 10
- **Hours:** Mon 11:00–23:00 · Tue closed · Wed–Thu 11:00–23:00 · Fri–Sat 10:30–01:30 · Sun 10:00–23:00

---

## Run locally

### Frontend
Pages are pre-generated. Any static server works — serve from `frontend/`:
```bash
cd frontend
python3 build_i18n.py           # only needed after editing src/ or i18n/
python3 -m http.server 5500
# open http://localhost:5500  →  redirects to /fr/ (or your browser language)
```

### Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then fill in the values
uvicorn app.main:app --reload --port 8000
```
Health check: <http://localhost:8000/health> (liveness) · <http://localhost:8000/api/health> (config detail)

With no `RESEND_API_KEY` set, the backend still validates and returns
`{"status":"ok"}`; it logs the email it *would* have sent. Fill in `.env` to actually deliver.

The frontend picks the backend URL by hostname in `frontend/config.js`:
`http://localhost:8000` on localhost, `https://api.savanna-restaurant.ch` in production.

---

## API

| Method | Path                | Purpose                                        |
|--------|---------------------|------------------------------------------------|
| GET    | `/health`           | Liveness probe (Render health check)           |
| GET    | `/api/health`       | Extended: environment + whether email is configured |
| GET    | `/api/slots?date=`  | Bookable time slots for an ISO date            |
| POST   | `/api/reservations` | Validate + email the owner and the customer    |
| POST   | `/api/contact`      | Validate + email the owner                     |

Success: `{"status":"ok"}` · Error: `{"status":"error","message":"…"}` (French).

The reservation payload includes a `lang` field (`"fr" | "en" | "de" | "it"`, default `"fr"`).
The **customer** confirmation email is sent in that language, using the templates in
`backend/app/templates/customer_confirmation_{lang}.txt` (DE/IT drafted for native review).
The **owner** notification email is always French.

**Server-side validation** rejects: Tuesdays, times outside that day's opening hours,
dates in the past or more than 60 days ahead, party size > 8, and filled honeypot.
Rate limit: 5 requests per IP per hour.

---

## Deployment

Full step-by-step instructions — Render, Cloudflare Pages, Infomaniak DNS, Resend domain
verification, a post-deploy checklist and the monthly cost breakdown — are in
**[DEPLOYMENT.md](DEPLOYMENT.md)**.

In short: the **frontend** deploys to **Cloudflare Pages** (output dir `frontend/`, with
`_headers`, `_redirects`, `robots.txt`, `sitemap.xml`) at `savanna-restaurant.ch`; the
**backend** deploys to **Render** from the root `render.yaml` (region `frankfurt`, plan
`starter`, health check `/health`) at `api.savanna-restaurant.ch`. Email goes through
**Resend**.

### Backend environment variables (set in the Render dashboard)
| Variable | Purpose |
|----------|---------|
| `OWNER_EMAIL` | Where reservations/messages are sent |
| `RESEND_API_KEY` | Resend API key for email delivery |
| `FROM_EMAIL` | Verified sender (`reservations@savanna-restaurant.ch`) |
| `CORS_ORIGINS` | Comma-separated CORS allow-list (the frontend origins) |
| `ENVIRONMENT` | `development` \| `production` |

---

## Placeholders to replace
- Hero, dish, about, and gallery images are warm-toned Unsplash placeholders — marked
  `TODO` in the HTML. Swap for real photography.
- Menu (`/menu`) shows an 80×80 thumbnail per dish (64×64 on mobile). Each `src` is flagged
  `TODO`: warm-toned Unsplash stand-ins where a photo matches, otherwise the neutral cream
  `assets/dish-placeholder.svg`. Any thumbnail whose photo fails to load also falls back to
  that placeholder at runtime. Swap in real dish photos (square crops work best).
- Menu prices are placeholders (CHF 4–32). Confirm the real menu.
- Social links in the footer are `#`.
- `OWNER_EMAIL` is set via env var — TBD.

## Future upgrade path
SQLite + SQLAlchemy for stored reservations · password-protected `/admin` bookings view ·
per-slot capacity limits. The FastAPI service stays the same — add DB writes alongside the
existing email notifications.

WhatsApp / two-way messaging (confirm/decline via Twilio) is a possible v2 addition **if
the owner asks for it later** — it is no longer part of the default setup.
