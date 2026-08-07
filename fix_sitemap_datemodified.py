#!/usr/bin/env python3
"""
fix_sitemap_datemodified.py

Task B:
  B1: For each what-gpa-do-you-need-for-*.html that has BOTH a WebPage and an
      Article JSON-LD block (each with a potentially different dateModified),
      standardise both to the LATER of the two dates.
  B2: Regenerate public/sitemap.xml with accurate per-page lastmod values
      extracted from each page's JSON-LD dateModified field.

Rules:
  - If a page has JSON-LD with dateModified, use it (take the LATER date if
    multiple blocks differ).
  - If no dateModified found, fall back to "2026-07-30".
  - Keep homepage (https://getstudyedge.com/) as-is with 2026-07-30.
  - Remove /unsubscribe entry from the sitemap.
  - Keep all other sitemap fields (changefreq, priority) unchanged.
"""

import os
import re
import json
import copy
from datetime import date
from pathlib import Path

PUBLIC_DIR = Path("/Users/ryangambrell/Projects/StudyMapLocal/.claude/worktrees/seo-fixes/public")
SITEMAP_PATH = PUBLIC_DIR / "sitemap.xml"
FALLBACK_DATE = "2026-07-30"
BASE_URL = "https://getstudyedge.com"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_JSON_LD_RE = re.compile(
    r'<script\s+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)


def extract_json_ld_blocks(html: str) -> list[dict]:
    """Return all parsed JSON-LD objects from an HTML string."""
    blocks = []
    for m in _JSON_LD_RE.finditer(html):
        text = m.group(1).strip()
        try:
            obj = json.loads(text)
            blocks.append(obj)
        except json.JSONDecodeError:
            pass
    return blocks


def latest_date_modified(blocks: list[dict]) -> str | None:
    """Return the latest dateModified string across all JSON-LD blocks."""
    dates = []
    for b in blocks:
        dm = b.get("dateModified")
        if dm and isinstance(dm, str):
            try:
                dates.append(date.fromisoformat(dm))
            except ValueError:
                pass
    if not dates:
        return None
    return max(dates).isoformat()


# ---------------------------------------------------------------------------
# B1: Fix conflicting dateModified on GPA pages
# ---------------------------------------------------------------------------

gpa_files = sorted(PUBLIC_DIR.glob("what-gpa-do-you-need-for-*.html"))
fixed_count = 0
fixed_pages = []

for path in gpa_files:
    html = path.read_text(encoding="utf-8")
    blocks = extract_json_ld_blocks(html)

    webpage_dates = [b.get("dateModified") for b in blocks if b.get("@type") == "WebPage" and b.get("dateModified")]
    article_dates = [b.get("dateModified") for b in blocks if b.get("@type") == "Article" and b.get("dateModified")]

    # Only fix if BOTH types are present
    if not webpage_dates or not article_dates:
        continue

    all_dates_raw = webpage_dates + article_dates
    parsed = []
    for d in all_dates_raw:
        try:
            parsed.append(date.fromisoformat(d))
        except ValueError:
            pass
    if not parsed:
        continue

    best = max(parsed).isoformat()

    # Check if they actually differ
    if len(set(all_dates_raw)) == 1 and all_dates_raw[0] == best:
        continue  # Already consistent, nothing to do

    # Replace every dateModified in the HTML (within JSON-LD blocks)
    # We do this by replacing each JSON-LD script block individually
    def patch_block(m):
        text = m.group(1).strip()
        try:
            obj = json.loads(text)
        except json.JSONDecodeError:
            return m.group(0)
        if obj.get("@type") in ("WebPage", "Article") and "dateModified" in obj:
            obj["dateModified"] = best
            new_json = json.dumps(obj, indent=2, ensure_ascii=False)
            return f'<script type="application/ld+json">\n  {new_json}\n  </script>'
        return m.group(0)

    new_html = _JSON_LD_RE.sub(patch_block, html)

    if new_html != html:
        path.write_text(new_html, encoding="utf-8")
        fixed_count += 1
        fixed_pages.append((path.name, list(set(all_dates_raw)), best))

print(f"\nB1: Fixed {fixed_count} GPA pages with conflicting dateModified")
for name, old, new in fixed_pages:
    print(f"  {name}: {old} -> {new}")

# ---------------------------------------------------------------------------
# B2: Regenerate sitemap.xml with accurate per-page lastmod
# ---------------------------------------------------------------------------

# Parse the existing sitemap preserving structure
sitemap_raw = SITEMAP_PATH.read_text(encoding="utf-8")

# Extract all <url> blocks with their fields
URL_BLOCK_RE = re.compile(r'<url>(.*?)</url>', re.DOTALL)
LOC_RE = re.compile(r'<loc>(.*?)</loc>')
LASTMOD_RE = re.compile(r'<lastmod>(.*?)</lastmod>')
CHANGEFREQ_RE = re.compile(r'<changefreq>(.*?)</changefreq>')
PRIORITY_RE = re.compile(r'<priority>(.*?)</priority>')

# Build a map of loc -> {changefreq, priority} from the existing sitemap
existing_entries = {}
for m in URL_BLOCK_RE.finditer(sitemap_raw):
    block = m.group(1)
    loc_m = LOC_RE.search(block)
    cf_m = CHANGEFREQ_RE.search(block)
    pri_m = PRIORITY_RE.search(block)
    if not loc_m:
        continue
    loc = loc_m.group(1).strip()
    cf = cf_m.group(1).strip() if cf_m else "monthly"
    pri = pri_m.group(1).strip() if pri_m else "0.9"
    existing_entries[loc] = {"changefreq": cf, "priority": pri}

# Check for homepage entry
homepage_url = "https://getstudyedge.com/"
if homepage_url not in existing_entries:
    # Look for it without trailing slash
    alt = "https://getstudyedge.com"
    if alt in existing_entries:
        existing_entries[homepage_url] = existing_entries.pop(alt)

# URL to file path mapping
# URL like https://getstudyedge.com/foo -> public/foo.html
# Blog URLs like https://getstudyedge.com/blog/foo -> need to check

def url_to_file(url: str) -> Path | None:
    """Map a sitemap URL to a local HTML file in public/."""
    path = url.replace(BASE_URL, "").lstrip("/")
    if not path:
        return None  # homepage, no local file to parse

    # Direct HTML file (e.g. public/foo.html or public/blog/foo.html)
    candidate = PUBLIC_DIR / f"{path}.html"
    if candidate.exists():
        return candidate

    return None


# Gather lastmod for each URL
stats = {
    "with_jsonld": 0,
    "fallback": 0,
    "no_file": 0,
    "homepage": 0,
}
date_distribution: dict[str, int] = {}
pages_using_fallback = []
removed_urls = {
    "https://getstudyedge.com/unsubscribe",
}

new_entries_ordered = []

for loc, fields in existing_entries.items():
    if loc in removed_urls:
        continue

    if loc == homepage_url:
        lastmod = FALLBACK_DATE
        stats["homepage"] += 1
    else:
        html_file = url_to_file(loc)
        if html_file is None:
            # blog page or similar without a local HTML file
            lastmod = FALLBACK_DATE
            stats["no_file"] += 1
            pages_using_fallback.append(loc)
        else:
            html = html_file.read_text(encoding="utf-8")
            blocks = extract_json_ld_blocks(html)
            dm = latest_date_modified(blocks)
            if dm:
                lastmod = dm
                stats["with_jsonld"] += 1
            else:
                lastmod = FALLBACK_DATE
                stats["fallback"] += 1
                pages_using_fallback.append(loc)

    date_distribution[lastmod] = date_distribution.get(lastmod, 0) + 1
    new_entries_ordered.append((loc, lastmod, fields["changefreq"], fields["priority"]))

# Build the new sitemap XML
lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
]

for loc, lastmod, cf, pri in new_entries_ordered:
    lines.append("  <url>")
    lines.append(f"    <loc>{loc}</loc>")
    lines.append(f"    <lastmod>{lastmod}</lastmod>")
    lines.append(f"    <changefreq>{cf}</changefreq>")
    lines.append(f"    <priority>{pri}</priority>")
    lines.append("  </url>")

lines.append("</urlset>")

new_sitemap = "\n".join(lines) + "\n"
SITEMAP_PATH.write_text(new_sitemap, encoding="utf-8")

print(f"\nB2: Regenerated sitemap.xml with {len(new_entries_ordered)} URLs")
print(f"  Removed: {len(removed_urls)} URL(s) ({', '.join(removed_urls)})")
print(f"\nLastmod date distribution ({len(date_distribution)} distinct dates):")
for d, count in sorted(date_distribution.items()):
    print(f"  {d}: {count} page(s)")

date_list = sorted(date_distribution.keys())
print(f"\nDate range: {date_list[0]} to {date_list[-1]}")

all_same = len(date_distribution) == 1
print(f"All same date? {'YES (check needed)' if all_same else 'NO (good)'}")

print(f"\nPages using fallback date ({FALLBACK_DATE}): {stats['fallback'] + stats['no_file'] + stats['homepage']}")
if pages_using_fallback:
    print("  (blog/* and pages without JSON-LD dateModified):")
    for p in pages_using_fallback[:20]:
        print(f"    {p}")
    if len(pages_using_fallback) > 20:
        print(f"    ... and {len(pages_using_fallback) - 20} more")

print(f"\nPages with JSON-LD dateModified: {stats['with_jsonld']}")
print("Done.")
