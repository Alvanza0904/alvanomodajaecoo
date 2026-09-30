#!/usr/bin/env python3
"""
update-images.py — sinkron gambar Sveltia CMS ke HTML statis.

Alur:
  content/<koleksi>/<kunci>.md  (kunci stabil, path gambar boleh berubah)
        ↓
  elemen HTML dengan data-cms="<koleksi>/<kunci>"
        ↓
  src / srcset / poster / source / preload href / background-image / data-j8-color-src
  dan alt pada elemen yang sama saja

Jalankan dari root repository:
  python update-images.py
  python update-images.py --self-test

Menambah slot baru:
  1. Buat content/<koleksi>/<kunci>.md (nama file jangan diubah setelah dipakai).
  2. Pasang data-cms="<koleksi>/<kunci>" pada elemen yang menampilkan gambar itu.
  3. Commit. GitHub Actions memperbarui HTML.
"""

from __future__ import annotations

import os
import re
import sys
import glob
import tempfile
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))

IMAGE_EXT = r"(?:webp|jpe?g|png|gif|avif)"
SKIP_TAG = {"meta", "script", "style", "title", "base", "noscript", "head"}
IMAGE_ATTRS = {"src", "srcset", "poster", "href", "data-src", "data-j8-color-src"}
ALT_ATTRS = {"alt", "data-j8-color-alt"}

ATTR_RE = re.compile(
    r"""([:@\w-]+)(\s*=\s*)(["'])(.*?)(\3)""",
    re.S,
)
TAG_RE = re.compile(r"<([a-zA-Z][\w:-]*)([^<>]*)>", re.S)
CMS_ATTR_RE = re.compile(r"""\bdata-cms\s*=\s*(["'])([^"']+)\1""", re.I)
URL_IN_TEXT_RE = re.compile(
    rf"""(?P<url>[^\s'"(),]+\.{IMAGE_EXT})(?:\?[^\s'"(),]*)?""",
    re.I,
)
STYLE_URL_RE = re.compile(
    rf"""url\(\s*(?P<q>['"]?)(?P<url>[^)'"]+\.{IMAGE_EXT})(?P=q)\s*\)""",
    re.I,
)


def norm_path(url: str) -> str:
    url = (url or "").strip().split()[0]
    url = url.split("#")[0].split("?")[0]
    url = url.replace("\\", "/")
    if url.startswith(("http://", "https://")):
        marker = "/assets/"
        idx = url.find(marker)
        if idx == -1:
            # path situs di luar /assets, misalnya /jaecoo-j7-sivp/assets/...
            # sudah tertangkap di atas jika mengandung /assets/
            site = "omodajaecoopalembang.web.id"
            pos = url.find(site)
            if pos != -1:
                url = url[pos + len(site) :]
            else:
                return url
        else:
            url = url[idx:]
    while url.startswith("./"):
        url = url[2:]
    return url.lstrip("/")


def resolve_against(html_rel: str, url: str) -> str:
    """Path repo (tanpa leading slash) yang ditunjuk URL di dalam file HTML."""
    raw = (url or "").strip().split()[0].split("#")[0].split("?")[0]
    if not raw or raw.startswith(("data:", "mailto:", "#")):
        return ""
    if raw.startswith(("http://", "https://")):
        return norm_path(raw)
    if raw.startswith("/"):
        return norm_path(raw)
    base = os.path.dirname(html_rel).replace("\\", "/")
    joined = os.path.normpath(os.path.join(base, raw)).replace("\\", "/")
    while joined.startswith("./"):
        joined = joined[2:]
    return joined.lstrip("/")


def is_image_url(url: str) -> bool:
    if not url or not str(url).strip():
        return False
    path = str(url).strip().split("#")[0].split("?")[0].split()
    if not path:
        return False
    return re.search(rf"\.{IMAGE_EXT}$", path[0], re.I) is not None


def yaml_quote(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    block = text[3:end]
    body = text[end + 4 :]
    data: dict[str, str] = {}
    for line in block.splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in {'"', "'"}:
            val = val[1:-1]
            if val[:1] == '"':
                pass
            val = val.replace('\\"', '"').replace("\\'", "'")
        data[key.strip()] = val
    return data, body


def load_cms(root: str) -> dict[str, dict]:
    entries = {}
    for md_path in sorted(glob.glob(os.path.join(root, "content", "**", "*.md"), recursive=True)):
        rel = os.path.relpath(md_path, root).replace("\\", "/")
        key = rel[len("content/") : -3]
        with open(md_path, encoding="utf-8") as handle:
            data, _body = parse_frontmatter(handle.read())
        image = (data.get("image") or "").strip()
        if not image:
            continue
        entries[key] = {
            "image": image,
            "image_norm": norm_path(image),
            "alt": (data.get("alt") or "").strip(),
            "title": (data.get("title") or "").strip(),
            "section": (data.get("section") or "").strip(),
            "md_path": rel,
        }
    return entries


def skip_ranges(html: str) -> list[tuple[int, int]]:
    ranges = []
    patterns = (
        r"<script\b[^>]*>.*?</script>",
        r"<style\b[^>]*>.*?</style>",
        r"<!--.*?-->",
    )
    for pattern in patterns:
        for match in re.finditer(pattern, html, re.I | re.S):
            ranges.append((match.start(), match.end()))
    ranges.sort()
    return ranges


def in_ranges(pos: int, ranges: list[tuple[int, int]]) -> bool:
    for start, end in ranges:
        if start <= pos < end:
            return True
        if start > pos:
            return False
    return False


def html_files(root: str) -> list[str]:
    found = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            name
            for name in dirnames
            if name not in {".git", "node_modules", "admin", "berita"}
        ]
        rel_dir = os.path.relpath(dirpath, root).replace("\\", "/")
        if rel_dir.startswith("berita") or rel_dir.startswith("admin"):
            continue
        for name in filenames:
            if name.endswith(".html"):
                rel = os.path.join(rel_dir, name).replace("\\", "/")
                if rel.startswith("./"):
                    rel = rel[2:]
                if rel == "yandex_2a43ba788e947dfb.html":
                    continue
                found.append(rel if rel != "." else name)
    return sorted(found)


def prune_empty_dirs(start: str, stop: str) -> None:
    """Hapus folder kosong dari start naik sampai (tidak termasuk) stop."""
    current = os.path.abspath(start)
    stop = os.path.abspath(stop)
    while current != stop and current.startswith(stop + os.sep):
        try:
            os.rmdir(current)
        except OSError:
            break
        current = os.path.dirname(current)


def materialize_cms_image(root: str, entry: dict) -> tuple[bool, str | None]:
    """Pastikan file gambar ada di path publik yang tertulis di Markdown.

    Sveltia menyimpan upload relatif terhadap folder koleksi bila media_folder
    koleksi tidak diawali slash. Markdown tetap memakai public_folder, jadi
    file bisa nyasar ke content/<koleksi>/<public path>. Jika ketemu di sana,
    file dipindah ke path publik dan path nyasar dikembalikan.
    """
    image_norm = entry["image_norm"]
    if not image_norm or image_norm.startswith(("http://", "https://")):
        return True, None
    canonical = os.path.join(root, image_norm)
    if os.path.isfile(canonical):
        return True, None
    md_dir = os.path.dirname(entry["md_path"]).replace("\\", "/")
    if not md_dir or md_dir == ".":
        return False, None
    stray_rel = f"{md_dir}/{image_norm}"
    stray_abs = os.path.join(root, stray_rel)
    if not os.path.isfile(stray_abs):
        return False, None
    if os.path.abspath(stray_abs) == os.path.abspath(canonical):
        return True, None
    os.makedirs(os.path.dirname(canonical), exist_ok=True)
    shutil.copy2(stray_abs, canonical)
    os.remove(stray_abs)
    prune_empty_dirs(os.path.dirname(stray_abs), os.path.join(root, md_dir))
    return True, stray_rel


def style_for_write(original_url: str, cms_image: str) -> str:
    """Tulis path baru. Pertahankan leading slash hanya jika aman.

    Path relatif (`assets/...` di homepage) yang diganti file di folder lain
    wajib menjadi root-relative agar tidak resolve dobel.
    """
    cms = cms_image if cms_image.startswith("/") else "/" + norm_path(cms_image)
    original = original_url.strip().split()[0]
    if original.startswith("/") or original.startswith(("http://", "https://")):
        return cms
    # relatif: hanya aman jika CMS path sama dengan basename-di-folder yang sama
    # dan halaman ada di root. Lebih aman selalu root-relative saat path berubah.
    return cms


def replace_style_urls(style_value: str, html_rel: str, old_norm: str, new_written: str) -> str:
    def repl(match: re.Match) -> str:
        url = match.group("url")
        resolved = resolve_against(html_rel, url)
        if resolved != old_norm and norm_path(url) != old_norm:
            return match.group(0)
        quote = match.group("q") or ""
        return f"url({quote}{new_written}{quote})"

    return STYLE_URL_RE.sub(repl, style_value)


def replace_srcset(value: str, html_rel: str, old_norm: str, new_written: str) -> str:
    parts = []
    changed = False
    for raw_part in value.split(","):
        part = raw_part.strip()
        if not part:
            continue
        bits = part.split()
        url = bits[0]
        resolved = resolve_against(html_rel, url)
        if is_image_url(url) and (resolved == old_norm or norm_path(url) == old_norm):
            bits[0] = new_written
            changed = True
        parts.append(" ".join(bits))
    if not changed:
        return value
    # pertahankan koma+spasi sederhana
    return ", ".join(parts)


def element_image_targets(tag: str, attrs: str, html_rel: str) -> list[str]:
    paths = []
    for match in ATTR_RE.finditer(attrs):
        name = match.group(1).lower()
        value = match.group(4)
        if name == "style" or name.endswith("style"):
            for url_match in STYLE_URL_RE.finditer(value):
                resolved = resolve_against(html_rel, url_match.group("url"))
                if resolved:
                    paths.append(resolved)
        elif name in IMAGE_ATTRS or name == "content":
            if name == "srcset":
                for piece in value.split(","):
                    piece = piece.strip()
                    if not piece:
                        continue
                    url = piece.split()[0]
                    if is_image_url(url):
                        resolved = resolve_against(html_rel, url)
                        if resolved:
                            paths.append(resolved)
            elif is_image_url(value):
                resolved = resolve_against(html_rel, value)
                if resolved:
                    paths.append(resolved)
    return paths


def tag_allowed(tag: str, attrs: str) -> bool:
    tag_l = tag.lower()
    if tag_l in SKIP_TAG:
        return False
    if tag_l == "link":
        rel = ""
        as_attr = ""
        for match in ATTR_RE.finditer(attrs):
            name = match.group(1).lower()
            if name == "rel":
                rel = match.group(4).lower()
            elif name == "as":
                as_attr = match.group(4).lower()
        return "preload" in rel or as_attr == "image"
    return True


def escape_attr(value: str) -> str:
    amp = "&" + "amp;"
    quot = "&" + "quot;"
    lt = "&" + "lt;"
    gt = "&" + "gt;"
    return value.replace("&", amp).replace('"', quot).replace("<", lt).replace(">", gt)


def update_tag_attrs(attrs: str, html_rel: str, cms_norm: str, cms_image: str, new_alt: str) -> tuple[str, bool]:
    """Paksa setiap URL gambar pada elemen data-cms mengikuti CMS.

    Jika URL yang ada sudah menunjuk file yang sama, string aslinya dipertahankan
    supaya tidak ada diff sia-sia (slash, relatif vs absolut).
    """
    changed = False

    def repl_attr(match: re.Match) -> str:
        nonlocal changed
        name = match.group(1)
        eq = match.group(2)
        quote = match.group(3)
        value = match.group(4)
        close = match.group(5)
        lname = name.lower()

        if lname in ALT_ATTRS and new_alt:
            escaped = escape_attr(new_alt)
            if value != escaped and value != new_alt:
                changed = True
                return f"{name}{eq}{quote}{escaped}{close}"
            return match.group(0)

        if lname == "style":
            def style_repl(url_match: re.Match) -> str:
                nonlocal changed
                url = url_match.group("url")
                if not is_image_url(url):
                    return url_match.group(0)
                resolved = resolve_against(html_rel, url)
                if resolved == cms_norm:
                    return url_match.group(0)
                written = style_for_write(url, cms_image)
                changed = True
                q = url_match.group("q") or ""
                return f"url({q}{written}{q})"

            new_style = STYLE_URL_RE.sub(style_repl, value)
            return f"{name}{eq}{quote}{new_style}{close}"

        if lname not in IMAGE_ATTRS:
            return match.group(0)

        if lname == "href" and not is_image_url(value):
            return match.group(0)

        if lname == "srcset":
            pieces = []
            local_changed = False
            for raw_part in value.split(","):
                part = raw_part.strip()
                if not part:
                    continue
                bits = part.split()
                url = bits[0]
                if is_image_url(url) and resolve_against(html_rel, url) != cms_norm:
                    bits[0] = style_for_write(url, cms_image)
                    local_changed = True
                pieces.append(" ".join(bits))
            if not local_changed:
                return match.group(0)
            changed = True
            return f"{name}{eq}{quote}{', '.join(pieces)}{close}"

        if not is_image_url(value):
            return match.group(0)
        if resolve_against(html_rel, value) == cms_norm:
            return match.group(0)
        written = style_for_write(value, cms_image)
        changed = True
        return f"{name}{eq}{quote}{written}{close}"

    new_attrs = ATTR_RE.sub(repl_attr, attrs)
    return new_attrs, changed


def apply_cms_to_html(html: str, html_rel: str, cms: dict[str, dict]) -> tuple[str, list[str], list[tuple[str, str]]]:
    """Return html, list of keys touched, list of (key, error)."""
    ranges = skip_ranges(html)
    touched: list[str] = []
    errors: list[tuple[str, str]] = []

    def repl_tag(match: re.Match) -> str:
        if in_ranges(match.start(), ranges):
            return match.group(0)
        tag = match.group(1)
        attrs = match.group(2)
        if not tag_allowed(tag, attrs):
            return match.group(0)
        cms_match = CMS_ATTR_RE.search(attrs)
        if not cms_match:
            return match.group(0)
        key = cms_match.group(2).strip()
        entry = cms.get(key)
        if not entry:
            errors.append((key, f"data-cms tanpa entri content: {html_rel}"))
            return match.group(0)
        old_norm = entry["image_norm"]
        new_attrs, changed = update_tag_attrs(attrs, html_rel, old_norm, entry["image"], entry["alt"])
        if changed:
            touched.append(key)
        return f"<{tag}{new_attrs}>"

    updated = TAG_RE.sub(repl_tag, html)
    return updated, touched, errors


def scan_unmapped(html: str, html_rel: str) -> list[str]:
    ranges = skip_ranges(html)
    unmapped = []
    for match in TAG_RE.finditer(html):
        if in_ranges(match.start(), ranges):
            continue
        tag = match.group(1)
        attrs = match.group(2)
        if not tag_allowed(tag, attrs):
            continue
        if CMS_ATTR_RE.search(attrs):
            continue
        for path in element_image_targets(tag, attrs, html_rel):
            base = os.path.basename(path).lower()
            if base.startswith(("favicon", "apple-touch", "logo")):
                continue
            if "/logo" in path or path.endswith("logo-omoda-jaecoo.png"):
                continue
            unmapped.append(path)
    return unmapped


def collect_bound_keys(root: str, cms: dict[str, dict]) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {key: [] for key in cms}
    unknown = []
    for rel in html_files(root):
        with open(os.path.join(root, rel), encoding="utf-8") as handle:
            html = handle.read()
        ranges = skip_ranges(html)
        for match in TAG_RE.finditer(html):
            if in_ranges(match.start(), ranges):
                continue
            tag = match.group(1)
            attrs = match.group(2)
            if not tag_allowed(tag, attrs):
                continue
            cms_match = CMS_ATTR_RE.search(attrs)
            if not cms_match:
                continue
            key = cms_match.group(2).strip()
            if key not in cms:
                unknown.append(f"{rel} → data-cms=\"{key}\"")
            else:
                found.setdefault(key, []).append(rel)
    return found, unknown


def run(root: str, write: bool = True) -> int:
    print("=== Update Images from CMS ===\n")
    cms = load_cms(root)
    print(f"Entri CMS: {len(cms)}")

    fatal: list[str] = []
    warnings: list[str] = []

    for key, entry in sorted(cms.items()):
        if not entry["image_norm"]:
            fatal.append(f"ERROR: CMS image kosong\nCMS key: {key}")
            continue
        if entry["image_norm"].startswith(("http://", "https://")):
            warnings.append(f"WARNING: CMS memakai URL eksternal\nCMS key: {key}\nImage: {entry['image']}")
            continue
        exists, relocated_from = materialize_cms_image(root, entry)
        if relocated_from:
            print(f"  [relokasi] {relocated_from} → {entry['image_norm']}")
        if not exists:
            fatal.append(
                "ERROR: file gambar CMS tidak ditemukan\n"
                f"CMS key: {key}\n"
                f"Image: {entry['image']}\n"
                f"Expected file: {entry['image_norm']}\n"
                f"Juga dicek di: {os.path.dirname(entry['md_path'])}/{entry['image_norm']}"
            )

    bound, unknown = collect_bound_keys(root, cms)
    for item in unknown:
        fatal.append(f"ERROR: data-cms tidak punya entri Markdown\n{item}")

    for key, files in sorted(bound.items()):
        if not files:
            warnings.append(
                "WARNING: entri CMS belum dipasang di HTML (tidak fatal)\n"
                f"CMS key: {key}\n"
                f"Image: {cms[key]['image']}"
            )

    if fatal:
        print("\n".join(fatal))
        print(f"\nGagal. {len(fatal)} error. HTML tidak diubah.")
        return 1

    changed_files = []
    usage: dict[str, int] = {}
    for rel in html_files(root):
        path = os.path.join(root, rel)
        with open(path, encoding="utf-8") as handle:
            original = handle.read()
        updated, touched, errors = apply_cms_to_html(original, rel, cms)
        if errors:
            for key, message in errors:
                fatal.append(f"ERROR: {message}\nCMS key: {key}")
        for key in touched:
            usage[key] = usage.get(key, 0) + 1
        if updated != original:
            if write:
                with open(path, "w", encoding="utf-8", newline="") as handle:
                    handle.write(updated)
            changed_files.append(rel)
            print(f"  [updated] {rel}")
        else:
            print(f"  [no change] {rel}")

    if fatal:
        print("\n".join(fatal))
        print("\nGagal di tengah proses. Periksa error di atas.")
        return 1

    print("\n--- Peringatan ---")
    if warnings:
        for warning in warnings:
            print(warning)
            print()
    else:
        print("Tidak ada.")

    unmapped: dict[str, list[str]] = {}
    for rel in html_files(root):
        with open(os.path.join(root, rel), encoding="utf-8") as handle:
            html = handle.read()
        paths = scan_unmapped(html, rel)
        if paths:
            unmapped[rel] = sorted(set(paths))

    print("--- HTML image belum terhubung CMS ---")
    if not unmapped:
        print("Semua gambar konten yang discan sudah ber-data-cms (logo/favicon diabaikan).")
    else:
        for rel, paths in unmapped.items():
            for image_path in paths:
                print(f"  {rel}: {image_path}")

    # duplikat: satu path dipakai lebih dari satu key CMS
    by_image: dict[str, list[str]] = {}
    for key, entry in cms.items():
        by_image.setdefault(entry["image_norm"], []).append(key)
    print("\n--- Mapping duplikat (satu file, banyak key CMS) ---")
    dupes = {path: keys for path, keys in by_image.items() if len(keys) > 1}
    if not dupes:
        print("Tidak ada.")
    else:
        for path, keys in sorted(dupes.items()):
            print(f"  {path}: {', '.join(keys)}")

    print(f"\nSelesai. {len(changed_files)} file HTML berubah.")
    if warnings:
        print(f"Peringatan: {len(warnings)} (entri CMS tanpa jangkar HTML, atau URL eksternal).")
    return 0


def _write(path: str, text: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def _touch(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(b"img")


def self_test() -> int:
    tmp = tempfile.mkdtemp(prefix="cms-images-")
    try:
        _touch(os.path.join(tmp, "assets/images/j5/hero-old.webp"))
        _touch(os.path.join(tmp, "assets/images/j5/hero-new.webp"))
        _touch(os.path.join(tmp, "assets/images/j7/hero.webp"))
        _touch(os.path.join(tmp, "assets/images/j8/hero.webp"))
        _touch(os.path.join(tmp, "assets/images/home/slide.webp"))
        _touch(os.path.join(tmp, "assets/images/o4/hero.webp"))
        _touch(os.path.join(tmp, "assets/images/shared/decoy.webp"))

        def md(key, image, alt="alt lama"):
            folder, slug = key.split("/")
            _write(
                os.path.join(tmp, "content", folder, slug + ".md"),
                "---\n"
                f'title: "{slug}"\n'
                'section: "Hero"\n'
                f'image: "{image}"\n'
                f'alt: "{alt}"\n'
                "---\n",
            )

        md("jaecoo-j5/hero", "/assets/images/j5/hero-old.webp", "J5 hero alt")
        md("jaecoo-j7/hero", "/assets/images/j7/hero.webp", "J7 hero alt")
        md("jaecoo-j8/hero", "/assets/images/j8/hero.webp", "J8 hero alt")
        md("homepage/hero-slide-1", "/assets/images/home/slide.webp", "Home alt")
        md("omoda-o4/hero", "/assets/images/o4/hero.webp", "O4 alt")
        md("jaecoo-j5/unused", "/assets/images/shared/decoy.webp", "unused")

        _write(
            os.path.join(tmp, "jaecoo-j5.html"),
            """<!doctype html><html><head>
<meta property="og:image" content="https://omodajaecoopalembang.web.id/assets/images/j5/hero-old.webp"/>
<link rel="preload" as="image" href="/assets/images/j5/hero-old.webp" data-cms="jaecoo-j5/hero"/>
</head><body>
<video poster="/assets/images/j5/hero-old.webp" data-cms="jaecoo-j5/hero"></video>
<img alt="tetap" src="/assets/images/shared/decoy.webp"/>
<img alt="lama j5" src="assets/images/j5/hero-old.webp" data-cms="jaecoo-j5/hero"/>
<img src="/assets/images/j7/hero.webp" alt="bukan j5"/>
<picture>
  <source srcset="/assets/images/j5/hero-old.webp 800w, /assets/images/j5/hero-old.webp 1400w" data-cms="jaecoo-j5/hero"/>
  <img alt="J5" src="/assets/images/j5/hero-old.webp" data-cms="jaecoo-j5/hero"/>
</picture>
<div data-cms="jaecoo-j5/hero" style="background-image:url('/assets/images/j5/hero-old.webp')"></div>
<div data-cms="jaecoo-j5/hero" style='background-image:url("/assets/images/j5/hero-old.webp")'></div>
<div data-cms="jaecoo-j5/hero" style="background-image:url(/assets/images/j5/hero-old.webp)"></div>
<img data-cms="jaecoo-j5/hero" alt="sudah benar" src="/assets/images/j5/hero-old.webp"/>
</body></html>
""",
        )
        _write(
            os.path.join(tmp, "jaecoo-j7.html"),
            '<img src="/assets/images/j7/hero.webp" alt="J7 lama" data-cms="jaecoo-j7/hero"/>'
            '<img src="/assets/images/j5/hero-old.webp" alt="jangan berubah"/>',
        )
        _write(
            os.path.join(tmp, "jaecoo-j8.html"),
            '<video poster="assets/images/j8/hero.webp" data-cms="jaecoo-j8/hero"></video>',
        )
        _write(
            os.path.join(tmp, "index.html"),
            """<div class="hero" data-cms="homepage/hero-slide-1" style="background-image:url('/assets/images/home/slide.webp')"></div>
<img src="/assets/images/j5/hero-old.webp" alt="homepage bukan slide"/>
""",
        )
        _write(
            os.path.join(tmp, "omoda-o4/index.html"),
            '<img alt="sebelum" src="/assets/images/o4/hero.webp" data-cms="omoda-o4/hero"/>',
        )

        # idempotent ketika path ekuivalen
        code = run(tmp, write=True)
        if code != 0:
            print("SELF-TEST FAIL: run awal")
            return 1
        with open(os.path.join(tmp, "jaecoo-j7.html"), encoding="utf-8") as handle:
            j7_before = handle.read()
        if "jangan berubah" not in j7_before or "/assets/images/j5/hero-old.webp" not in j7_before:
            print("SELF-TEST FAIL: j7 tercemar saat belum ada perubahan", j7_before)
            return 1
        if 'alt="J7 hero alt"' not in j7_before:
            print("SELF-TEST FAIL: alt J7 tidak tersinkron", j7_before)
            return 1

        # ganti hanya J5
        md_path = os.path.join(tmp, "content/jaecoo-j5/hero.md")
        text = open(md_path, encoding="utf-8").read().replace("hero-old.webp", "hero-new.webp").replace(
            "J5 hero alt", "J5 hero baru"
        )
        _write(md_path, text)
        code = run(tmp, write=True)
        if code != 0:
            print("SELF-TEST FAIL: run setelah ganti J5")
            return 1

        j5 = open(os.path.join(tmp, "jaecoo-j5.html"), encoding="utf-8").read()
        j7 = open(os.path.join(tmp, "jaecoo-j7.html"), encoding="utf-8").read()
        j8 = open(os.path.join(tmp, "jaecoo-j8.html"), encoding="utf-8").read()
        home = open(os.path.join(tmp, "index.html"), encoding="utf-8").read()
        o4 = open(os.path.join(tmp, "omoda-o4/index.html"), encoding="utf-8").read()

        if 'content="https://omodajaecoopalembang.web.id/assets/images/j5/hero-old.webp"' not in j5:
            print("SELF-TEST FAIL: metadata OG ikut berubah atau hilang")
            return 1
        if j5.count("hero-old.webp") != 1:
            print("SELF-TEST FAIL: hero lama harus tersisa hanya di metadata", j5.count("hero-old.webp"))
            return 1
        if 'alt="J5 hero baru"' not in j5:
            print("SELF-TEST FAIL: alt J5 tidak terganti")
            return 1
        if "800w" not in j5 or "1400w" not in j5:
            print("SELF-TEST FAIL: srcset descriptor hilang")
            return 1
        if "url('/assets/images/j5/hero-new.webp')" not in j5:
            print("SELF-TEST FAIL: background quote tunggal")
            return 1
        if 'url("/assets/images/j5/hero-new.webp")' not in j5:
            print("SELF-TEST FAIL: background quote ganda")
            return 1
        if "url(/assets/images/j5/hero-new.webp)" not in j5:
            print("SELF-TEST FAIL: background tanpa quote")
            return 1
        if "decoy.webp" not in j5 or 'alt="tetap"' not in j5:
            print("SELF-TEST FAIL: gambar tanpa data-cms ikut berubah")
            return 1
        if j7 != j7_before:
            print("SELF-TEST FAIL: J7 berubah saat yang diganti J5", j7)
            return 1
        if "j8/hero.webp" not in j8:
            print("SELF-TEST FAIL: J8 berubah")
            return 1
        if "home/slide.webp" not in home or "hero-new" in home:
            print("SELF-TEST FAIL: homepage berubah saat J5 diganti")
            return 1
        if "o4/hero.webp" not in o4:
            print("SELF-TEST FAIL: O4 berubah")
            return 1

        # ganti homepage saja
        home_md = os.path.join(tmp, "content/homepage/hero-slide-1.md")
        _write(
            home_md,
            open(home_md, encoding="utf-8").read().replace("slide.webp", "slide.webp"),
        )
        text = open(home_md, encoding="utf-8").read().replace(
            "/assets/images/home/slide.webp", "/assets/images/j8/hero.webp"
        )
        _write(home_md, text)
        # file j8 hero ada, jadi tidak fatal. Homepage harus berubah, J8 poster tetap (key berbeda meski file sama)
        before_j8 = open(os.path.join(tmp, "jaecoo-j8.html"), encoding="utf-8").read()
        code = run(tmp, write=True)
        if code != 0:
            print("SELF-TEST FAIL: homepage swap")
            return 1
        home = open(os.path.join(tmp, "index.html"), encoding="utf-8").read()
        if "/assets/images/j8/hero.webp" not in home or "slide.webp" in home:
            print("SELF-TEST FAIL: homepage tidak ganti slide", home)
            return 1
        if open(os.path.join(tmp, "jaecoo-j8.html"), encoding="utf-8").read() != before_j8:
            print("SELF-TEST FAIL: ganti homepage mengubah J8")
            return 1

        # file hilang = fatal dan tidak menulis
        j7_now = open(os.path.join(tmp, "jaecoo-j7.html"), encoding="utf-8").read()
        _write(
            os.path.join(tmp, "content/jaecoo-j7/hero.md"),
            '---\ntitle: "hero"\nsection: "Hero"\nimage: "/assets/images/j7/missing.webp"\nalt: "x"\n---\n',
        )
        code = run(tmp, write=True)
        if code == 0:
            print("SELF-TEST FAIL: missing file harus fatal")
            return 1
        if open(os.path.join(tmp, "jaecoo-j7.html"), encoding="utf-8").read() != j7_now:
            print("SELF-TEST FAIL: HTML berubah padahal file CMS hilang")
            return 1

        # Pulihkan J7 supaya tes berikutnya tidak ikut gagal.
        md("jaecoo-j7/hero", "/assets/images/j7/hero.webp", "J7 hero alt")

        # Upload Sveltia yang nyasar ke dalam folder konten harus dipindah
        # ke path publik, lalu HTML mengikuti path itu.
        stray = os.path.join(tmp, "content/homepage/assets/images/cms/homepage/nyasar.jpeg")
        _touch(stray)
        md("homepage/hero-slide-2", "assets/images/cms/homepage/nyasar.jpeg", "")
        index_path = os.path.join(tmp, "index.html")
        with open(index_path, "a", encoding="utf-8") as handle:
            handle.write(
                '<div data-cms="homepage/hero-slide-2" '
                "style=\"background-image:url('/assets/images/home/slide.webp')\"></div>"
            )
        code = run(tmp, write=True)
        if code != 0:
            print("SELF-TEST FAIL: relokasi upload nyasar harus berhasil")
            return 1
        canonical = os.path.join(tmp, "assets/images/cms/homepage/nyasar.jpeg")
        if not os.path.isfile(canonical):
            print("SELF-TEST FAIL: file tidak dipindah ke path publik")
            return 1
        if os.path.exists(stray):
            print("SELF-TEST FAIL: file nyasar masih ada")
            return 1
        home = open(index_path, encoding="utf-8").read()
        if "/assets/images/cms/homepage/nyasar.jpeg" not in home:
            print("SELF-TEST FAIL: HTML tidak memakai file yang dipindah", home)
            return 1
        if "/assets/images/j8/hero.webp" not in home:
            print("SELF-TEST FAIL: relokasi mengubah slide lain")
            return 1

        print("\nSELF-TEST OK")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    return run(ROOT, write=True)


if __name__ == "__main__":
    sys.exit(main())
