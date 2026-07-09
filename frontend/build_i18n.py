#!/usr/bin/env python3
"""
Savanna — static i18n site generator.

Reads the language-neutral templates in src/ plus i18n/{fr,en,de,it}.json and
generates one fully-translated folder per language:

    fr/  index.html  menu.html  about.html  reserver.html   contact.html  gallerie.html
    en/  index.html  menu.html  about.html  reserve.html    contact.html  gallery.html
    de/  index.html  menu.html  about.html  reservieren.html kontakt.html  galerie.html
    it/  index.html  menu.html  about.html  prenotare.html  contatto.html galleria.html

Per page it: sets <html lang>, adds hreflang alternates, rewrites internal links to
that language's localized slugs, bakes translations into every data-i18n element,
swaps the 2-language toggle for the 4-language selector, and points shared assets
(/style.css, /main.js, /config.js, /i18n, /assets) at the site root.

Run from the frontend/ directory:   python3 build_i18n.py
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
I18N = os.path.join(HERE, "i18n")
DOMAIN = "https://savanna-restaurant.ch"

LANGS = ["fr", "en", "de", "it"]

# page id -> source template + per-language slug (filename stem; "index" = home)
PAGES = {
    "home":    {"src": "index.html",   "slug": {"fr": "index",     "en": "index",   "de": "index",       "it": "index"}},
    "menu":    {"src": "menu.html",    "slug": {"fr": "menu",      "en": "menu",    "de": "menu",        "it": "menu"}},
    "about":   {"src": "about.html",   "slug": {"fr": "about",     "en": "about",   "de": "about",       "it": "about"}},
    "reserve": {"src": "reserver.html","slug": {"fr": "reserver",  "en": "reserve", "de": "reservieren", "it": "prenotare"}},
    "contact": {"src": "contact.html", "slug": {"fr": "contact",   "en": "contact", "de": "kontakt",     "it": "contatto"}},
    "gallery": {"src": "gallerie.html","slug": {"fr": "gallerie",  "en": "gallery", "de": "galerie",     "it": "galleria"}},
    "legal":   {"src": "mentions.html","slug": {"fr": "mentions",  "en": "legal",   "de": "impressum",   "it": "note-legali"}},
}

# source flat filename -> page id (for rewriting internal links)
SRC_LINK_TO_PAGE = {
    "index.html": "home",
    "menu.html": "menu",
    "about.html": "about",
    "reserver.html": "reserve",
    "contact.html": "contact",
    "gallerie.html": "gallery",
    "mentions.html": "legal",
}


def load_dicts():
    d = {}
    for lang in LANGS:
        with open(os.path.join(I18N, f"{lang}.json"), encoding="utf-8") as f:
            d[lang] = json.load(f)
    return d


def get_nested(dic, dotted):
    cur = dic
    for k in dotted.split("."):
        if not isinstance(cur, dict) or k not in cur:
            return None
        cur = cur[k]
    return cur


def out_filename(page, lang):
    slug = PAGES[page]["slug"][lang]
    return "index.html" if slug == "index" else f"{slug}.html"


def clean_path(page, lang):
    """Canonical URL path segment after /{lang}/ (no .html, '' for home)."""
    slug = PAGES[page]["slug"][lang]
    return "" if slug == "index" else slug


def opt_href(page, lang):
    """Absolute link to a page in a given language (for the selector)."""
    slug = PAGES[page]["slug"][lang]
    return f"/{lang}/" if slug == "index" else f"/{lang}/{slug}.html"


def build_hreflang(page):
    lines = []
    for lang in LANGS:
        href = f"{DOMAIN}/{lang}/{clean_path(page, lang)}"
        lines.append(f'  <link rel="alternate" hreflang="{lang}" href="{href}">')
    lines.append(f'  <link rel="alternate" hreflang="x-default" href="{DOMAIN}/fr/{clean_path(page, "fr")}">')
    return "\n".join(lines)


OG_LOCALE = {"fr": "fr_CH", "en": "en_GB", "de": "de_CH", "it": "it_CH"}


def build_page_meta(page, lang):
    """Per-language canonical + og:url + og:locale for this page."""
    url = f"{DOMAIN}/{lang}/{clean_path(page, lang)}"
    return (
        f'  <link rel="canonical" href="{url}">\n'
        f'  <meta property="og:url" content="{url}">\n'
        f'  <meta property="og:locale" content="{OG_LOCALE[lang]}">'
    )


def write_sitemap():
    """A sitemap.xml listing every localized page (search-engine discovery)."""
    urls = []
    for page in PAGES:
        for lang in LANGS:
            urls.append(f"{DOMAIN}/{lang}/{clean_path(page, lang)}")
    body = "\n".join(f"  <url><loc>{u}</loc></url>" for u in urls)
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n</urlset>\n"
    )
    with open(os.path.join(HERE, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(xml)


def build_selector(page, current):
    labels = {"fr": "Français", "en": "English", "de": "Deutsch", "it": "Italiano"}
    opts = []
    for lang in LANGS:
        cur = " lang__option--current" if lang == current else ""
        aria = ' aria-current="true"' if lang == current else ""
        opts.append(
            f'          <li role="none"><a role="menuitem" class="lang__option{cur}"'
            f' hreflang="{lang}" data-lang="{lang}" href="{opt_href(page, lang)}"{aria}>{labels[lang]}</a></li>'
        )
    options = "\n".join(opts)
    return (
        '<div class="lang" id="lang">\n'
        f'          <button class="lang__toggle" id="lang-toggle" type="button" aria-haspopup="true" aria-expanded="false">\n'
        f'            <span class="lang__code">{current.upper()}</span>\n'
        '            <svg class="lang__caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>\n'
        '          </button>\n'
        '          <ul class="lang__menu" id="lang-menu" role="menu">\n'
        f'{options}\n'
        '          </ul>\n'
        '        </div>'
    )


OLD_TOGGLE_RE = re.compile(r'<button class="nav__lang" id="lang-toggle"[^>]*>[^<]*</button>')


def rewrite_links(html, lang):
    def repl(m):
        src_file = m.group(1)
        page = SRC_LINK_TO_PAGE[src_file]
        return f'href="{out_filename(page, lang)}"'
    return re.sub(r'href="(index\.html|menu\.html|about\.html|reserver\.html|contact\.html|gallerie\.html|mentions\.html)"', repl, html)


def bake_text(html, dic):
    # element text: <tag ... data-i18n="key" ...>TEXT<
    def repl_text(m):
        pre, key, mid, text = m.group(1), m.group(2), m.group(3), m.group(4)
        val = get_nested(dic, key)
        return f'{pre}{key}{mid}>{val if val is not None else text}<'
    html = re.sub(r'(data-i18n=")([\w.]+)("[^>]*)>([^<]*)<', repl_text, html)

    # placeholder attr: data-i18n-placeholder="key" ... placeholder="VALUE"
    def repl_ph(m):
        key = m.group(2)
        val = get_nested(dic, key)
        if val is None:
            return m.group(0)
        return f'{m.group(1)}{key}{m.group(3)}placeholder="{val}"'
    html = re.sub(r'(data-i18n-placeholder=")([\w.]+)("[^>]*?\s)placeholder="[^"]*"', repl_ph, html)
    return html


def asset_version():
    """Short content hash so browsers reload style.css/main.js after each build."""
    h = hashlib.sha1()
    for name in ("style.css", "main.js", "config.js"):
        p = os.path.join(HERE, name)
        if os.path.exists(p):
            with open(p, "rb") as f:
                h.update(f.read())
    return h.hexdigest()[:8]


def fix_assets(html, ver):
    html = html.replace('href="style.css"', f'href="/style.css?v={ver}"')
    html = html.replace('src="config.js"', f'src="/config.js?v={ver}"')
    html = html.replace('src="main.js"', f'src="/main.js?v={ver}"')
    html = html.replace('src="assets/dish-placeholder.svg"', 'src="/assets/dish-placeholder.svg"')
    return html


def generate():
    dicts = load_dicts()
    for lang in LANGS:
        outdir = os.path.join(HERE, lang)
        if os.path.isdir(outdir):
            shutil.rmtree(outdir)
        os.makedirs(outdir)

    ver = asset_version()
    count = 0
    for page, cfg in PAGES.items():
        with open(os.path.join(SRC, cfg["src"]), encoding="utf-8") as f:
            template = f.read()
        for lang in LANGS:
            html = template
            html = html.replace('<html lang="fr">', f'<html lang="{lang}">')
            html = fix_assets(html, ver)
            html = rewrite_links(html, lang)
            html = OLD_TOGGLE_RE.sub(build_selector(page, lang), html)
            head_extra = build_hreflang(page) + "\n" + build_page_meta(page, lang)
            html = html.replace("</head>", head_extra + "\n</head>", 1)
            html = bake_text(html, dicts[lang])
            dest = os.path.join(HERE, lang, out_filename(page, lang))
            with open(dest, "w", encoding="utf-8") as f:
                f.write(html)
            count += 1
    write_sitemap()
    print(f"Generated {count} files across {len(LANGS)} languages. Wrote sitemap.xml.")


if __name__ == "__main__":
    generate()
