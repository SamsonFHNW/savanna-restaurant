# Savanna — Design Spec

Visual language: **elegant · moody · luxurious**. Late-night, high-end dining energy
(Noma / Eleven Madison Park / Le Bernardin), not SaaS. Motion is slow and deliberate.
Structure and functionality are unchanged from the original build — this document covers
the visual layer, motion, and typography only.

All of it is hand-written vanilla CSS/JS in `frontend/style.css` and `frontend/main.js`.
No frameworks, no animation libraries. Everything is generated per language by
`frontend/build_i18n.py` (edit `src/` + `i18n/`, never the `fr/ en/ de/ it/` folders).

---

## Colour — dual-mode

Sections **alternate dark / light vertically** for rhythm (hero dark → intro light →
dishes dark → hours light → footer dark). This alternation is what creates the mood.
Theme is set with `data-theme="dark|light"` on a section; it flips the semantic tokens
`--bg`, `--fg`, `--fg-muted`, `--hairline`.

| Role | Dark sections | Light sections |
|------|---------------|----------------|
| Background | `#0F0B08` espresso | `#F5EBD8` warm cream |
| Text | `#F5EBD8` | `#1F1610` |
| Muted text | `#B8A88F` | `#6B5D4F` |

**Accents** (used sparingly, intentionally):
- Terracotta `#A0442B` — CTAs, key hover states, menu prices
- Warm gold `#C9962B` — dividers, dietary tags, hours times, the "S" monogram
- Forest green `#2F4A2A` — small tags / the about pull-quote only

Do **not** add glassmorphism, extra gradients (only the hero + card overlays), neon,
glows, or drop shadows beyond the single soft shadow on menu-thumbnail hover.

---

## Typography

- **Display** — Fraunces **300**, tracking `-0.03em`.
  - Hero name: 120px desktop / 56px mobile
  - Section titles: 64px / 36px
  - Interior page titles: 96px / 44px
- **Micro-caption** (pre-title label) — Inter 11px, uppercase, tracking `0.2em`, muted,
  auto-prefixed with `—` via `.caption::before`. e.g. `— FAMILLE & CUISINE`.
- **Body** — Inter 17px, line-height **1.75**.
- **Pull-quotes / descriptors** — Fraunces italic (32px about quote; 20px menu-chapter
  descriptors like *"La tradition commence ici."*).

---

## Motion

Global: default transition **600ms `cubic-bezier(0.4, 0, 0.2, 1)`** (`--dur`), buttery,
never snappy. No springs, no bounce. Everything runs once except the hero ken-burns.
All of the below is disabled under `prefers-reduced-motion`.

| # | Effect | Notes |
|---|--------|-------|
| 1 | **Hero entrance** | Image settles 105% → 100% over 2000ms (`.hero__media`). Title splits into word-spans (JS `[data-words]`) and rises, staggered 100ms/word. Gold divider grows 0 → 60px over 800ms. Tagline/place/CTA fade up in sequence. |
| 2 | **Ken-burns** | `.hero__bg` scales 100% → 108% over 20s, infinite alternate. The only looping animation. |
| 3 | **Scroll reveals** | `.reveal` fades opacity 0→1 + translateY 20→0. IntersectionObserver, 20% threshold, once. `[data-reveal]` containers stagger children ~80ms. |
| 4 | **Hover** | Buttons/links: terracotta underline draws left→right (400ms), no background change. Nav links: colour→terracotta + underline. Images: scale 1.03 + dark overlay (800ms). Menu thumbnails: rotate −1° + scale 1.05 + gold 4px border + soft shadow. |
| 5 | **Custom cursor** | 8px terracotta dot + 24px ring (→40px over interactive). Desktop `pointer: fine` only; hidden until first move. |
| 6 | **Hero parallax** | `.hero__parallax` translateY at 20% of scroll (rAF, passive). |
| 7 | **Page transitions** | Internal-link click fades a full-screen espresso overlay in (300ms), then navigates; new page fades body up (500ms). `data-no-transition` opts a link out; external / hash / modified clicks are ignored. bfcache-safe via `pageshow`. |
| 8 | **Menu chapters** | Chapter title/descriptor slide in from left on reveal. Sticky sub-nav underlines the active chapter (IntersectionObserver). |

---

## Navigation

Fixed, transparent over the hero. Colour + solidity **adapt to the section behind it**
via an IntersectionObserver on `[data-theme]` sections (`on-dark` → cream text,
`on-light` → ink text). It gains a solid background (`is-solid`) once scrolled past the
hero; **interior pages are solid from the top** so the logo stays readable.

- Logo: Fraunces 300, 22px, tracking `-0.02em`
- Links: Inter 12px uppercase, tracking `0.15em`, 32px apart
- Language selector: current code (`FR`) + caret; menu slides down 400ms. On mobile the
  drawer is full-screen espresso; the selector collapses to a real dropdown.

---

## Section treatments

- **Hero** — 100vh, full-bleed photo, vertical gradient (transparent → `rgba(15,11,8,.5)`).
  Name, gold divider, uppercase tagline, italic `Delémont · Jura`, text-only terracotta CTA.
- **Signature dishes** (dark) — three 3:4 portrait cards; name overlaid bottom-left in
  Fraunces 32px cream; description fades in over a deepening overlay on hover. No prices.
- **Hours + location** (light) — day names in Fraunces 24px, times in gold; a rotated
  vertical `OUVERT JUSQU'À 01H30` banner on the right edge (≥1100px); map embed styled
  dark via CSS filter (`invert hue-rotate`) since the keyless embed can't take a JSON style.
- **Menu** — each chapter opens with a full-width espresso strip (Fraunces 64px title +
  italic descriptor) over a cream dish list; thumbnails gain a gold border on hover.
- **Reservation** — split screen: dark full-bleed interior photo + gold-numbered steps
  (left), cream form (right). Inputs are underline-only; the line fills terracotta on
  focus. Submit is a text-only underline-draw CTA.
- **Footer** (dark) — three columns (visit / explore / hours), gold divider, centred
  italic **S** monogram, copyright left + "Développé par : Samson Hadgu" (LinkedIn) right.

---

## Performance guardrails

- Everything above respects `prefers-reduced-motion` (ken-burns, parallax, cursor, page
  transitions, reveals all off).
- Below-the-fold images are `loading="lazy"`; the hero is `fetchpriority="high"`.
- Custom cursor only initialises on `pointer: fine` devices.
- Scroll reveals + nav + menu use IntersectionObserver, not scroll listeners; the two
  genuine scroll listeners (nav solidity, parallax) are passive and rAF-throttled.
