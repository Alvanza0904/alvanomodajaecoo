/**
 * update-images.js
 * Sync gambar dari content/website/images.yml ke HTML pages
 *
 * Dijalankan oleh GitHub Actions ketika images.yml diubah via CMS.
 *
 * Cara kerja:
 * 1. Baca content/website/images.yml
 * 2. Parse YAML manual (tanpa dependency external)
 * 3. Update src dan alt di HTML files menggunakan marker/pattern
 *
 * Pendekatan: AMAN — tidak parse/rebuild HTML, hanya replace nilai
 * spesifik yang sudah dipetakan secara eksplisit.
 */

const fs   = require("fs");
const path = require("path");

const ROOT = process.cwd();
const YAML_FILE = path.join(ROOT, "content", "website", "images.yml");

// ──────────────────────────────────────────────────────────────
// YAML PARSER (minimal, no dependency)
// Mendukung: key: value, nested objects dengan indentasi 2 spasi
// ──────────────────────────────────────────────────────────────

function parseYaml(text) {
  const lines = text.split("\n");
  const root  = {};
  const stack = [{ obj: root, indent: -1 }];

  for (let i = 0; i < lines.length; i++) {
    const raw  = lines[i];
    const line = raw.replace(/\r$/, "");

    // Skip komentar dan baris kosong
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    // Hitung indentasi
    const indent = line.search(/\S/);
    if (indent === -1) continue;

    const content = line.trim();
    const sepIdx  = content.indexOf(":");
    if (sepIdx === -1) continue;

    const key = content.slice(0, sepIdx).trim();
    let val   = content.slice(sepIdx + 1).trim();

    // Strip inline komentar
    const commentIdx = val.indexOf(" #");
    if (commentIdx > 0) val = val.slice(0, commentIdx).trim();

    // Strip quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    // Pop stack ke level yang sesuai
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;

    if (val === "" || val === null) {
      // Ini adalah object parent
      parent[key] = {};
      stack.push({ obj: parent[key], indent });
    } else {
      parent[key] = val;
    }
  }

  return root;
}

// ──────────────────────────────────────────────────────────────
// UPDATE HELPER
// ──────────────────────────────────────────────────────────────

let totalUpdated = 0;

/**
 * Update src= dan alt= untuk satu tag <img> di HTML.
 * Mencari berdasarkan src asli, replace dengan src dan alt baru.
 */
function updateImgTag(html, oldSrc, newSrc, newAlt) {
  if (!oldSrc || !newSrc) return html;

  // Pattern: <img ... src="oldSrc" ... alt="..." ...>
  // Replace src dan alt
  let changed = false;

  // Replace src
  const srcPattern = new RegExp(
    `(<img[^>]*\\bsrc=")${escapeRegex(oldSrc)}(")`,'g'
  );
  const newHtml = html.replace(srcPattern, (match, pre, post) => {
    changed = true;
    return `${pre}${newSrc}${post}`;
  });

  if (!changed) return html;

  // Replace alt jika berbeda
  if (newAlt) {
    // Setelah src diganti, replace alt di sekitar tag yang baru diubah
    // Ini pendekatan sederhana: ganti alt pada baris yang mengandung newSrc
    return newHtml.replace(
      new RegExp(`(<img[^>]*src="${escapeRegex(newSrc)}"[^>]*\\balt=")[^"]*(")`,'g'),
      `$1${escapeHtml(newAlt)}$2`
    ).replace(
      new RegExp(`(<img[^>]*\\balt=")[^"]*("[^>]*src="${escapeRegex(newSrc)}")`,'g'),
      `$1${escapeHtml(newAlt)}$2`
    );
  }

  return newHtml;
}

/**
 * Update background-image:url() di inline style
 */
function updateBgUrl(html, oldSrc, newSrc) {
  if (!oldSrc || !newSrc) return html;
  return html.replace(
    new RegExp(`(background-image:url\\(['\"]?)${escapeRegex(oldSrc)}(['\"]?\\))`, 'g'),
    `$1${newSrc}$2`
  );
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function updateFile(filePath, updates) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ File tidak ditemukan: ${filePath}`);
    return;
  }

  let html = fs.readFileSync(filePath, "utf8");
  const original = html;

  for (const { oldSrc, newSrc, newAlt, isBg } of updates) {
    if (isBg) {
      html = updateBgUrl(html, oldSrc, newSrc);
    } else {
      html = updateImgTag(html, oldSrc, newSrc, newAlt);
    }
  }

  if (html !== original) {
    fs.writeFileSync(filePath, html, "utf8");
    totalUpdated++;
    console.log(`  ✓ Updated: ${path.relative(ROOT, filePath)}`);
  }
}

// ──────────────────────────────────────────────────────────────
// MAPPING: YAML key → HTML file(s) + old src (default)
// ──────────────────────────────────────────────────────────────
// Format: { yamlPath, htmlFiles, defaultSrc, isBg? }
// yamlPath: path di YAML (misal: homepage.hero_slide_1)
// htmlFiles: array path HTML yang mengandung gambar ini
// defaultSrc: nilai src saat ini di HTML (untuk matching)
// isBg: true jika background-image di inline style

function getMappings(cfg) {
  const hp  = cfg.homepage    || {};
  const j5  = cfg.jaecoo_j5  || {};
  const j7  = cfg.jaecoo_j7  || {};
  const j8  = cfg.jaecoo_j8  || {};
  const o4  = cfg.omoda_o4   || {};

  const INDEX = path.join(ROOT, "index.html");
  const J5    = path.join(ROOT, "jaecoo-j5.html");
  const J5INT = path.join(ROOT, "jaecoo-j5", "interior", "index.html");
  const J5DSN = path.join(ROOT, "jaecoo-j5", "design", "index.html");
  const J7    = path.join(ROOT, "jaecoo-j7.html");
  const J7DSN = path.join(ROOT, "jaecoo-j7", "design.html");
  const J7INT = path.join(ROOT, "jaecoo-j7", "interior.html");
  const J7TEC = path.join(ROOT, "jaecoo-j7", "technology.html");
  const J8    = path.join(ROOT, "jaecoo-j8.html");
  const J8DSN = path.join(ROOT, "jaecoo-j8-design.html");
  const J8INT = path.join(ROOT, "jaecoo-j8-interior.html");
  const J8TEC = path.join(ROOT, "jaecoo-j8-technology.html");
  const J8PER = path.join(ROOT, "jaecoo-j8-performance.html");
  const O4    = path.join(ROOT, "omoda-o4", "index.html");
  const O4DSN = path.join(ROOT, "omoda-o4", "design", "index.html");
  const O4INT = path.join(ROOT, "omoda-o4", "interior", "index.html");
  const O4TEC = path.join(ROOT, "omoda-o4", "technology", "index.html");
  const O4PRF = path.join(ROOT, "omoda-o4", "performance", "index.html");

  const maps = [];

  // ── HOMEPAGE ────────────────────────────────────────────────

  // Hero slide 1 background
  if (hp.hero_slide_1?.image) {
    maps.push({
      htmlFiles: [INDEX],
      oldSrc: "assets/images/omoda-o4-hero.webp",
      newSrc: hp.hero_slide_1.image.replace(/^\//, ""),
      isBg: true,
    });
    maps.push({
      htmlFiles: [INDEX],
      oldSrc: "/assets/images/omoda-o4-hero.webp",
      newSrc: hp.hero_slide_1.image,
      isBg: false,
      newAlt: hp.hero_slide_1.alt,
    });
  }

  // Hero slide 2 background
  if (hp.hero_slide_2?.image) {
    maps.push({
      htmlFiles: [INDEX],
      oldSrc: "assets/images/jaecoo-j5-hero.webp",
      newSrc: hp.hero_slide_2.image.replace(/^\//, ""),
      isBg: true,
    });
    maps.push({
      htmlFiles: [INDEX],
      oldSrc: "/assets/images/jaecoo-j5-hero.webp",
      newSrc: hp.hero_slide_2.image,
      isBg: false,
      newAlt: hp.hero_slide_2.alt,
    });
  }

  // Lineup images
  const lineupMap = {
    lineup_omoda_o4:    { old: "assets/images/lineup/lineup-omoda-o4.webp", alt: hp.lineup_omoda_o4?.alt },
    lineup_jaecoo_j5:   { old: "assets/images/lineup/lineup-jaecoo-j5.webp", alt: hp.lineup_jaecoo_j5?.alt },
    lineup_jaecoo_j7_shs:  { old: "assets/images/lineup/lineup-jaecoo-j7-sivp.webp", alt: hp.lineup_jaecoo_j7_shs?.alt },
    lineup_jaecoo_j7_sivp: { old: "assets/images/lineup/lineup-jaecoo-j7.webp", alt: hp.lineup_jaecoo_j7_sivp?.alt },
    lineup_jaecoo_j8:   { old: "assets/images/lineup/lineup-jaecoo-j8.webp", alt: hp.lineup_jaecoo_j8?.alt },
  };
  for (const [key, def] of Object.entries(lineupMap)) {
    const entry = hp[key];
    if (entry?.image && def.old) {
      maps.push({ htmlFiles: [INDEX], oldSrc: def.old, newSrc: entry.image.replace(/^\//, ""), newAlt: entry.alt });
    }
  }

  // Recognized images
  const recognizedMap = {
    recognized_j5:     { old: "assets/images/recognized/recognized-j5-no1-ev.webp" },
    recognized_j7_uk:  { old: "assets/images/recognized/recognized-j7-uk-topselling.webp" },
    recognized_j8_muri:{ old: "assets/images/recognized/recognized-j8-muri.webp" },
    recognized_o4_ai:  { old: "assets/images/recognized/recognized-o4-ai.webp" },
    recognized_j7_sivp:{ old: "assets/images/recognized/recognized-j7-sivp.webp" },
  };
  for (const [key, def] of Object.entries(recognizedMap)) {
    const entry = hp[key];
    if (entry?.image) {
      maps.push({ htmlFiles: [INDEX], oldSrc: def.old, newSrc: entry.image.replace(/^\//, ""), newAlt: entry.alt });
    }
  }

  // Delivery images
  const deliveryMap = {
    delivery_01: "assets/images/delivery-j5-1.jpg",
    delivery_02: "assets/images/delivery-j5-2.jpg",
    delivery_03: "assets/images/delivery-j5-3.jpg",
    delivery_04: "assets/images/delivery-j5-4.jpg",
    delivery_05: "assets/images/delivery-j5-5.webp",
    delivery_06: "assets/images/delivery-j5-6.webp",
  };
  for (const [key, oldSrc] of Object.entries(deliveryMap)) {
    const entry = hp[key];
    if (entry?.image) {
      maps.push({ htmlFiles: [INDEX], oldSrc, newSrc: entry.image.replace(/^\//, ""), newAlt: entry.alt });
    }
  }

  // ── JAECOO J5 ───────────────────────────────────────────────

  if (j5.hero?.image)
    maps.push({ htmlFiles: [J5], oldSrc: "/assets/images/jaecoo-j5/ext-showroom-hero.webp", newSrc: j5.hero.image, newAlt: j5.hero.alt });

  const j5Map = [
    ["interior_cockpit",       "/assets/images/jaecoo-j5/int-cockpit.webp",       [J5, J5INT]],
    ["interior_dashboard",     "/assets/images/jaecoo-j5/int-dashboard.webp",     [J5INT]],
    ["interior_front_seats",   "/assets/images/jaecoo-j5/int-front-seats.webp",   [J5, J5INT]],
    ["interior_rear_seats",    "/assets/images/jaecoo-j5/int-rear-seats.webp",    [J5INT]],
    ["interior_door",          "/assets/images/jaecoo-j5/int-door.webp",          [J5INT]],
    ["interior_sunroof",       "/assets/images/jaecoo-j5/int-sunroof.webp",       [J5INT]],
    ["interior_trunk",         "/assets/images/jaecoo-j5/int-trunk.webp",         [J5INT]],
    ["interior_camera",        "/assets/images/jaecoo-j5/int-camera.webp",        [J5INT]],
    ["interior_charging",      "/assets/images/jaecoo-j5/int-charging.webp",      [J5INT]],
    ["interior_center_console","/assets/images/jaecoo-j5/int-center-console.webp",[J5INT]],
    ["exterior_showroom_front","/assets/images/jaecoo-j5/ext-showroom-front.webp",[J5DSN]],
    ["exterior_side_wheel",    "/assets/images/jaecoo-j5/ext-side-wheel.webp",    [J5DSN]],
    ["exterior_front_detail",  "/assets/images/jaecoo-j5/ext-front-detail.webp",  [J5DSN]],
    ["exterior_taillight",     "/assets/images/jaecoo-j5/ext-taillight.webp",     [J5DSN]],
    ["exterior_rear",          "/assets/images/jaecoo-j5/ext-rear.webp",          [J5DSN]],
    ["exterior_mirror",        "/assets/images/jaecoo-j5/ext-mirror.webp",        [J5DSN]],
    ["exterior_body_detail",   "/assets/images/jaecoo-j5/ext-body-detail.webp",   [J5DSN]],
    ["color_champagne_silver", "/assets/images/jaecoo-j5/colors/j5-champagne-silver.png",[J5]],
    ["color_aqua_teal",        "/assets/images/jaecoo-j5/colors/j5-aqua-teal.png",       [J5]],
    ["color_glacier_white",    "/assets/images/jaecoo-j5/colors/j5-glacier-white.png",   [J5]],
    ["color_graphite_black",   "/assets/images/jaecoo-j5/colors/j5-graphite-black.png",  [J5]],
  ];

  for (const [key, oldSrc, files] of j5Map) {
    const entry = j5[key];
    if (entry?.image) {
      maps.push({ htmlFiles: files, oldSrc, newSrc: entry.image, newAlt: entry.alt });
    }
  }

  // ── JAECOO J7 ───────────────────────────────────────────────

  if (j7.hero?.image)
    maps.push({ htmlFiles: [J7], oldSrc: "/assets/images/jaecoo-j7/ext-profile.jpeg", newSrc: j7.hero.image, newAlt: j7.hero.alt });

  const j7Map = [
    ["exterior_studio",    "/assets/images/jaecoo-j7/ext-studio.jpeg",    [J7DSN]],
    ["exterior_front",     "/assets/images/jaecoo-j7/ext-front.jpeg",     [J7DSN]],
    ["exterior_side_2",    "/assets/images/jaecoo-j7/ext-side-2.jpeg",    [J7DSN]],
    ["exterior_quarter",   "/assets/images/jaecoo-j7/ext-quarter.jpeg",   [J7DSN]],
    ["exterior_detail",    "/assets/images/jaecoo-j7/ext-detail.jpeg",    [J7DSN]],
    ["exterior_rear",      "/assets/images/jaecoo-j7/ext-rear.jpeg",      [J7DSN, J7]],
    ["exterior_urban",     "/assets/images/jaecoo-j7/ext-urban.jpeg",     [J7DSN]],
    ["exterior_corner",    "/assets/images/jaecoo-j7/ext-corner.jpeg",    [J7]],
    ["exterior_dynamic",   "/assets/images/jaecoo-j7/ext-dynamic.jpeg",   [J7]],
    ["interior_cabin",     "/assets/images/jaecoo-j7/int-cabin.jpeg",     [J7INT]],
    ["interior_dashboard", "/assets/images/jaecoo-j7/int-dashboard.jpeg", [J7INT, J7TEC]],
    ["interior_screen",    "/assets/images/jaecoo-j7/int-screen.jpeg",    [J7INT, J7TEC]],
    ["interior_cockpit",   "/assets/images/jaecoo-j7/int-cockpit.jpeg",   [J7INT, J7]],
    ["color_1", "/assets/images/jaecoo-j7/colors/j7-color-1.png", [J7DSN]],
    ["color_2", "/assets/images/jaecoo-j7/colors/j7-color-2.png", [J7DSN]],
    ["color_3", "/assets/images/jaecoo-j7/colors/j7-color-3.png", [J7DSN]],
    ["color_4", "/assets/images/jaecoo-j7/colors/j7-color-4.png", [J7DSN]],
    ["color_5", "/assets/images/jaecoo-j7/colors/j7-color-5.png", [J7DSN]],
  ];

  for (const [key, oldSrc, files] of j7Map) {
    const entry = j7[key];
    if (entry?.image) {
      maps.push({ htmlFiles: files, oldSrc, newSrc: entry.image, newAlt: entry.alt });
    }
  }

  // ── JAECOO J8 ───────────────────────────────────────────────

  if (j8.hero?.image)
    maps.push({ htmlFiles: [J8], oldSrc: "/assets/images/jaecoo-j8/img06.jpeg", newSrc: j8.hero.image, newAlt: j8.hero.alt });

  const j8Map = [
    ["exterior_front",       "/assets/images/jaecoo-j8/exterior-front.jpeg",      [J8DSN]],
    ["exterior_front_day",   "/assets/images/jaecoo-j8/exterior-front-day.jpeg",  [J8DSN]],
    ["exterior_rear",        "/assets/images/jaecoo-j8/exterior-rear.jpeg",       [J8INT]],
    ["exterior_hero",        "/assets/images/jaecoo-j8/exterior-hero.jpeg",       [J8INT]],
    ["exterior_rear_light",  "/assets/images/jaecoo-j8/rear-light.jpeg",          [J8DSN]],
    ["exterior_wheel_detail","/assets/images/jaecoo-j8/wheel-detail.jpeg",        [J8DSN]],
    ["exterior_img07",       "/assets/images/jaecoo-j8/img07.jpeg",               [J8DSN]],
    ["exterior_img08",       "/assets/images/jaecoo-j8/img08.jpeg",               [J8PER]],
    ["interior_7seater",     "/assets/images/jaecoo-j8/interior-7seater.png",     [J8, J8INT]],
    ["interior_img16",       "/assets/images/jaecoo-j8/img16.jpeg",               [J8INT]],
    ["interior_phev_badge",  "/assets/images/jaecoo-j8/phev-badge.jpeg",          [J8INT]],
    ["tech_hero",            "/assets/images/jaecoo-j8/tech-hero.jpeg",           [J8, J8TEC]],
    ["tech_ardis",           "/assets/images/jaecoo-j8/tech-ardis.png",           [J8, J8TEC, J8PER]],
    ["tech_ardis_modes",     "/assets/images/jaecoo-j8/tech-ardis-modes.jpeg",    [J8TEC]],
    ["tech_battery",         "/assets/images/jaecoo-j8/tech-battery.png",         [J8TEC, J8PER]],
    ["tech_engine",          "/assets/images/jaecoo-j8/tech-engine.png",          [J8TEC, J8PER]],
    ["tech_suspension",      "/assets/images/jaecoo-j8/tech-suspension.png",      [J8TEC, J8PER]],
    ["tech_cta_bg",          "/assets/images/jaecoo-j8/tech-cta-bg.jpeg",         [J8, J8TEC, J8PER]],
    ["color_slate_grey",     "/assets/images/jaecoo-j8/warna/color-slate-grey.png", [J8DSN]],
    ["color_pearl_white",    "/assets/images/jaecoo-j8/warna/color-pearl-white.png",[J8DSN]],
    ["color_silver",         "/assets/images/jaecoo-j8/warna/color-silver.png",     [J8DSN]],
    ["color_black",          "/assets/images/jaecoo-j8/warna/color-black.png",      [J8DSN]],
  ];

  for (const [key, oldSrc, files] of j8Map) {
    const entry = j8[key];
    if (entry?.image) {
      maps.push({ htmlFiles: files, oldSrc, newSrc: entry.image, newAlt: entry.alt });
    }
  }

  // ── OMODA O4 ────────────────────────────────────────────────

  if (o4.hero?.image)
    maps.push({ htmlFiles: [O4], oldSrc: "/assets/images/omoda-o4/hero.webp", newSrc: o4.hero.image, newAlt: o4.hero.alt });

  const o4Map = [
    ["showcase",          "/assets/images/omoda-o4/showcase.webp",          [O4]],
    ["exterior_hero",     "/assets/images/omoda-o4/exterior-hero.webp",     [O4, O4DSN]],
    ["exterior_side",     "/assets/images/omoda-o4/exterior-side.webp",     [O4DSN]],
    ["exterior_headlight","/assets/images/omoda-o4/exterior-headlight.webp",[O4DSN]],
    ["exterior_wheel",    "/assets/images/omoda-o4/exterior-wheel.webp",    [O4DSN]],
    ["exterior_badge",    "/assets/images/omoda-o4/exterior-badge.webp",    [O4DSN]],
    ["exterior_cgi_rear", "/assets/images/omoda-o4/cgi-rear.webp",          [O4DSN]],
    ["interior_hero",     "/assets/images/omoda-o4/interior-hero.webp",     [O4, O4INT]],
    ["interior_sunroof",  "/assets/images/omoda-o4/interior-sunroof.webp",  [O4INT]],
    ["interior_seats",    "/assets/images/omoda-o4/interior-seats.webp",    [O4INT]],
    ["interior_detail",   "/assets/images/omoda-o4/interior-detail.webp",   [O4INT]],
    ["tech_cockpit",      "/assets/images/omoda-o4/tech-cockpit.webp",      [O4, O4TEC]],
    ["tech_highway",      "/assets/images/omoda-o4/tech-highway.webp",      [O4TEC]],
    ["technology",        "/assets/images/omoda-o4/technology.webp",        [O4TEC]],
    ["spec_overview",     "/assets/images/omoda-o4/spec-overview.webp",     [O4]],
    ["spec_dimensions",   "/assets/images/omoda-o4/spec-dimensions.webp",   [O4PRF]],
    ["safety",            "/assets/images/omoda-o4/safety.webp",            [O4]],
    ["gallery_01",        "/assets/images/omoda-o4/gallery-01.webp",        [O4]],
    ["gallery_02",        "/assets/images/omoda-o4/gallery-02.webp",        [O4]],
    ["gallery_03",        "/assets/images/omoda-o4/gallery-03.webp",        [O4]],
    ["color_blue_ocean",    "/assets/images/omoda-o4/colors/o4-blue-ocean.webp",     [O4]],
    ["color_midnight_black","/assets/images/omoda-o4/colors/o4-midnight-black.webp",[O4]],
    ["color_polar_white",   "/assets/images/omoda-o4/colors/o4-polar-white.webp",    [O4]],
  ];

  for (const [key, oldSrc, files] of o4Map) {
    const entry = o4[key];
    if (entry?.image) {
      maps.push({ htmlFiles: files, oldSrc, newSrc: entry.image, newAlt: entry.alt });
    }
  }

  return maps;
}

// ──────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(YAML_FILE)) {
    console.error(`File tidak ditemukan: ${YAML_FILE}`);
    process.exit(1);
  }

  const yaml  = fs.readFileSync(YAML_FILE, "utf8");
  const cfg   = parseYaml(yaml);
  const maps  = getMappings(cfg);

  console.log(`[update-images] Memproses ${maps.length} mapping gambar...`);

  // Group by file untuk efisiensi (baca file sekali, apply semua update)
  const byFile = new Map();
  for (const m of maps) {
    for (const file of m.htmlFiles) {
      if (!byFile.has(file)) byFile.set(file, []);
      byFile.get(file).push({
        oldSrc: m.oldSrc,
        newSrc: m.newSrc,
        newAlt: m.newAlt,
        isBg:   m.isBg || false,
      });
    }
  }

  for (const [file, updates] of byFile) {
    updateFile(file, updates);
  }

  console.log(`\n[update-images] Selesai. ${totalUpdated} file diupdate.`);
}

main();
