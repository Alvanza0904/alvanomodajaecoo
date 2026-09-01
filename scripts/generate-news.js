const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const NEWS_DIR = path.join(ROOT, "berita");
const INDEX_FILE = path.join(NEWS_DIR, "index.html");
const SITEMAP_FILE = path.join(ROOT, "sitemap.xml");
const SITEMAP_START = "<!-- CMS:BERITA:START -->";
const SITEMAP_END = "<!-- CMS:BERITA:END -->";

const SITE_URL = "https://omodajaecoopalembang.web.id";

const INJECT_START = "<!-- CMS:ARTIKEL:START -->";
const INJECT_END = "<!-- CMS:ARTIKEL:END -->";

function slugify(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseFrontMatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: content.trim() };

  const data = {};
  match[1].split(/\r?\n/).forEach(line => {
    const separator = line.indexOf(":");
    if (separator === -1) return;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  });

  return { data, body: match[2].trim() };
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let listItems = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    output.push(`<p>${paragraph.join(" ")}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listItems.length) return;
    output.push(`<ul>${listItems.map(i => `<li>${i}</li>`).join("")}</ul>`);
    listItems = [];
  }

  for (let line of lines) {
    line = line.trim();
    if (!line) { flushParagraph(); flushList(); continue; }
    if (/^###\s+/.test(line)) { flushParagraph(); flushList(); output.push(`<h3>${inlineMarkdown(line.replace(/^###\s+/, ""))}</h3>`); continue; }
    if (/^##\s+/.test(line)) { flushParagraph(); flushList(); output.push(`<h2>${inlineMarkdown(line.replace(/^##\s+/, ""))}</h2>`); continue; }
    if (/^#\s+/.test(line)) { flushParagraph(); flushList(); output.push(`<h1>${inlineMarkdown(line.replace(/^#\s+/, ""))}</h1>`); continue; }
    if (/^[-*]\s+/.test(line)) { flushParagraph(); listItems.push(inlineMarkdown(line.replace(/^[-*]\s+/, ""))); continue; }
    flushList();
    paragraph.push(inlineMarkdown(line));
  }

  flushParagraph();
  flushList();
  return output.join("\n");
}

function inlineMarkdown(text) {
  let v = escapeHtml(text);
  v = v.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  v = v.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  v = v.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return v;
}

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "long", year: "numeric"
  }).format(date);
}

function getDescription(body) {
  const text = body
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 160 ? text.slice(0, 157) + "..." : text;
}

function categorySlug(category) {
  const map = {
    "info terbaru": "info-terbaru",
    "harga & launching": "harga-launching",
    "harga dan launching": "harga-launching",
    "perbandingan model": "perbandingan",
    "perbandingan": "perbandingan",
  };
  return map[(category || "").toLowerCase()] || "info-terbaru";
}

function categoryClass(category) {
  const map = {
    "info-terbaru": "berita-cat--info",
    "harga-launching": "berita-cat--harga",
    "perbandingan": "berita-cat--perbandingan",
  };
  return map[categorySlug(category)] || "berita-cat--info";
}

function createArticleHtml(data, body) {
  const title = data.title || "Berita OMODA JAECOO Palembang";
  const description = data.description || getDescription(body);
  const date = data.date || new Date().toISOString();
  const category = data.category || "Info Terbaru";
  const image = data.image || "/assets/images/jaecoo-j5-hero.jpg";
  const slug = data.slug ? slugify(data.slug) : slugify(data.title);
  const articleUrl = `${SITE_URL}/berita/${slug}/`;
  const contentHtml = markdownToHtml(body);

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} | OMODA JAECOO Palembang</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${articleUrl}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="article">
<meta property="og:locale" content="id_ID">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${articleUrl}">
<meta property="og:site_name" content="OMODA JAECOO Palembang">
<meta property="og:image" content="${SITE_URL}${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${SITE_URL}${image}">
<link rel="preload" href="/assets/css/style.css" as="style">
<link rel="stylesheet" href="/assets/css/style.css">
<link rel="preload" href="/assets/css/berita.css" as="style">
<link rel="stylesheet" href="/assets/css/berita.css">
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": title,
  "description": description,
  "image": [`${SITE_URL}${image}`],
  "datePublished": date,
  "dateModified": date,
  "mainEntityOfPage": { "@type": "WebPage", "@id": articleUrl },
  "author": { "@type": "Person", "name": "Alvan" },
  "publisher": { "@type": "Organization", "name": "OMODA JAECOO Palembang", "url": SITE_URL },
  "inLanguage": "id-ID"
}, null, 2)}
</script>
</head>
<body class="berita-page">
<header class="navbar" id="navbar">
  <div class="navbar__inner">
    <a aria-label="OMODA JAECOO Palembang" class="navbar__logo" href="/">
      <img src="/assets/images/logo-omoda-jaecoo.png" alt="OMODA JAECOO Palembang" width="496" height="66" decoding="async">
    </a>
    <nav aria-label="Primary" class="navbar__menu" id="navbarMenu">
      <a class="navbar__link" href="/">HOME</a>
      <a class="navbar__link" href="/omoda-o4/">OMODA O4</a>
      <a class="navbar__link" href="/jaecoo-j5">JAECOO J5</a>
      <a class="navbar__link" href="/jaecoo-j7">JAECOO J7</a>
      <a class="navbar__link" href="/jaecoo-j7-sivp/">J7 SIVP</a>
      <a class="navbar__link" href="/jaecoo-j8">JAECOO J8</a>
      <a class="navbar__link navbar__link--cta" href="https://wa.me/6285183145926?text=Halo%20Alvan%2C%20saya%20mau%20tanya%20soal%20OMODA%20JAECOO%20Palembang." target="_blank" rel="noopener">WHATSAPP</a>
    </nav>
    <button aria-controls="navbarMenu" aria-expanded="false" aria-label="Buka menu navigasi" class="navbar__toggle" id="navbarToggle" type="button">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>
<main>
<article class="berita-article" itemscope itemtype="https://schema.org/NewsArticle">
<section class="berita-hero">
  <div class="berita-hero__inner wrap">
    <div class="berita-hero__breadcrumb">
      <a href="/">Home</a>
      <span aria-hidden="true">&middot;</span>
      <a href="/berita/">Berita</a>
      <span aria-hidden="true">&middot;</span>
      <span>${escapeHtml(category)}</span>
    </div>
    <div class="kicker">News &amp; Updates</div>
    <h1 class="berita-hero__title" itemprop="headline">${escapeHtml(title)}</h1>
    <p class="berita-hero__desc">${escapeHtml(description)}</p>
  </div>
</section>
<section class="berita-article-content wrap">
  <div class="berita-article__meta">
    <span class="berita-cat">${escapeHtml(category)}</span>
    <time datetime="${escapeHtml(date)}" itemprop="datePublished">${escapeHtml(formatDate(date))}</time>
  </div>
  <figure class="berita-article__image">
    <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" width="1200" height="675" loading="eager" decoding="async" itemprop="image">
  </figure>
  <div class="berita-article__content" itemprop="articleBody">
    ${contentHtml}
  </div>
  <section class="berita-cta-section" aria-label="Hubungi Sales Consultant">
    <div class="berita-cta">
      <div class="berita-cta__copy">
        <p class="berita-cta__label">Sales Consultant &middot; Palembang</p>
        <h2 class="berita-cta__title">Ada pertanyaan soal harga atau model?</h2>
        <p class="berita-cta__desc">Alvan siap bantu mulai dari cek harga OTR, simulasi kredit, sampai jadwal test drive langsung di Palembang.</p>
      </div>
      <div class="berita-cta__actions">
        <a class="berita-cta__btn" href="https://wa.me/6285183145926?text=Halo%20Alvan%2C%20saya%20baca%20berita%20di%20website%20dan%20mau%20tanya%20soal%20OMODA%20JAECOO%20Palembang." target="_blank" rel="noopener">Chat WhatsApp Alvan</a>
        <a class="berita-cta__btn berita-cta__btn--ghost" href="/berita/">&larr; Kembali ke Berita</a>
      </div>
    </div>
  </section>
</section>
</article>
</main>
<footer class="footer-v2">
  <div class="footer-v2__bottom">
    <p>&copy; 2026 OMODA JAECOO Palembang &middot; All Rights Reserved</p>
  </div>
</footer>
<a class="wa-float" aria-label="Chat WhatsApp Alvan" href="https://wa.me/6285183145926?text=Halo%20Alvan%2C%20saya%20mau%20tanya%20soal%20OMODA%20JAECOO%20Palembang." target="_blank" rel="noopener">
  <span>WhatsApp Alvan</span>
</a>
<script src="/assets/js/main.js"></script>
</body>
</html>`;
}

function createCardHtml(data, slug) {
  const title = data.title || "Berita OMODA JAECOO Palembang";
  const description = data.description || "";
  const date = data.date || new Date().toISOString();
  const category = data.category || "Info Terbaru";
  const image = data.image || "/assets/images/jaecoo-j5-hero.jpg";
  const href = `/berita/${slug}/`;

  return `
        <article class="berita-card" data-category="${categorySlug(category)}" itemscope itemtype="https://schema.org/NewsArticle">
          <a class="berita-card__media-link" href="${href}" tabindex="-1" aria-hidden="true">
            <div class="berita-card__media">
              <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" width="600" height="400" itemprop="image"/>
            </div>
          </a>
          <div class="berita-card__body">
            <div class="berita-card__meta">
              <span class="berita-cat ${categoryClass(category)}">${escapeHtml(category)}</span>
              <time class="berita-date" datetime="${escapeHtml(date)}" itemprop="datePublished">${escapeHtml(formatDate(date))}</time>
            </div>
            <h3 class="berita-card__title" itemprop="headline">
              <a href="${href}">${escapeHtml(title)}</a>
            </h3>
            <p class="berita-card__excerpt" itemprop="description">${escapeHtml(description)}</p>
            <div class="berita-card__footer">
              <a class="berita-read-more berita-read-more--sm" href="${href}">Baca &rarr;</a>
            </div>
          </div>
        </article>`;
}

function updateIndexHtml(articles) {
  if (!fs.existsSync(INDEX_FILE)) {
    console.warn("berita/index.html tidak ditemukan, skip update index.");
    return;
  }

  let html = fs.readFileSync(INDEX_FILE, "utf8");

  // Inject marker kalau belum ada
  if (!html.includes(INJECT_START)) {
    html = html.replace(
      '<div class="berita-grid" id="beritaGrid">',
      `<div class="berita-grid" id="beritaGrid">\n\n        ${INJECT_START}\n        ${INJECT_END}`
    );
  }

  // Sort terbaru dulu
  const sorted = [...articles].sort((a, b) =>
    new Date(b.data.date || 0) - new Date(a.data.date || 0)
  );

  const cardsHtml = sorted.length > 0
    ? sorted.map(a => createCardHtml(a.data, a.slug)).join("\n")
    : "";

  const startIdx = html.indexOf(INJECT_START);
  const endIdx = html.indexOf(INJECT_END);

  if (startIdx === -1 || endIdx === -1) {
    console.warn("Marker inject tidak ditemukan di index.html.");
    return;
  }

  html =
    html.slice(0, startIdx) +
    INJECT_START +
    "\n" +
    cardsHtml +
    "\n        " +
    html.slice(endIdx);

  fs.writeFileSync(INDEX_FILE, html, "utf8");
  console.log(`Updated berita/index.html dengan ${sorted.length} artikel CMS.`);
}

function cleanDeletedArticles(activeSlugs) {
  // Cari semua subfolder di berita/ yang punya index.html
  const entries = fs.readdirSync(NEWS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const slug = entry.name;

    // Lewati folder yang bukan artikel CMS
    const htmlFile = path.join(NEWS_DIR, slug, "index.html");
    if (!fs.existsSync(htmlFile)) continue;

    // Kalau slug tidak ada di daftar aktif, hapus foldernya
    if (!activeSlugs.has(slug)) {
      fs.rmSync(path.join(NEWS_DIR, slug), { recursive: true, force: true });
      console.log(`Deleted berita/${slug}/ (artikel dihapus dari CMS)`);
    }
  }
}


function updateSitemap(articles) {
  if (!fs.existsSync(SITEMAP_FILE)) {
    console.warn("sitemap.xml tidak ditemukan, skip update sitemap.");
    return;
  }

  let xml = fs.readFileSync(SITEMAP_FILE, "utf8");

  // Inject marker kalau belum ada
  if (!xml.includes(SITEMAP_START)) {
    xml = xml.replace(
      "  <!-- Berita -->",
      `  <!-- Berita -->\n  ${SITEMAP_START}\n  ${SITEMAP_END}`
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  const sorted = [...articles].sort((a, b) =>
    new Date(b.data.date || 0) - new Date(a.data.date || 0)
  );

  const urlEntries = sorted.map(a => {
    const slug = a.slug;
    const date = a.data.date
      ? new Date(a.data.date).toISOString().slice(0, 10)
      : today;
    return `  <url>\n    <loc>${SITE_URL}/berita/${slug}/</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
  }).join("\n");

  const startIdx = xml.indexOf(SITEMAP_START);
  const endIdx = xml.indexOf(SITEMAP_END);

  if (startIdx === -1 || endIdx === -1) {
    console.warn("Marker sitemap tidak ditemukan.");
    return;
  }

  xml =
    xml.slice(0, startIdx) +
    SITEMAP_START + "\n" +
    (urlEntries ? urlEntries + "\n  " : "  ") +
    xml.slice(endIdx);

  fs.writeFileSync(SITEMAP_FILE, xml, "utf8");
  console.log(`Updated sitemap.xml dengan ${sorted.length} artikel berita.`);
}

function generate() {
  if (!fs.existsSync(NEWS_DIR)) {
    console.log("Folder berita tidak ditemukan.");
    return;
  }

  const files = fs
    .readdirSync(NEWS_DIR)
    .filter(file => file.toLowerCase().endsWith(".md"));

  const articles = [];
  const activeSlugs = new Set();

  for (const file of files) {
    const filePath = path.join(NEWS_DIR, file);
    const source = fs.readFileSync(filePath, "utf8");
    const { data, body } = parseFrontMatter(source);

    if (!data.title) {
      console.warn(`Lewati ${file}: field "title" tidak ditemukan.`);
      continue;
    }

    const slug = data.slug ? slugify(data.slug) : slugify(data.title);
    activeSlugs.add(slug);

    const outputDir = path.join(NEWS_DIR, slug);
    fs.mkdirSync(outputDir, { recursive: true });

    const html = createArticleHtml(data, body);
    fs.writeFileSync(path.join(outputDir, "index.html"), html, "utf8");

    console.log(`Generated berita/${slug}/index.html`);
    articles.push({ data, slug });
  }

  // Hapus folder HTML artikel yang sudah tidak punya .md
  cleanDeletedArticles(activeSlugs);

  // Update halaman daftar berita
  updateIndexHtml(articles);

  // Update sitemap.xml
  updateSitemap(articles);

  if (files.length === 0) {
    console.log("Belum ada file berita Markdown.");
  } else {
    console.log("Semua berita berhasil diproses.");
  }
}

generate();
