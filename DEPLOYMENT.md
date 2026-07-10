# Deployment — Savanna

Production setup for **savanna-restaurant.ch**.

| Layer | Host | URL |
|-------|------|-----|
| Frontend (static site) | Cloudflare Pages | `https://savanna-restaurant.ch` (+ `www`) |
| Backend (FastAPI) | Render | `https://api.savanna-restaurant.ch` |
| Email | Resend | sender `reservations@savanna-restaurant.ch` |
| Domain / DNS | Infomaniak | `savanna-restaurant.ch` |

Reservations are **email-only**: on a valid submission the backend emails the owner
a notification (French) and emails the customer a confirmation in their language.
There is no database.

---

## 1. Prerequisites

- **GitHub** — this repository, pushed to GitHub (Render and Cloudflare deploy from it).
- **Render account** — https://render.com (for the backend). The `starter` plan
  (~USD 7/mo) keeps the service always-on (no cold starts).
- **Cloudflare account** — https://dash.cloudflare.com (for Cloudflare Pages, free).
- **Resend account** — https://resend.com (email delivery; free tier = 100 emails/day).
- **Domain** — `savanna-restaurant.ch` registered at **Infomaniak**, with access to its
  DNS zone.

You will collect three values while deploying and wire them together at the end:
the Render service URL, the Cloudflare Pages URL, and the Resend DNS records.

---

## 2. Backend → Render

The repo ships a **`render.yaml`** blueprint at the root (service `savanna-api`,
region `frankfurt`, plan `starter`, health check `/health`).

1. **Create the service.**
   Render dashboard → **New → Blueprint** → connect this GitHub repo. Render reads
   `render.yaml` and proposes the `savanna-api` web service. Apply it.
   (Manual alternative: New → Web Service, root directory `backend`,
   build `pip install -r requirements.txt`,
   start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check `/health`.)

2. **Set environment variables** (dashboard → the service → **Environment**). These are
   declared in `render.yaml` with `sync: false`, so you fill the values here:

   | Variable | Value |
   |----------|-------|
   | `OWNER_EMAIL` | the address that should receive reservations (e.g. `info@savanna-restaurant.ch`) |
   | `RESEND_API_KEY` | from Resend → API Keys (`re_…`) |
   | `FROM_EMAIL` | `reservations@savanna-restaurant.ch` |
   | `CORS_ORIGINS` | `https://savanna-restaurant.ch,https://www.savanna-restaurant.ch` |
   | `ENVIRONMENT` | `production` (already defaulted in `render.yaml`) |

3. **Deploy** and confirm health: open `https://<service>.onrender.com/health` →
   `{"status":"ok"}`. `/api/health` additionally reports whether email is configured.

4. **Custom domain.** Service → **Settings → Custom Domains** → add
   `api.savanna-restaurant.ch`. Render shows a target hostname (e.g.
   `savanna-api.onrender.com`) — add the matching `CNAME` at Infomaniak (see §4).
   Render **auto-provisions the SSL certificate** once DNS resolves.

---

## 3. Frontend → Cloudflare Pages

The site is static, pre-generated into `frontend/` (one folder per language). It also
ships `_headers` (security headers), `_redirects`, `robots.txt` and `sitemap.xml`.

1. **Create the project.**
   Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** →
   pick this repo.
   - **Build command:** none — the pages are pre-built and committed.
     (Only run `python3 build_i18n.py` locally after editing `src/` or `i18n/`.)
   - **Build output directory:** `frontend`
   - **Root directory:** repository root.

2. **First deploy** gives a `*.pages.dev` URL — open it and click through all four
   languages to sanity-check.

3. **Custom domains.** Project → **Custom domains** → add both
   `savanna-restaurant.ch` **and** `www.savanna-restaurant.ch`. Cloudflare walks you
   through the DNS (see §4) and **auto-provisions SSL** for both.

4. **www → apex redirect.** So `www` canonicalizes to the bare domain, add a
   **Redirect Rule** (dashboard → your domain → **Rules → Redirect Rules → Create**):
   - When incoming host **equals** `www.savanna-restaurant.ch`
   - Then **static/dynamic redirect** to
     `https://savanna-restaurant.ch/${http.request.uri.path}`, status **301**.

   > Note: Cloudflare Pages `_redirects` matches on **path only**, not hostname, so the
   > `www → apex` redirect is done as a Redirect Rule rather than in `_redirects`.
   > The `/` → language entry point is handled **client-side** in `frontend/index.html`
   > (it honors a saved language in `localStorage`, falling back to `/fr/`); a hard edge
   > redirect is intentionally avoided so that preference logic can run.

---

## 4. DNS records at Infomaniak

In the Infomaniak dashboard → domain `savanna-restaurant.ch` → **DNS zone**, add:

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| `CNAME` | `www` | *(the Cloudflare Pages target, e.g. `savanna-restaurant-ch.pages.dev`)* | Frontend `www` |
| `A` / `ALIAS` | `@` (root) | *(per Cloudflare's custom-domain instructions)* | Frontend apex |
| `CNAME` | `api` | *(the Render target, e.g. `savanna-api.onrender.com`)* | Backend API |
| `TXT` / `CNAME` | *(Resend records)* | *(SPF + DKIM values from Resend)* | Email domain verification |

Notes:
- **Apex (`@`)**: a `CNAME` is not valid at the zone apex. Follow Cloudflare's
  custom-domain screen — either use Infomaniak's `ALIAS`/flattened record, or move the
  domain's nameservers to Cloudflare (then Pages manages the apex for you).
- Fill the bracketed targets with the **actual** hostnames Render and Cloudflare show
  you; they differ per project.
- DNS changes can take up to a few hours to propagate; SSL is auto-issued after that.

---

## 5. Resend — verify the sending domain

Email will not deliver (or will land in spam) until the domain is verified.

1. Resend → **Domains → Add Domain** → `savanna-restaurant.ch`.
2. Resend lists DNS records to add at Infomaniak:
   - **SPF** — a `TXT` record on the domain (e.g. `v=spf1 include:...resend... ~all`).
   - **DKIM** — one or more `CNAME` (or `TXT`) records (e.g. `resend._domainkey…`).
   - Optionally a **DMARC** `TXT` record on `_dmarc`.
3. Add those records in the Infomaniak DNS zone, then click **Verify** in Resend.
4. Once verified, create an **API key** and set it as `RESEND_API_KEY` on Render (§2).
   Confirm `FROM_EMAIL` (`reservations@savanna-restaurant.ch`) is on the verified domain.

---

## 6. Post-deployment testing checklist

- [ ] `https://savanna-restaurant.ch` loads over HTTPS.
- [ ] `https://www.savanna-restaurant.ch` **redirects** to the apex.
- [ ] SSL padlock shows (valid certificate) on apex, `www`, and `api`.
- [ ] All four language versions load: `/fr/`, `/en/`, `/de/`, `/it/`.
- [ ] Reservation form submits successfully and shows the success message.
- [ ] **Owner** receives the test reservation email (check inbox **and** spam).
- [ ] **Customer** receives the confirmation email **in the language selected** on the site.
- [ ] Mobile version works on a real phone (layout, form, language switch).
- [ ] Google Maps embed loads on the contact/hours section.
- [ ] Opening hours are correct — including **Tuesday closed**.
- [ ] `https://api.savanna-restaurant.ch/health` returns `{"status":"ok"}`.

Tip: the backend logs each reservation (sanitized — no name/phone in logs) and every
email send success/failure, so Render's **Logs** tab confirms delivery during testing.

---

## 7. Estimated monthly cost

| Item | Cost |
|------|------|
| Domain (`savanna-restaurant.ch`, Infomaniak) | ~CHF 1/month (annual fee amortized) |
| Cloudflare Pages | free |
| Render (`starter`) | ~CHF 7/month |
| Resend (free tier, up to 100 emails/day) | free |
| **Total** | **~CHF 8–10/month** |
