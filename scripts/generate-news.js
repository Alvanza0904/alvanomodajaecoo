const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const NEWS_DIR = path.join(ROOT, "berita");
const INDEX_FILE = path.join(NEWS_DIR, "index.html");
const SITEMAP_FILE = path.join(ROOT, "sitemap.xml");

const SITE_URL = "https://omodajaecoopalembang.web.id";
const INJECT_START = "<!-- CMS:ARTIKEL:START -->";
const INJECT_END = "<!-- CMS:ARTIKEL:END -->";
const SITEMAP_START = "<!-- CMS:BERITA:START -->";
const SITEMAP_END = "<!-- CMS:BERITA:END -->";

function slugify(text) {
  return String(text || "")
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

function escapeAttr(value) {
  return escapeHtml(value).replace(/\n/g, " ");
}

function parseFrontMatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: content.trim() };

  const data = {};
  let currentKey = null;

  match[1].split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.replace(/\t/g, "  ");
    const sep = line.indexOf(":");

    // Support simple YAML multiline/indented values.
    if ((line.startsWith(" ") || line.startsWith("\t")) && currentKey) {
      const continuation = line.trim();
      if (continuation) data[currentKey] = `${data[currentKey]} ${continuation}`.trim();
      return;
    }

    if (sep === -1) return;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
    currentKey = key;
  });

  return { data, body: match[2].trim() };
}

function inlineMarkdown(text) {
  let v = escapeHtml(text);
  const tokens = [];
  const stash = html => {
    const token = `@@MDTOKEN${tokens.length}@@`;
    tokens.push(html);
    return token;
  };

  // Images first so their alt text is not treated as normal inline text.
  v = v.replace(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g, (_, alt, src, title) => {
    return stash(`<figure class="art-inline-image"><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" loading="lazy" decoding="async"><figcaption>${escapeHtml(title || alt)}</figcaption></figure>`);
  });

  v = v.replace(/\[([^\]]+)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g, (_, label, href) => {
    return stash(`<a href="${escapeAttr(href)}">${label}</a>`);
  });

  v = v.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  v = v.replace(/__(.+?)__/g, "<strong>$1</strong>");
  v = v.replace(/\*(.+?)\*/g, "<em>$1</em>");
  v = v.replace(/_(.+?)_/g, "<em>$1</em>");
  v = v.replace(/`([^`]+)`/g, "<code>$1</code>");

  tokens.forEach((html, i) => {
    v = v.replace(`@@MDTOKEN${i}@@`, html);
  });
  return v;
}

function looksLikeHeading(line) {
  const text = line.trim();
  if (!text || text.length > 90) return false;
  if (/[.!,:;]$/.test(text)) return false;
  if (/^(dan|atau|yang|ini|itu|dengan|untuk|karena|sehingga|jadi|namun|tetapi)\b/i.test(text)) return false;

  return /^(berapa|kenapa|mengapa|apa|bagaimana|kapan|masih|mau|harga|desain|eksterior|interior|performa|teknologi|fitur|spesifikasi|keamanan|kenyamanan|alasan|kelebihan|kekurangan|kesimpulan|jadi|apakah|ingin|cara|cek|pilih|bandingkan|jangan)\b/i.test(text);
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let listItems = [];
  let orderedItems = [];
  let quoteLines = [];
  let inCode = false;
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${paragraph.join(" ")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    output.push(`<ul>${listItems.map(i => `<li>${i}</li>`).join("")}</ul>`);
    listItems = [];
  };
  const flushOrdered = () => {
    if (!orderedItems.length) return;
    output.push(`<ol>${orderedItems.map(i => `<li>${i}</li>`).join("")}</ol>`);
    orderedItems = [];
  };
  const flushQuote = () => {
    if (!quoteLines.length) return;
    output.push(`<blockquote><p>${quoteLines.map(inlineMarkdown).join(" ")}</p></blockquote>`);
    quoteLines = [];
  };
  const flushCode = () => {
    if (!codeLines.length) return;
    output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushOrdered();
    flushQuote();
  };

  for (let rawLine of lines) {
    const line = rawLine.trim();

    if (/^```/.test(line)) {
      if (inCode) flushCode();
      else flushAll();
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line) {
      flushAll();
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph(); flushList(); flushOrdered();
      quoteLines.push(line.replace(/^>\s?/, ""));
      continue;
    }
    if (/^---+$/.test(line)) {
      flushAll();
      output.push("<hr>");
      continue;
    }
    if (/^#{3}\s+/.test(line)) {
      flushAll(); output.push(`<h3>${inlineMarkdown(line.replace(/^###\s+/, ""))}</h3>`); continue;
    }
    if (/^#{2}\s+/.test(line)) {
      flushAll(); output.push(`<h2>${inlineMarkdown(line.replace(/^##\s+/, ""))}</h2>`); continue;
    }
    if (/^#{1}\s+/.test(line)) {
      flushAll(); output.push(`<h2>${inlineMarkdown(line.replace(/^#\s+/, ""))}</h2>`); continue;
    }
    if (/^(?:[-*]|•)\s+/.test(line)) {
      flushParagraph(); flushOrdered(); flushQuote();
      listItems.push(inlineMarkdown(line.replace(/^(?:[-*]|•)\s+/, "")));
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      flushParagraph(); flushList(); flushQuote();
      orderedItems.push(inlineMarkdown(line.replace(/^\d+[.)]\s+/, "")));
      continue;
    }

    // The CMS can contain plain-text headings. Promote obvious standalone headings.
    if (!paragraph.length && looksLikeHeading(line)) {
      flushAll();
      output.push(`<h2>${inlineMarkdown(line)}</h2>`);
      continue;
    }

    flushList();
    flushOrdered();
    flushQuote();
    paragraph.push(inlineMarkdown(line));
  }

  if (inCode) flushCode();
  flushAll();
  return output.join("\n");
}

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "long", year: "numeric"
  }).format(date);
}

function isoDate(dateString) {
  const date = new Date(dateString || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function getPlainText(body) {
  return String(body || "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getDescription(body) {
  const text = getPlainText(body);
  if (text.length <= 155) return text;
  return text.slice(0, 152).replace(/\s+\S*$/, "") + "...";
}

function normalizeDescription(value, fallback) {
  const text = String(value || fallback || "").replace(/\s+/g, " ").trim();
  if (text.length <= 160) return text;
  return text.slice(0, 157).replace(/\s+\S*$/, "") + "...";
}

function categorySlug(category) {
  const map = {
    "info terbaru": "info-terbaru",
    "harga & launching": "harga-launching",
    "harga dan launching": "harga-launching",
    "perbandingan model": "perbandingan",
    "perbandingan": "perbandingan",
  };
  return map[String(category || "").toLowerCase()] || "info-terbaru";
}

function categoryClass(category) {
  const map = {
    "info-terbaru": "berita-cat--info",
    "harga-launching": "berita-cat--harga",
    "perbandingan": "berita-cat--perbandingan",
  };
  return map[categorySlug(category)] || "berita-cat--info";
}

function absoluteUrl(image) {
  if (!image) return `${SITE_URL}/assets/images/jaecoo-j5-hero.jpg`;
  if (/^https?:\/\//i.test(image)) return image;
  return `${SITE_URL}${image.startsWith("/") ? image : `/${image}`}`;
}

function buildSeoKeywords(title, body, data) {
  const haystack = `${title} ${body}`.toLowerCase();
  const candidates = [
    data.focus_keyword,
    "OMODA JAECOO Palembang",
    "JAECOO Palembang",
    "harga JAECOO J5",
    "harga JAECOO J7",
    "harga JAECOO J8",
    "harga OTR",
    "simulasi kredit JAECOO",
    "test drive JAECOO",
    "dealer resmi JAECOO Palembang",
    "JAECOO J5",
    "JAECOO J7",
    "JAECOO J8",
    "OMODA O4",
  ].filter(Boolean);

  const seen = new Set();
  return candidates
    .map(k => String(k).trim())
    .filter(k => k.length >= 4 && haystack.includes(k.toLowerCase()))
    .filter(k => {
      const key = k.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.length - a.length)
    .slice(0, 10);
}

function autoBoldSeoKeywords(html, keywords) {
  if (!keywords.length) return html;

  // Protect HTML tags and already-bolded markup. Then reserve a token for each
  // keyword replacement so longer/shorter keywords cannot create nested <strong>.
  const protectedParts = [];
  let working = html.replace(/<[^>]+>/g, tag => {
    const token = `@@TAG${protectedParts.length}@@`;
    protectedParts.push(tag);
    return token;
  });

  const boldTokens = [];
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  sorted.forEach(keyword => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped})(?![\\p{L}\\p{N}])`, "giu");
    let count = 0;
    working = working.replace(re, match => {
      if (count >= 1) return match;
      const token = `@@BOLD${boldTokens.length}@@`;
      boldTokens.push(`<strong class="seo-highlight">${match}</strong>`);
      count += 1;
      return token;
    });
  });

  boldTokens.forEach((tag, i) => {
    working = working.replace(`@@BOLD${i}@@`, tag);
  });
  protectedParts.forEach((tag, i) => {
    working = working.replace(`@@TAG${i}@@`, tag);
  });
  return working;
}

function extractHeadings(html) {
  const headings = [];
  html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_, text) => {
    const label = text.replace(/<[^>]+>/g, "").trim();
    if (label) headings.push({ label, id: `section-${slugify(label)}` });
    return _;
  });
  return headings;
}

function addHeadingIds(html) {
  const used = new Set();
  return html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_, text) => {
    const label = text.replace(/<[^>]+>/g, "").trim();
    let base = `section-${slugify(label) || "artikel"}`;
    let id = base;
    let i = 2;
    while (used.has(id)) id = `${base}-${i++}`;
    used.add(id);
    return `<h2 id="${id}">${text}</h2>`;
  });
}

function buildToc(headings) {
  if (headings.length < 3) return "";
  return `<aside class="article-toc" aria-label="Daftar isi artikel">
  <p class="article-toc__label">Di artikel ini</p>
  <ol>${headings.map(h => `<li><a href="#${escapeAttr(h.id)}">${escapeHtml(h.label)}</a></li>`).join("")}</ol>
</aside>`;
}

function buildKreditCta() {
  return `
<div class="berita-cta-inline reveal-on-scroll">
  <p class="berita-cta-inline__label">Simulasi Kredit</p>
  <h3 class="berita-cta-inline__title">Mau tahu estimasi cicilan JAECOO sesuai budget kamu?</h3>
  <p class="berita-cta-inline__desc">Alvan bisa bantu hitung estimasi TDP dan angsuran untuk JAECOO di Palembang — langsung via WhatsApp.</p>
  <div class="berita-cta-inline__actions">
    <a class="berita-cta-inline__btn" href="https://wa.me/6285183145926?text=Halo%20Alvan%2C%20saya%20mau%20simulasi%20kredit%20JAECOO%20Palembang." target="_blank" rel="noopener">Simulasi Kredit via WhatsApp</a>
    <a class="berita-cta-inline__btn berita-cta-inline__btn--ghost" href="/sales-jaecoo-palembang#simulasi-kredit">Lihat Simulasi &rarr;</a>
  </div>
</div>`;
}

function buildRelatedArticles(currentSlug, articles) {
  const related = articles
    .filter(a => a.slug !== currentSlug)
    .sort((a, b) => new Date(b.data.date || 0) - new Date(a.data.date || 0))
    .slice(0, 3);
  if (!related.length) return "";

  return `<section class="related-news reveal-on-scroll" aria-labelledby="related-news-title">
  <div class="related-news__header">
    <p class="related-news__eyebrow">Lanjut membaca</p>
    <h2 id="related-news-title">Berita Terkait</h2>
  </div>
  <div class="related-news__grid">
    ${related.map(a => `
    <a class="related-news__card" href="/berita/${escapeAttr(a.slug)}/">
      <div class="related-news__media"><img src="${escapeAttr(a.data.image || "/assets/images/jaecoo-j5-hero.jpg")}" alt="${escapeAttr(a.data.title || "Berita OMODA JAECOO")}" loading="lazy" decoding="async"></div>
      <div class="related-news__body">
        <span>${escapeHtml(a.data.category || "Info Terbaru")}</span>
        <h3>${escapeHtml(a.data.title || "Berita OMODA JAECOO Palembang")}</h3>
        <small>${escapeHtml(formatDate(a.data.date))}</small>
      </div>
    </a>`).join("")}
  </div>
</section>`;
}

function createArticleHtml(data, body, allArticles) {
  const title = String(data.title || "Berita OMODA JAECOO Palembang").trim();
  const description = normalizeDescription(data.description, getDescription(body));
  const date = isoDate(data.date);
  const modified = isoDate(data.modified || data.date);
  const category = data.category || "Info Terbaru";
  const image = data.image || "/assets/images/jaecoo-j5-hero.jpg";
  const imageUrl = absoluteUrl(image);
  const imageAlt = data.image_alt || `${title} — OMODA JAECOO Palembang`;
  const slug = data.slug ? slugify(data.slug) : slugify(title);
  const articleUrl = `${SITE_URL}/berita/${slug}/`;
  const seoKeywords = buildSeoKeywords(title, body, data);

  let contentHtml = markdownToHtml(body);
  contentHtml = addHeadingIds(contentHtml);
  contentHtml = autoBoldSeoKeywords(contentHtml, seoKeywords);
  const headings = extractHeadings(contentHtml);
  const toc = buildToc(headings);
  const showKreditCta = data.show_kredit_cta === "true" || data.show_kredit_cta === true;
  const kreditCtaHtml = showKreditCta ? buildKreditCta() : "";
  const relatedHtml = buildRelatedArticles(slug, allArticles);
  const wordCount = getPlainText(body).split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 220));

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${articleUrl}#article`,
    "headline": title,
    "description": description,
    "image": [imageUrl],
    "datePublished": date,
    "dateModified": modified,
    "author": { "@type": "Person", "name": "Alvan", "url": `${SITE_URL}/sales-jaecoo-palembang` },
    "publisher": { "@type": "Organization", "name": "OMODA JAECOO Palembang", "url": SITE_URL, "logo": { "@type": "ImageObject", "url": `${SITE_URL}/assets/images/logo-omoda-jaecoo.png` } },
    "articleSection": category,
    "keywords": seoKeywords,
    "inLanguage": "id-ID",
    "mainEntityOfPage": { "@type": "WebPage", "@id": articleUrl }
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": `${SITE_URL}/` },
      { "@type": "ListItem", "position": 2, "name": "Berita", "item": `${SITE_URL}/berita/` },
      { "@type": "ListItem", "position": 3, "name": title, "item": articleUrl }
    ]
  };

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/png" href="/assets/images/favicon.png">
<link rel="apple-touch-icon" href="/assets/images/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@500;600;700;800&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@500;600;700;800&display=swap"></noscript>
<title>${escapeAttr(title)} | OMODA JAECOO Palembang</title>
<meta name="description" content="${escapeAttr(description)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<link rel="canonical" href="${articleUrl}">
<meta property="og:type" content="article">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="OMODA JAECOO Palembang">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:url" content="${articleUrl}">
<meta property="og:image" content="${escapeAttr(imageUrl)}">
<meta property="og:image:alt" content="${escapeAttr(imageAlt)}">
<meta property="article:published_time" content="${date}">
<meta property="article:modified_time" content="${modified}">
<meta property="article:section" content="${escapeAttr(category)}">
<meta property="article:author" content="Alvan">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(title)}">
<meta name="twitter:description" content="${escapeAttr(description)}">
<meta name="twitter:image" content="${escapeAttr(imageUrl)}">
<meta name="twitter:image:alt" content="${escapeAttr(imageAlt)}">
<link rel="preload" href="/assets/css/style.css" as="style">
<link rel="stylesheet" href="/assets/css/style.css">
<link rel="preload" href="/assets/css/berita.css" as="style">
<link rel="stylesheet" href="/assets/css/berita.css">
<link rel="preload" href="/assets/css/berita-article.css" as="style">
<link rel="stylesheet" href="/assets/css/berita-article.css">
<script type="application/ld+json">${JSON.stringify(articleSchema, null, 2)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema, null, 2)}</script>
</head>
<body class="berita-page berita-article-page">
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
      <a class="navbar__link" href="/berita/">BERITA</a>
      <a class="navbar__link navbar__link--cta" href="https://wa.me/6285183145926?text=Halo%20Alvan%2C%20saya%20mau%20tanya%20soal%20OMODA%20JAECOO%20Palembang." target="_blank" rel="noopener">WHATSAPP</a>
    </nav>
    <button aria-controls="navbarMenu" aria-expanded="false" aria-label="Buka menu navigasi" class="navbar__toggle" id="navbarToggle" type="button">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>

<main>
<article class="news-article" itemscope itemtype="https://schema.org/NewsArticle">
  <header class="news-hero">
    <div class="news-hero__inner">
      <nav class="news-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a><span aria-hidden="true">/</span><a href="/berita/">Berita</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(category)}</span>
      </nav>
      <div class="news-kicker"><span>${escapeHtml(category)}</span><i aria-hidden="true"></i><span>OMODA JAECOO Palembang</span></div>
      <h1 class="news-hero__title" itemprop="headline">${escapeHtml(title)}</h1>
      <p class="news-hero__desc" itemprop="description">${escapeHtml(description)}</p>
      <div class="news-byline">
        <time datetime="${escapeAttr(date)}" itemprop="datePublished">${escapeHtml(formatDate(date))}</time>
        <span aria-hidden="true">•</span><span>Alvan</span>
        <span aria-hidden="true">•</span><span>${readingMinutes} menit baca</span>
      </div>
    </div>
    <figure class="news-hero__image">
      <img src="${escapeAttr(image)}" alt="${escapeAttr(imageAlt)}" width="1280" height="720" loading="eager" fetchpriority="high" decoding="async" itemprop="image">
      ${data.image_caption ? `<figcaption>${escapeHtml(data.image_caption)}</figcaption>` : ""}
    </figure>
  </header>

  <div class="news-layout">
    <aside class="news-share" aria-label="Bagikan artikel">
      <span>Bagikan</span>
      <a href="https://wa.me/?text=${encodeURIComponent(title + " " + articleUrl)}" target="_blank" rel="noopener" aria-label="Bagikan ke WhatsApp">WA</a>
    </aside>
    <div class="news-main">
      ${toc}
      <div class="news-content" itemprop="articleBody">
        ${contentHtml}
      </div>
      ${kreditCtaHtml}
      ${relatedHtml}
      <section class="news-final-cta reveal-on-scroll" aria-label="Hubungi Sales Consultant">
        <div>
          <p class="news-final-cta__eyebrow">JAECOO Palembang</p>
          <h2>Butuh harga, simulasi kredit, atau jadwal test drive?</h2>
          <p>Alvan siap bantu cek informasi terbaru JAECOO di Palembang dan mengarahkan kamu ke langkah berikutnya.</p>
        </div>
        <div class="news-final-cta__actions">
          <a href="https://wa.me/6285183145926?text=Halo%20Alvan%2C%20saya%20baca%20artikel%20di%20website%20dan%20mau%20tanya%20soal%20JAECOO%20Palembang." target="_blank" rel="noopener">Chat WhatsApp Alvan</a>
          <a class="secondary" href="/sales-jaecoo-palembang">Profil Sales Consultant &rarr;</a>
        </div>
      </section>
    </div>
  </div>
</article>
</main>

<footer class="footer-v2">
  <div class="footer-v2__bottom"><p>&copy; 2026 OMODA JAECOO Palembang &middot; All Rights Reserved</p></div>
</footer>

<a class="wa-float" aria-label="Chat WhatsApp Alvan" href="https://wa.me/6285183145926?text=Halo%20Alvan%2C%20saya%20mau%20tanya%20soal%20OMODA%20JAECOO%20Palembang." target="_blank" rel="noopener"><span>WhatsApp Alvan</span></a>
<script src="/assets/js/main.js"></script>
<script>
(function(){
  var items=document.querySelectorAll('.reveal-on-scroll,.news-content p,.news-content h2,.news-content h3,.news-content li,.news-content blockquote,.news-content figure');
  if(!('IntersectionObserver' in window)){items.forEach(function(el){el.classList.add('is-visible');});return;}
  var io=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('is-visible');io.unobserve(entry.target);}})},{threshold:.1,rootMargin:'0px 0px -45px 0px'});
  items.forEach(function(el){el.classList.add('reveal-on-scroll');io.observe(el);});
})();
</script>
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
            <div class="berita-card__media"><img src="${escapeAttr(image)}" alt="${escapeAttr(title)}" loading="lazy" decoding="async" width="600" height="400" itemprop="image"/></div>
          </a>
          <div class="berita-card__body">
            <div class="berita-card__meta"><span class="berita-cat ${categoryClass(category)}">${escapeHtml(category)}</span><time class="berita-date" datetime="${escapeAttr(date)}" itemprop="datePublished">${escapeHtml(formatDate(date))}</time></div>
            <h3 class="berita-card__title" itemprop="headline"><a href="${href}">${escapeHtml(title)}</a></h3>
            <p class="berita-card__excerpt" itemprop="description">${escapeHtml(description)}</p>
            <div class="berita-card__footer"><a class="berita-read-more berita-read-more--sm" href="${href}">Baca &rarr;</a></div>
          </div>
        </article>`;
}

function updateIndexHtml(articles) {
  if (!fs.existsSync(INDEX_FILE)) { console.warn("berita/index.html tidak ditemukan."); return; }
  let html = fs.readFileSync(INDEX_FILE, "utf8");
  if (!html.includes(INJECT_START)) {
    html = html.replace('<div class="berita-grid" id="beritaGrid">', `<div class="berita-grid" id="beritaGrid">\n\n        ${INJECT_START}\n        ${INJECT_END}`);
  }
  const sorted = [...articles].sort((a, b) => new Date(b.data.date || 0) - new Date(a.data.date || 0));
  const cardsHtml = sorted.map(a => createCardHtml(a.data, a.slug)).join("\n");
  const startIdx = html.indexOf(INJECT_START);
  const endIdx = html.indexOf(INJECT_END);
  if (startIdx === -1 || endIdx === -1) { console.warn("Marker inject tidak ditemukan."); return; }
  html = html.slice(0, startIdx) + INJECT_START + "\n" + cardsHtml + "\n        " + html.slice(endIdx);
  fs.writeFileSync(INDEX_FILE, html, "utf8");
  console.log(`Updated berita/index.html dengan ${sorted.length} artikel.`);
}

function updateSitemap(articles) {
  if (!fs.existsSync(SITEMAP_FILE)) { console.warn("sitemap.xml tidak ditemukan."); return; }
  let xml = fs.readFileSync(SITEMAP_FILE, "utf8");
  if (!xml.includes(SITEMAP_START)) {
    xml = xml.replace("  <!-- Berita -->", `  <!-- Berita -->\n  ${SITEMAP_START}\n  ${SITEMAP_END}`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...articles].sort((a, b) => new Date(b.data.date || 0) - new Date(a.data.date || 0));
  const urlEntries = sorted.map(a => {
    const d = a.data.date ? new Date(a.data.date) : new Date();
    const date = Number.isNaN(d.getTime()) ? today : d.toISOString().slice(0, 10);
    return `  <url>\n    <loc>${SITE_URL}/berita/${a.slug}/</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
  }).join("\n");
  const startIdx = xml.indexOf(SITEMAP_START);
  const endIdx = xml.indexOf(SITEMAP_END);
  if (startIdx === -1 || endIdx === -1) { console.warn("Marker sitemap tidak ditemukan."); return; }
  xml = xml.slice(0, startIdx) + SITEMAP_START + "\n" + (urlEntries ? urlEntries + "\n  " : "  ") + xml.slice(endIdx);
  fs.writeFileSync(SITEMAP_FILE, xml, "utf8");
  console.log(`Updated sitemap.xml dengan ${sorted.length} artikel.`);
}

function cleanDeletedArticles(activeSlugs) {
  const entries = fs.readdirSync(NEWS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const htmlFile = path.join(NEWS_DIR, entry.name, "index.html");
    if (!fs.existsSync(htmlFile)) continue;
    if (!activeSlugs.has(entry.name)) {
      fs.rmSync(path.join(NEWS_DIR, entry.name), { recursive: true, force: true });
      console.log(`Deleted berita/${entry.name}/`);
    }
  }
}

function generate() {
  if (!fs.existsSync(NEWS_DIR)) { console.log("Folder berita tidak ditemukan."); return; }
  const files = fs.readdirSync(NEWS_DIR).filter(f => f.toLowerCase().endsWith(".md"));
  const articles = [];
  const activeSlugs = new Set();

  for (const file of files) {
    const source = fs.readFileSync(path.join(NEWS_DIR, file), "utf8");
    const { data, body } = parseFrontMatter(source);
    if (!data.title) { console.warn(`Lewati ${file}: tidak ada title.`); continue; }
    const slug = data.slug ? slugify(data.slug) : slugify(data.title);
    activeSlugs.add(slug);
    articles.push({ data, body, slug });
  }

  for (const article of articles) {
    const outputDir = path.join(NEWS_DIR, article.slug);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "index.html"), createArticleHtml(article.data, article.body, articles), "utf8");
    console.log(`Generated berita/${article.slug}/index.html`);
  }

  cleanDeletedArticles(activeSlugs);
  updateIndexHtml(articles);
  updateSitemap(articles);
  console.log(files.length ? "Semua berita berhasil diproses." : "Belum ada file berita Markdown.");
}

generate();
