#!/usr/bin/env python3
"""
update-images.py
Membaca semua file content MD dan mengupdate src/style gambar di HTML.
Dijalankan oleh GitHub Actions setiap kali ada push ke branch main.
"""

import os
import re
import glob

ROOT = os.path.dirname(os.path.abspath(__file__))

# ─────────────────────────────────────────────
# 1. Baca semua file MD → dict {image_path_lama: image_path_baru}
# ─────────────────────────────────────────────
def parse_md_files():
    """
    Setiap file MD punya frontmatter:
      image: "/assets/images/xxx.webp"
    Kita buat mapping: nama_file_slug → image_value
    Dan juga reverse-map: image_lama → image_baru (jika berubah)
    """
    # Kumpulkan semua MD
    mapping = {}  # slug → {image, alt}
    for md_path in glob.glob(os.path.join(ROOT, "content/**/*.md"), recursive=True):
        with open(md_path, encoding="utf-8") as f:
            content = f.read()

        # Ambil image dan alt dari frontmatter
        image_match = re.search(r'^image:\s*["\']?(/assets/images/[^\s"\']+)["\']?', content, re.MULTILINE)
        alt_match   = re.search(r'^alt:\s*["\']?(.+?)["\']?\s*$', content, re.MULTILINE)

        if not image_match:
            continue

        slug = os.path.splitext(os.path.basename(md_path))[0]
        folder = os.path.basename(os.path.dirname(md_path))
        key = f"{folder}/{slug}"

        mapping[key] = {
            "image": image_match.group(1).strip(),
            "alt":   alt_match.group(1).strip() if alt_match else "",
            "md_path": md_path,
        }

    return mapping


# ─────────────────────────────────────────────
# 2. Bangun mapping image_lama → image_baru
#    Dengan membandingkan nilai MD dengan nilai yang ada di HTML
# ─────────────────────────────────────────────

# Pemetaan statis: slug MD → image path lama yang dipakai di HTML
# Format: "folder/slug": "path/lama/di/html.ext"
# Ini diperlukan karena nama file HTML tidak selalu sama dengan slug MD.
STATIC_MAP = {
    # ── Homepage ──
    "homepage/hero-slide-1":        "assets/images/omoda-o4-hero.webp",
    "homepage/hero-slide-2":        "assets/images/jaecoo-j5-hero.webp",
    "homepage/delivery-01":         "assets/images/delivery-j5-1.jpg",
    "homepage/delivery-02":         "assets/images/delivery-j5-2.jpg",
    "homepage/delivery-03":         "assets/images/delivery-j5-3.jpg",
    "homepage/delivery-04":         "assets/images/delivery-j5-4.jpg",
    "homepage/delivery-05":         "assets/images/delivery-j5-5.webp",
    "homepage/delivery-06":         "assets/images/delivery-j5-6.webp",
    "homepage/lineup-omoda-o4":     "assets/images/lineup/lineup-omoda-o4.webp",
    "homepage/lineup-jaecoo-j5":    "assets/images/lineup/lineup-jaecoo-j5.webp",
    "homepage/lineup-jaecoo-j7-shs":"assets/images/lineup/lineup-jaecoo-j7-sivp.webp",
    "homepage/lineup-jaecoo-j7-sivp":"assets/images/lineup/lineup-jaecoo-j7.webp",
    "homepage/lineup-jaecoo-j8":    "assets/images/lineup/lineup-jaecoo-j8.webp",
    "homepage/recognized-j5":       "assets/images/recognized/recognized-j5-no1-ev.webp",
    "homepage/recognized-j7-uk":    "assets/images/recognized/recognized-j7-uk-topselling.webp",
    "homepage/recognized-j8-muri":  "assets/images/recognized/recognized-j8-muri.webp",
    "homepage/recognized-o4-ai":    "assets/images/recognized/recognized-o4-ai.webp",
    "homepage/recognized-j7-sivp":  "assets/images/recognized/recognized-j7-sivp.webp",

    # ── JAECOO J5 ──
    "jaecoo-j5/hero":                    "/assets/images/jaecoo-j5/ext-showroom-hero.webp",
    "jaecoo-j5/interior-cockpit":        "/assets/images/jaecoo-j5/int-cockpit.webp",
    "jaecoo-j5/interior-front-seats":    "/assets/images/jaecoo-j5/int-front-seats.webp",
    "jaecoo-j5/exterior-body-detail":    "/assets/images/jaecoo-j5/ext-body-detail.webp",
    "jaecoo-j5/exterior-front-detail":   "/assets/images/jaecoo-j5/ext-front-detail.webp",
    "jaecoo-j5/exterior-mirror":         "/assets/images/jaecoo-j5/ext-mirror.webp",
    "jaecoo-j5/exterior-rear":           "/assets/images/jaecoo-j5/ext-rear.webp",
    "jaecoo-j5/exterior-showroom-front": "/assets/images/jaecoo-j5/ext-showroom-front.webp",
    "jaecoo-j5/exterior-side-wheel":     "/assets/images/jaecoo-j5/ext-side-wheel.webp",
    "jaecoo-j5/exterior-taillight":      "/assets/images/jaecoo-j5/ext-taillight.webp",
    "jaecoo-j5/interior-camera":         "/assets/images/jaecoo-j5/int-camera.webp",
    "jaecoo-j5/interior-center-console": "/assets/images/jaecoo-j5/int-center-console.webp",
    "jaecoo-j5/interior-charging":       "/assets/images/jaecoo-j5/int-charging.webp",
    "jaecoo-j5/interior-dashboard":      "/assets/images/jaecoo-j5/int-dashboard.webp",
    "jaecoo-j5/interior-door":           "/assets/images/jaecoo-j5/int-door.webp",
    "jaecoo-j5/interior-rear-seats":     "/assets/images/jaecoo-j5/int-rear-seats.webp",
    "jaecoo-j5/interior-sunroof":        "/assets/images/jaecoo-j5/int-sunroof.webp",
    "jaecoo-j5/interior-trunk":          "/assets/images/jaecoo-j5/int-trunk.webp",

    # ── JAECOO J7 ──
    "jaecoo-j7/hero":               "/assets/images/jaecoo-j7/ext-profile.jpeg",
    "jaecoo-j7/exterior-corner":    "/assets/images/jaecoo-j7/ext-corner.jpeg",
    "jaecoo-j7/exterior-detail":    "/assets/images/jaecoo-j7/ext-detail.jpeg",
    "jaecoo-j7/exterior-dynamic":   "/assets/images/jaecoo-j7/ext-dynamic.jpeg",
    "jaecoo-j7/exterior-front":     "/assets/images/jaecoo-j7/ext-front.jpeg",
    "jaecoo-j7/exterior-quarter":   "/assets/images/jaecoo-j7/ext-quarter.jpeg",
    "jaecoo-j7/exterior-rear":      "/assets/images/jaecoo-j7/ext-rear.jpeg",
    "jaecoo-j7/exterior-side":      "/assets/images/jaecoo-j7/ext-side-2.jpeg",
    "jaecoo-j7/exterior-studio":    "/assets/images/jaecoo-j7/ext-studio.jpeg",
    "jaecoo-j7/exterior-urban":     "/assets/images/jaecoo-j7/ext-urban.jpeg",
    "jaecoo-j7/interior-cabin":     "/assets/images/jaecoo-j7/int-cabin.jpeg",
    "jaecoo-j7/interior-cockpit":   "/assets/images/jaecoo-j7/int-cockpit.jpeg",
    "jaecoo-j7/interior-dashboard": "/assets/images/jaecoo-j7/int-dashboard.jpeg",
    "jaecoo-j7/interior-screen":    "/assets/images/jaecoo-j7/int-screen.jpeg",

    # ── JAECOO J8 ──
    "jaecoo-j8/hero":                   "/assets/images/jaecoo-j8/img06.jpeg",
    "jaecoo-j8/exterior-front-day":     "/assets/images/jaecoo-j8/exterior-front-day.jpeg",
    "jaecoo-j8/exterior-front":         "/assets/images/jaecoo-j8/exterior-front.jpeg",
    "jaecoo-j8/exterior-hero":          "/assets/images/jaecoo-j8/exterior-hero.jpeg",
    "jaecoo-j8/exterior-rear-light":    "/assets/images/jaecoo-j8/rear-light.jpeg",
    "jaecoo-j8/exterior-rear":          "/assets/images/jaecoo-j8/exterior-rear.jpeg",
    "jaecoo-j8/exterior-wheel-detail":  "/assets/images/jaecoo-j8/wheel-detail.jpeg",
    "jaecoo-j8/interior-7seater":       "/assets/images/jaecoo-j8/interior-7seater.png",
    "jaecoo-j8/interior-img16":         "/assets/images/jaecoo-j8/img16.jpeg",
    "jaecoo-j8/interior-phev-badge":    "/assets/images/jaecoo-j8/phev-badge.jpeg",
    "jaecoo-j8/tech-ardis-modes":       "/assets/images/jaecoo-j8/tech-ardis-modes.jpeg",
    "jaecoo-j8/tech-ardis":             "/assets/images/jaecoo-j8/tech-ardis.png",
    "jaecoo-j8/tech-battery":           "/assets/images/jaecoo-j8/tech-battery.png",
    "jaecoo-j8/tech-cta-bg":            "/assets/images/jaecoo-j8/tech-cta-bg.jpeg",
    "jaecoo-j8/tech-engine":            "/assets/images/jaecoo-j8/tech-engine.png",
    "jaecoo-j8/tech-hero":              "/assets/images/jaecoo-j8/tech-hero.jpeg",

    # ── OMODA O4 ──
    "omoda-o4/hero":              "/assets/images/omoda-o4/hero.webp",
    "omoda-o4/exterior-headlight":"/assets/images/omoda-o4/exterior-headlight.webp",
    "omoda-o4/exterior-hero":     "/assets/images/omoda-o4/exterior-hero.webp",
    "omoda-o4/exterior-side":     "/assets/images/omoda-o4/exterior-side.webp",
    "omoda-o4/exterior-wheel":    "/assets/images/omoda-o4/exterior-wheel.webp",
    "omoda-o4/interior-detail":   "/assets/images/omoda-o4/interior-detail.webp",
    "omoda-o4/interior-hero":     "/assets/images/omoda-o4/interior-hero.webp",
    "omoda-o4/interior-seats":    "/assets/images/omoda-o4/interior-seats.webp",
    "omoda-o4/interior-sunroof":  "/assets/images/omoda-o4/interior-sunroof.webp",
    "omoda-o4/safety":            "/assets/images/omoda-o4/safety.webp",
    "omoda-o4/showcase":          "/assets/images/omoda-o4/showcase.webp",
    "omoda-o4/spec-overview":     "/assets/images/omoda-o4/spec-overview.webp",
    "omoda-o4/tech-cockpit":      "/assets/images/omoda-o4/tech-cockpit.webp",
}


# ─────────────────────────────────────────────
# 3. Update semua HTML files
# ─────────────────────────────────────────────
HTML_FILES = [
    "index.html",
    "jaecoo-j5.html",
    "jaecoo-j5/design/index.html",
    "jaecoo-j5/interior/index.html",
    "jaecoo-j5/specifications/index.html",
    "jaecoo-j5/technology/index.html",
    "jaecoo-j7.html",
    "jaecoo-j7/design.html",
    "jaecoo-j7/interior.html",
    "jaecoo-j7/performance.html",
    "jaecoo-j7/safety.html",
    "jaecoo-j7/technology.html",
    "jaecoo-j7-sivp/index.html",
    "jaecoo-j8.html",
    "jaecoo-j8-design.html",
    "jaecoo-j8-interior.html",
    "jaecoo-j8-performance.html",
    "jaecoo-j8-specifications.html",
    "jaecoo-j8-technology.html",
    "omoda-o4/index.html",
    "omoda-o4/design/index.html",
    "omoda-o4/interior/index.html",
    "omoda-o4/performance/index.html",
    "omoda-o4/technology/index.html",
]


def normalize(path):
    """Hapus leading slash untuk perbandingan."""
    return path.lstrip("/")


def update_html(html_path, replacements):
    """
    replacements: list of (old_image, new_image, new_alt)
    Mengganti src= dan background-image:url() dan poster= dan preload href=
    """
    if not os.path.exists(html_path):
        print(f"  [skip] tidak ditemukan: {html_path}")
        return False

    with open(html_path, encoding="utf-8") as f:
        original = f.read()

    updated = original
    changed = False

    for old_img, new_img, new_alt in replacements:
        old_norm = normalize(old_img)
        new_norm = normalize(new_img)

        if old_norm == new_norm:
            continue  # tidak ada perubahan

        # Ganti semua variasi (dengan/tanpa leading slash)
        for prefix_old in [old_img, "/" + old_norm, old_norm]:
            for prefix_new in [new_img, "/" + new_norm, old_norm]:
                # src="..."
                before = f'src="{prefix_old}"'
                after  = f'src="{prefix_new}"'
                if before in updated:
                    updated = updated.replace(before, after)
                    changed = True

                # poster="..."
                before = f'poster="{prefix_old}"'
                after  = f'poster="{prefix_new}"'
                if before in updated:
                    updated = updated.replace(before, after)
                    changed = True

                # href="..." (preload)
                before = f'href="{prefix_old}"'
                after  = f'href="{prefix_new}"'
                if before in updated:
                    updated = updated.replace(before, after)
                    changed = True

                # background-image:url('...')
                before = f"url('{prefix_old}')"
                after  = f"url('{prefix_new}')"
                if before in updated:
                    updated = updated.replace(before, after)
                    changed = True

        # Update alt text jika ada dan new_alt tidak kosong
        if new_alt and old_norm != new_norm:
            # Cari alt yang terkait dengan gambar ini - hanya ganti jika tepat berdekatan
            # Pattern: src="...gambar..." alt="..." atau alt="..." src="...gambar..."
            pass  # Alt dibiarkan manual agar tidak salah replace

    if changed:
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(updated)
        print(f"  [updated] {html_path}")
    else:
        print(f"  [no change] {html_path}")

    return changed


def main():
    print("=== Update Images from CMS ===\n")

    # Baca semua MD files
    md_data = parse_md_files()
    print(f"Ditemukan {len(md_data)} file MD dengan gambar.\n")

    # Bangun daftar replacement berdasarkan STATIC_MAP
    replacements = []
    for slug, old_path in STATIC_MAP.items():
        if slug in md_data:
            new_path = md_data[slug]["image"]
            new_alt  = md_data[slug]["alt"]
            old_norm = normalize(old_path)
            new_norm = normalize(new_path)
            if old_norm != new_norm:
                print(f"  CHANGED: {slug}")
                print(f"    lama : {old_path}")
                print(f"    baru : {new_path}")
                replacements.append((old_path, new_path, new_alt))

    if not replacements:
        print("\nTidak ada perubahan gambar. Semua HTML sudah up-to-date.")
        return

    print(f"\nTotal perubahan: {len(replacements)}\n")
    print("Memperbarui HTML files...")

    total_changed = 0
    for rel_path in HTML_FILES:
        abs_path = os.path.join(ROOT, rel_path)
        if update_html(abs_path, replacements):
            total_changed += 1

    print(f"\nSelesai. {total_changed} file HTML diperbarui.")

    # ── Update STATIC_MAP di script ini sendiri ──
    # Setelah replace berhasil, update nilai lama di STATIC_MAP
    # agar run berikutnya tidak salah replace
    update_self(replacements)


def update_self(replacements):
    """Update nilai STATIC_MAP di script ini agar sinkron dengan nilai baru."""
    script_path = os.path.abspath(__file__)
    with open(script_path, encoding="utf-8") as f:
        script = f.read()

    changed = False
    for old_img, new_img, _ in replacements:
        old_norm = normalize(old_img)
        new_norm = normalize(new_img)
        if old_norm == new_norm:
            continue
        # Ganti nilai di STATIC_MAP string (dengan/tanpa slash)
        for variant_old in [old_img, "/" + old_norm]:
            for variant_new in [new_img]:
                target = f'"{variant_old}"'
                replace = f'"{variant_new}"'
                if target in script:
                    script = script.replace(target, replace, 1)
                    changed = True
                    break

    if changed:
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(script)
        print("\n[self-update] STATIC_MAP di script diperbarui.")


if __name__ == "__main__":
    main()
