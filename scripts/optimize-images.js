/**
 * optimize-images.js
 * Image optimization pipeline untuk OMODA JAECOO Palembang
 *
 * Dijalankan oleh GitHub Actions setelah push gambar baru.
 * Menggunakan Sharp untuk resize, compress, dan convert ke WebP.
 *
 * Target output:
 *   - Format: WebP (dengan fallback JPEG asli tetap ada)
 *   - Max width: 1920px (landscape) / 1440px (portrait)
 *   - Quality: 82 (WebP), 88 (JPEG)
 *   - Max file size target: ~400KB
 *
 * Strategi cache-busting:
 *   - Filename TIDAK diubah agar HTML tidak perlu diedit
 *   - WebP baru disimpan menggantikan WebP lama (content berubah)
 *   - Cloudflare Pages akan serve file baru setelah deploy
 *   - Untuk hard refresh: bisa manual purge cache di Cloudflare dashboard
 */

const fs   = require("fs");
const path = require("path");

// Sharp diinstall oleh GitHub Actions (npm install --no-save sharp)
let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  console.error("Sharp tidak tersedia. Jalankan: npm install sharp");
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────
// KONFIGURASI
// ──────────────────────────────────────────────────────────────
const CONFIG = {
  // Root folder gambar
  imageDir: path.join(process.cwd(), "assets", "images"),

  // Ekstensi yang diproses
  inputExts: [".jpg", ".jpeg", ".png", ".gif"],

  // Folder yang dikecualikan dari optimasi
  excludeDirs: [
    "colors",   // warna transparan PNG — jangan diubah
    "warna",    // warna J8
    "recognized", // sudah WebP
  ],

  // File yang dikecualikan (pattern)
  excludeFiles: [
    "logo-omoda-jaecoo",  // logo — jangan diubah
    "favicon",
    "apple-touch-icon",
  ],

  // Batas ukuran — file di bawah ini tidak perlu dioptimasi
  skipIfSmallerThan: 100 * 1024, // 100KB

  // Batas file yang sangat besar — ini yang paling penting dioptimasi
  largeFileThreshold: 1 * 1024 * 1024, // 1MB

  // ── Output settings ──────────────────────────────────────────

  // Hero / banner besar (landscape)
  heroLandscape: {
    maxWidth: 1920,
    maxHeight: 1080,
    webpQuality: 82,
    jpegQuality: 88,
  },

  // Hero / banner besar (portrait, untuk J5/J8 hero)
  heroPortrait: {
    maxWidth: 1440,
    maxHeight: 1920,
    webpQuality: 82,
    jpegQuality: 88,
  },

  // Gambar gallery / detail
  gallery: {
    maxWidth: 1200,
    maxHeight: 1600,
    webpQuality: 84,
    jpegQuality: 88,
  },

  // Gambar thumbnail / lineup (ukuran lebih kecil)
  thumbnail: {
    maxWidth: 800,
    maxHeight: 600,
    webpQuality: 85,
    jpegQuality: 88,
  },
};

// ──────────────────────────────────────────────────────────────
// HELPER
// ──────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[optimize-images] ${msg}`);
}

function logSkip(file, reason) {
  console.log(`  ⟳ skip: ${path.basename(file)} — ${reason}`);
}

function logOk(file, before, after) {
  const saving = Math.round((1 - after / before) * 100);
  const bKB = Math.round(before / 1024);
  const aKB = Math.round(after / 1024);
  console.log(`  ✓ ${path.basename(file)}: ${bKB}KB → ${aKB}KB (${saving}% hemat)`);
}

function isExcluded(filePath) {
  const rel = path.relative(CONFIG.imageDir, filePath);
  const parts = rel.split(path.sep);

  // Cek folder dikecualikan
  for (const part of parts.slice(0, -1)) {
    if (CONFIG.excludeDirs.includes(part)) return true;
  }

  // Cek filename dikecualikan
  const base = path.basename(filePath, path.extname(filePath)).toLowerCase();
  for (const pattern of CONFIG.excludeFiles) {
    if (base.includes(pattern)) return true;
  }

  return false;
}

/**
 * Tentukan profil optimasi berdasarkan ukuran/posisi gambar
 */
async function getProfile(filePath, metadata) {
  const { width, height } = metadata;
  const isPortrait = height > width;

  // Folder lineup / thumbnail
  const rel = path.relative(CONFIG.imageDir, filePath);
  if (rel.startsWith("lineup" + path.sep)) return CONFIG.thumbnail;

  // Hero portrait (J5, J8)
  if (isPortrait && width >= 1000) return CONFIG.heroPortrait;

  // Hero landscape
  if (!isPortrait && width >= 1400) return CONFIG.heroLandscape;

  // Default gallery
  return CONFIG.gallery;
}

// ──────────────────────────────────────────────────────────────
// OPTIMASI SATU FILE
// ──────────────────────────────────────────────────────────────

async function optimizeFile(filePath) {
  const ext    = path.extname(filePath).toLowerCase();
  const isPng  = ext === ".png";
  const isWebP = ext === ".webp";

  if (isExcluded(filePath)) {
    logSkip(filePath, "dikecualikan");
    return;
  }

  const statBefore = fs.statSync(filePath);
  const sizeBefore = statBefore.size;

  if (sizeBefore < CONFIG.skipIfSmallerThan && !isWebP) {
    logSkip(filePath, `sudah kecil (${Math.round(sizeBefore / 1024)}KB)`);
    return;
  }

  let metadata;
  try {
    metadata = await sharp(filePath).metadata();
  } catch (e) {
    logSkip(filePath, `tidak bisa dibaca: ${e.message}`);
    return;
  }

  const profile = await getProfile(filePath, metadata);

  const needsResize = metadata.width > profile.maxWidth || metadata.height > profile.maxHeight;

  // ── Buat versi WebP (replace jika sudah ada) ──────────────────
  if (!isPng) {
    // Untuk JPEG: buat WebP di path yang sama dengan ext diganti .webp
    const webpPath = filePath.replace(/\.(jpg|jpeg)$/i, ".webp");

    // Cek apakah WebP sudah ada dan lebih baru dari JPEG
    if (fs.existsSync(webpPath)) {
      const statWebP = fs.statSync(webpPath);
      // Jika WebP sudah lebih baru dan kecil, skip
      if (statWebP.mtimeMs > statBefore.mtimeMs && statWebP.size < sizeBefore * 0.95) {
        logSkip(webpPath, "WebP sudah ada dan dioptimasi");
        // Tetap optimasi JPEG asli jika terlalu besar
        if (sizeBefore > CONFIG.largeFileThreshold) {
          await compressJpeg(filePath, metadata, profile, sizeBefore);
        }
        return;
      }
    }

    // Buat/update WebP
    try {
      let sharpInst = sharp(filePath);

      if (needsResize) {
        sharpInst = sharpInst.resize({
          width: profile.maxWidth,
          height: profile.maxHeight,
          fit: "inside",
          withoutEnlargement: true,
        });
      }

      const webpBuf = await sharpInst
        .webp({ quality: profile.webpQuality, effort: 4 })
        .toBuffer();

      fs.writeFileSync(webpPath, webpBuf);
      const sizeAfter = webpBuf.length;
      logOk(webpPath, sizeBefore, sizeAfter);
    } catch (e) {
      log(`  ✗ Gagal buat WebP untuk ${path.basename(filePath)}: ${e.message}`);
    }
  }

  // ── Compress file asli jika terlalu besar ──────────────────────
  if (sizeBefore > CONFIG.largeFileThreshold) {
    if (ext === ".jpg" || ext === ".jpeg") {
      await compressJpeg(filePath, metadata, profile, sizeBefore);
    } else if (isPng && !isExcluded(filePath)) {
      await compressPng(filePath, metadata, profile, sizeBefore);
    }
  }
}

async function compressJpeg(filePath, metadata, profile, sizeBefore) {
  try {
    let sharpInst = sharp(filePath);

    const needsResize = metadata.width > profile.maxWidth || metadata.height > profile.maxHeight;
    if (needsResize) {
      sharpInst = sharpInst.resize({
        width: profile.maxWidth,
        height: profile.maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const jpegBuf = await sharpInst
      .jpeg({ quality: profile.jpegQuality, progressive: true, mozjpeg: true })
      .toBuffer();

    // Hanya replace jika ada penghematan signifikan (>10%)
    if (jpegBuf.length < sizeBefore * 0.90) {
      fs.writeFileSync(filePath, jpegBuf);
      logOk(filePath, sizeBefore, jpegBuf.length);
    } else {
      logSkip(filePath, "kompresi JPEG tidak signifikan");
    }
  } catch (e) {
    log(`  ✗ Gagal compress JPEG ${path.basename(filePath)}: ${e.message}`);
  }
}

async function compressPng(filePath, metadata, profile, sizeBefore) {
  try {
    let sharpInst = sharp(filePath);

    const needsResize = metadata.width > profile.maxWidth || metadata.height > profile.maxHeight;
    if (needsResize) {
      sharpInst = sharpInst.resize({
        width: profile.maxWidth,
        height: profile.maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const pngBuf = await sharpInst
      .png({ compressionLevel: 8, effort: 7 })
      .toBuffer();

    if (pngBuf.length < sizeBefore * 0.90) {
      fs.writeFileSync(filePath, pngBuf);
      logOk(filePath, sizeBefore, pngBuf.length);
    } else {
      logSkip(filePath, "kompresi PNG tidak signifikan");
    }
  } catch (e) {
    log(`  ✗ Gagal compress PNG ${path.basename(filePath)}: ${e.message}`);
  }
}

// ──────────────────────────────────────────────────────────────
// SCAN FOLDER
// ──────────────────────────────────────────────────────────────

function getAllImages(dir) {
  const results = [];

  function scan(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        // Skip folder dikecualikan
        if (!CONFIG.excludeDirs.includes(entry.name)) {
          scan(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (CONFIG.inputExts.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  scan(dir);
  return results;
}

// ──────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────

async function main() {
  const mode         = process.env.OPTIMIZE_MODE || "all";
  const changedFiles = process.env.CHANGED_FILES || "";

  log(`Mode: ${mode}`);
  log(`Image directory: ${CONFIG.imageDir}`);

  let filesToProcess = [];

  if (mode === "all") {
    // Scan semua gambar
    filesToProcess = getAllImages(CONFIG.imageDir);
    log(`Ditemukan ${filesToProcess.length} gambar untuk dioptimasi`);
  } else if (mode === "changed" && changedFiles) {
    // Hanya file yang berubah
    filesToProcess = changedFiles
      .split("\n")
      .map(f => f.trim())
      .filter(f => f && CONFIG.inputExts.includes(path.extname(f).toLowerCase()))
      .map(f => path.join(process.cwd(), f))
      .filter(f => fs.existsSync(f));

    log(`Mengoptimasi ${filesToProcess.length} gambar yang berubah`);
  }

  if (filesToProcess.length === 0) {
    log("Tidak ada gambar yang perlu dioptimasi.");
    return;
  }

  let optimized = 0;
  let skipped   = 0;
  let errors    = 0;

  for (const filePath of filesToProcess) {
    try {
      await optimizeFile(filePath);
      optimized++;
    } catch (e) {
      log(`✗ Error pada ${path.basename(filePath)}: ${e.message}`);
      errors++;
    }
  }

  log("");
  log(`Selesai:`);
  log(`  Diproses: ${optimized}`);
  log(`  Error: ${errors}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
