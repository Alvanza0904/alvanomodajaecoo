"use strict";
const fs   = require("fs");
const path = require("path");

const ROOT         = process.cwd();
const PROMO_DIR    = path.join(ROOT, "promo");
const PROMO_INDEX  = path.join(ROOT, "promo", "index.html");
const BERITA_INDEX = path.join(ROOT, "berita", "index.html");
const HOME_FILE    = path.join(ROOT, "index.html");
const SITEMAP_FILE = path.join(ROOT, "sitemap.xml");

const SITE_URL = "https://omodajaecoopalembang.web.id";
const WA_NUMBER = "6285183145926";

// Markers — sama pola dengan generate-news.js
const PROMO_INDEX_START  = "<!-- CMS:PROMO:START -->";
const PROMO_INDEX_END    = "<!-- CMS:PROMO:END -->";
const HOME_PROMO_START   = "<!-- CMS:HOMEPROMO:START -->";
const HOME_PROMO_END     = "<!-- CMS:HOMEPROMO:END -->";
const BERITA_PROMO_START = "<!-- CMS:BERITAPROMO:START -->";
const BERITA_PROMO_END   = "<!-- CMS:BERITAPROMO:END -->";
const SITEMAP_START      = "<!-- CMS:PROMO:SITEMAP:START -->";
const SITEMAP_END        = "<!-- CMS:PROMO:SITEMAP:END -->";

// ─── Helpers ─────────────────────────────────────────────────

function slugify(text) {
  return String(text || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function escapeAttr(v) { return escapeHtml(v).replace(/\n/g, " "); }

function parseFrontMatter(src) {
  const m = src.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src.trim() };
  const data = {};
  let curKey = null;
  let inQuote = false;
  let quoteChar = null;

  m[1].split(/\r?\n/).forEach(raw => {
    const line = raw.replace(/\t/g, "  ");

    // Sedang di dalam multiline quoted string
    if (inQuote && curKey) {
      if (line.trimEnd().endsWith(quoteChar)) {
        const part = line.trimEnd().slice(0, -1);
        data[curKey] = data[curKey] + "\n" + part;
        inQuote = false;
        quoteChar = null;
      } else {
        data[curKey] = data[curKey] + "\n" + line;
      }
      return;
    }

    // Indented continuation (unquoted multiline)
    if ((line.startsWith(" ") || line.startsWith("\t")) && curKey) {
      const cont = line.trim();
      if (cont) data[curKey] = `${data[curKey]} ${cont}`.trim();
      return;
    }

    const sep = line.indexOf(":");
    if (sep === -1) return;
    const key = line.slice(0, sep).trim();
    if (!key) return;
    let val = line.slice(sep + 1).trim();

    if (val.length >= 1) {
      const q = val[0];
      if (q === '"' || q === "'") {
        if (val === q + q) { data[key] = ""; curKey = key; return; }
        if (val.length >= 2 && val.endsWith(q)) {
          data[key] = val.slice(1, -1); curKey = key; return;
        }
        // Multiline quoted — opening tidak menutup di baris yang sama
        data[key] = val.slice(1);
        curKey = key; inQuote = true; quoteChar = q;
        return;
      }
    }
    data[key] = val;
    curKey = key;
  });

  return { data, body: m[2].trim() };
}

function formatDate(ds) {
  if (!ds) return "";
  const d = new Date(ds);
  if (isNaN(d)) return ds;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Jakarta"
  }).format(d);
}

function isoDate(ds) {
  const d = new Date(ds || Date.now());
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
}

function absoluteUrl(image) {
  if (!image) return `${SITE_URL}/assets/images/jaecoo-j5-hero.jpg`;
  if (/^https?:\/\//i.test(image)) return image;
  return `${SITE_URL}${image.startsWith("/") ? image : `/${image}`}`;
}

function boolVal(v) {
  return v === true || v === "true";
}

// ─── Status promo ────────────────────────────────────────────

function promoStatus(data) {
  const now  = new Date();
  const tz   = "Asia/Jakarta";
  const start = data.start_date ? new Date(data.start_date) : null;
  const end   = data.end_date   ? new Date(data.end_date)   : null;

  if (boolVal(data.published) === false && data.published !== undefined &&
      data.published !== "" ) return "draft";

  if (start && now < start) return "belum-aktif";
  if (end && now > end)     return "berakhir";
  return "aktif";
}

function isActivePromo(data) {
  return promoStatus(data) === "aktif";
}

// ─── WhatsApp message ─────────────────────────────────────────

function buildWaMessage(data) {
  if (data.whatsapp_message && data.whatsapp_message.trim()) {
    return data.whatsapp_message.trim();
  }
  const model      = data.model       || "JAECOO";
  const promoName  = data.promo_name  || "";
  const intro      = promoName
    ? `Hai Kak Alvan, saya tertarik dengan ${promoName} untuk ${model}.`
    : `Hai Kak Alvan, saya tertarik dengan promo ${model}.`;
  return `${intro} Saya mendapatkan informasinya dari website OMODA JAECOO Palembang. Bisa dibantu info promo dan simulasinya?`;
}

function buildWaUrl(data) {
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(buildWaMessage(data))}`;
}

// ─── Navbar HTML (sama dengan generate-news.js) ──────────────

function navbarHtml() {
  return `<header class="navbar" id="navbar">
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
      <a class="navbar__link navbar__link--cta" href="https://wa.me/${WA_NUMBER}?text=Halo%20Alvan%2C%20saya%20mau%20tanya%20soal%20OMODA%20JAECOO%20Palembang." target="_blank" rel="noopener">WHATSAPP</a>
    </nav>
    <button aria-controls="navbarMenu" aria-expanded="false" aria-label="Buka menu navigasi" class="navbar__toggle" id="navbarToggle" type="button">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>`;
}

function footerHtml() {
  return `<footer class="footer-v2">
  <div class="footer-v2__bottom"><p>&copy; 2026 OMODA JAECOO Palembang &middot; All Rights Reserved</p></div>
</footer>`;
}

function waFloatHtml(data) {
  return `<a class="wa-float" aria-label="Chat WhatsApp Alvan" href="${escapeAttr(buildWaUrl(data))}" target="_blank" rel="noopener"><span>WhatsApp Alvan</span></a>`;
}

// ─── Detail promo HTML helper ─────────────────────────────────

function buildOfferSection(data) {
  const parts = [];

  const hasPrice      = data.price       && data.price.trim();
  const hasPromoPrice = data.promo_price && data.promo_price.trim();
  const hasDp         = data.dp          && data.dp.trim();
  const hasInstall    = data.installment && data.installment.trim();
  const hasTenor      = data.tenor       && data.tenor.trim();

  if (!hasPrice && !hasPromoPrice && !hasDp && !hasInstall && !hasTenor) return "";

  parts.push(`<div class="promo-offer">`);
  parts.push(`<p class="promo-section-label">Detail Penawaran</p>`);

  if (hasPrice || hasPromoPrice) {
    parts.push(`<div class="promo-offer__price-row">`);
    if (hasPrice && hasPromoPrice) {
      parts.push(`<span class="promo-offer__original-price">${escapeHtml(data.price)}</span>`);
      parts.push(`<span class="promo-offer__promo-price">${escapeHtml(data.promo_price)}</span>`);
      parts.push(`<span class="promo-offer__price-label">Harga Promo</span>`);
    } else {
      const price = hasPromoPrice ? data.promo_price : data.price;
      parts.push(`<span class="promo-offer__promo-price">${escapeHtml(price)}</span>`);
    }
    parts.push(`</div>`);
  }

  const gridItems = [];
  if (hasDp)      gridItems.push({ label: "DP Mulai", value: data.dp });
  if (hasInstall) gridItems.push({ label: "Cicilan", value: data.installment });
  if (hasTenor)   gridItems.push({ label: "Tenor", value: data.tenor });

  if (gridItems.length) {
    parts.push(`<div class="promo-details-grid">`);
    gridItems.forEach(item => {
      parts.push(`<div class="promo-detail-item">
        <span class="promo-detail-item__label">${escapeHtml(item.label)}</span>
        <span class="promo-detail-item__value">${escapeHtml(item.value)}</span>
      </div>`);
    });
    parts.push(`</div>`);
  }

  parts.push(`</div>`);
  return parts.join("\n");
}

function buildBenefitSection(data) {
  const parts = [];
  const hasBenefit = data.benefit && data.benefit.trim();
  const hasBonus   = data.bonus   && data.bonus.trim();
  if (!hasBenefit && !hasBonus) return "";

  parts.push(`<div class="promo-benefit">`);

  if (hasBenefit) {
    parts.push(`<p class="promo-section-label">Keuntungan & Benefit</p>`);
    parts.push(`<h2 class="promo-benefit__title" style="display:none">Benefit</h2>`);
    // Render sebagai list jika ada newline, otherwise paragraph
    const lines = data.benefit.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      parts.push(`<ul class="promo-benefit__content-list">`);
      lines.forEach(l => parts.push(`<li>${escapeHtml(l)}</li>`));
      parts.push(`</ul>`);
    } else {
      parts.push(`<p class="promo-benefit__content">${escapeHtml(data.benefit)}</p>`);
    }
  }

  if (hasBonus) {
    parts.push(`<p class="promo-section-label" style="margin-top:20px">Bonus</p>`);
    const lines = data.bonus.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      parts.push(`<ul class="promo-benefit__content-list">`);
      lines.forEach(l => parts.push(`<li>${escapeHtml(l)}</li>`));
      parts.push(`</ul>`);
    } else {
      parts.push(`<p class="promo-benefit__content">${escapeHtml(data.bonus)}</p>`);
    }
  }

  parts.push(`</div>`);
  return parts.join("\n");
}

function buildTermsSection(data) {
  if (!data.terms || !data.terms.trim()) return "";
  return `<div class="promo-terms">
  <p class="promo-terms__title">Syarat &amp; Ketentuan</p>
  <div class="promo-terms__content">${escapeHtml(data.terms)}</div>
</div>`;
}

function buildRelatedPromo(currentSlug, allPromos) {
  // Tampilkan promo lain (max 3), prioritas yang masih aktif
  const related = allPromos
    .filter(p => p.slug !== currentSlug && boolVal(p.data.published) !== false)
    .sort((a, b) => {
      const aActive = isActivePromo(a.data) ? 1 : 0;
      const bActive = isActivePromo(b.data) ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;
      return new Date(b.data.start_date || 0) - new Date(a.data.start_date || 0);
    })
    .slice(0, 3);

  if (!related.length) return "";

  return `<section class="promo-related reveal-on-scroll">
  <div class="promo-related__header">
    <p class="promo-related__eyebrow">Promo Lainnya</p>
    <h2 class="promo-related__title">Promo OMODA JAECOO Palembang</h2>
  </div>
  <div class="promo-related__grid">
    ${related.map(p => `
    <a class="promo-related__card" href="/promo/${escapeAttr(p.slug)}/">
      <div class="promo-related__media">
        <img src="${escapeAttr(p.data.featured_image || "/assets/images/jaecoo-j5-hero.jpg")}" alt="${escapeAttr(p.data.title || "Promo OMODA JAECOO")}" loading="lazy" decoding="async">
      </div>
      <div class="promo-related__body">
        <span>${escapeHtml(p.data.model || "JAECOO")}</span>
        <h3>${escapeHtml(p.data.title || "Promo OMODA JAECOO Palembang")}</h3>
        <small>${p.data.end_date ? `Berlaku s/d ${escapeHtml(formatDate(p.data.end_date))}` : "Hubungi kami untuk info"}</small>
      </div>
    </a>`).join("")}
  </div>
</section>`;
}

// ─── Build halaman detail promo ───────────────────────────────

function createPromoHtml(data, allPromos) {
  const title       = String(data.title || "Promo OMODA JAECOO Palembang").trim();
  const slug        = data.slug ? slugify(data.slug) : slugify(title);
  const promoUrl    = `${SITE_URL}/promo/${slug}/`;
  const description = String(data.excerpt || data.description || `Promo ${data.model || "OMODA JAECOO"} terbaik di Palembang. Dapatkan penawaran spesial dari Sales Consultant OMODA JAECOO Palembang.`).trim().slice(0, 160);
  const image       = data.featured_image || "/assets/images/jaecoo-j5-hero.jpg";
  const imageUrl    = absoluteUrl(image);
  const imageAlt    = data.image_alt || `${title} — OMODA JAECOO Palembang`;
  const seoTitle    = data.seo_title    || `${title} | OMODA JAECOO Palembang`;
  const seoDesc     = data.seo_description || description;
  const model       = data.model || "";
  const promoName   = data.promo_name || title;
  const status      = promoStatus(data);
  const isExpired   = status === "berakhir";
  const waUrl       = buildWaUrl(data);
  const pubDate     = isoDate(data.start_date || data.date);
  const modDate     = isoDate(data.end_date || data.start_date || data.date);

  const badgeText  = isExpired ? "PROMO BERAKHIR" : "PROMO AKTIF";
  const badgeClass = isExpired ? "promo-badge promo-badge--expired" : "promo-badge";

  const periodText = (() => {
    const s = data.start_date ? formatDate(data.start_date) : null;
    const e = data.end_date   ? formatDate(data.end_date)   : null;
    if (s && e) return `${s} – ${e}`;
    if (e)      return `Berlaku sampai ${e}`;
    if (s)      return `Mulai ${s}`;
    return "";
  })();

  const expiredNotice = isExpired ? `
<div class="promo-expired-notice reveal-on-scroll">
  <span class="promo-expired-notice__icon">ℹ️</span>
  <span>Promo ini sudah berakhir. Halaman ini dipertahankan untuk referensi. Hubungi Alvan untuk info promo terbaru.</span>
</div>` : "";

  // Structured data — SpecialAnnouncement atau Product
  const promoSchema = {
    "@context": "https://schema.org",
    "@type": "SpecialAnnouncement",
    "@id": `${promoUrl}#promo`,
    "name": title,
    "text": description,
    "datePosted": pubDate,
    "expires": data.end_date ? isoDate(data.end_date) : undefined,
    "url": promoUrl,
    "category": "https://www.wikidata.org/wiki/Q178687",
    "announcementLocation": {
      "@type": "AutomotiveBusiness",
      "name": "OMODA JAECOO Palembang",
      "url": SITE_URL
    },
    "image": imageUrl,
    "inLanguage": "id-ID"
  };
  // hapus field undefined
  Object.keys(promoSchema).forEach(k => promoSchema[k] === undefined && delete promoSchema[k]);

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home",  "item": `${SITE_URL}/` },
      { "@type": "ListItem", "position": 2, "name": "Promo", "item": `${SITE_URL}/promo/` },
      { "@type": "ListItem", "position": 3, "name": title,   "item": promoUrl }
    ]
  };

  const offerHtml   = buildOfferSection(data);
  const benefitHtml = buildBenefitSection(data);
  const termsHtml   = buildTermsSection(data);
  const relatedHtml = buildRelatedPromo(slug, allPromos);

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
<title>${escapeAttr(seoTitle)}</title>
<meta name="description" content="${escapeAttr(seoDesc)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<link rel="canonical" href="${promoUrl}">
<meta property="og:type" content="article">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="OMODA JAECOO Palembang">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(seoDesc)}">
<meta property="og:url" content="${promoUrl}">
<meta property="og:image" content="${escapeAttr(imageUrl)}">
<meta property="og:image:alt" content="${escapeAttr(imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(title)}">
<meta name="twitter:description" content="${escapeAttr(seoDesc)}">
<meta name="twitter:image" content="${escapeAttr(imageUrl)}">
<meta name="twitter:image:alt" content="${escapeAttr(imageAlt)}">
<link rel="preload" href="/assets/css/style.css" as="style">
<link rel="stylesheet" href="/assets/css/style.css">
<link rel="preload" href="/assets/css/promo.css" as="style">
<link rel="stylesheet" href="/assets/css/promo.css">
<script type="application/ld+json">${JSON.stringify(promoSchema, null, 2)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema, null, 2)}</script>
</head>
<body class="promo-page">
${navbarHtml()}

<main>
  <article class="promo-article">

    <header class="promo-hero">
      <div class="promo-hero__inner">
        <nav class="promo-breadcrumb" aria-label="Breadcrumb">
          <a href="/">Home</a><span>/</span>
          <a href="/promo/">Promo</a><span>/</span>
          <span aria-current="page">${escapeHtml(model || "Promo")}</span>
        </nav>
        <div class="${escapeAttr(badgeClass)}">${escapeHtml(badgeText)}</div>
        <h1 class="promo-hero__title">${escapeHtml(title)}</h1>
        <div class="promo-hero__meta">
          ${model ? `<span class="promo-hero__meta-item">📌 ${escapeHtml(model)}</span>` : ""}
          ${periodText ? `<span class="promo-hero__meta-item">📅 ${escapeHtml(periodText)}</span>` : ""}
        </div>
      </div>
      <figure class="promo-hero__image">
        <img src="${escapeAttr(image)}" alt="${escapeAttr(imageAlt)}" width="1280" height="720" loading="eager" fetchpriority="high" decoding="async">
      </figure>
    </header>

    <div class="promo-layout">
      ${expiredNotice}
      ${offerHtml}
      ${benefitHtml}
      ${termsHtml}

      ${!isExpired ? `
      <div class="promo-cta reveal-on-scroll">
        <p class="promo-cta__eyebrow">Tertarik dengan promo ini?</p>
        <h2 class="promo-cta__title">Hubungi Alvan untuk Info &amp; Simulasi Kredit</h2>
        <p class="promo-cta__desc">Dapatkan info lengkap, simulasi kredit, dan jadwal test drive ${escapeHtml(model || "JAECOO")} di Palembang.</p>
        <a class="promo-cta__btn" href="${escapeAttr(waUrl)}" target="_blank" rel="noopener">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
          Chat WhatsApp Alvan
        </a>
      </div>` : `
      <div class="promo-cta reveal-on-scroll" style="background:linear-gradient(135deg,#1a1a1a 0%,#2a2a2a 100%)">
        <p class="promo-cta__eyebrow">Promo sudah berakhir</p>
        <h2 class="promo-cta__title">Tanya Promo Terbaru ke Alvan</h2>
        <p class="promo-cta__desc">Mungkin ada penawaran spesial lain yang cocok untuk kamu. Hubungi Alvan langsung via WhatsApp.</p>
        <a class="promo-cta__btn" href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent("Hai Kak Alvan, saya lihat promo " + (model || "JAECOO") + " di website dan mau tanya promo terbaru. Bisa dibantu?")}" target="_blank" rel="noopener">
          Tanya Promo Terbaru
        </a>
      </div>`}

      ${relatedHtml}

      <section class="promo-final-cta reveal-on-scroll" aria-label="Hubungi Sales Consultant">
        <div>
          <p class="promo-final-cta__eyebrow">JAECOO Palembang</p>
          <h2>Butuh harga, simulasi kredit, atau jadwal test drive?</h2>
          <p>Alvan siap bantu cek informasi terbaru ${escapeHtml(model || "JAECOO")} di Palembang.</p>
        </div>
        <div class="promo-final-cta__actions">
          <a href="${escapeAttr(waUrl)}" target="_blank" rel="noopener">Chat WhatsApp Alvan</a>
          <a class="secondary" href="/sales-jaecoo-palembang">Profil Sales Consultant &rarr;</a>
        </div>
      </section>
    </div>

  </article>
</main>

${footerHtml()}
${waFloatHtml(data)}
<script src="/assets/js/main.js"></script>
<script>
(function(){
  var items=document.querySelectorAll('.reveal-on-scroll');
  if(!('IntersectionObserver' in window)){items.forEach(function(el){el.classList.add('is-visible');});return;}
  var io=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('is-visible');io.unobserve(entry.target);}});},{threshold:.1,rootMargin:'0px 0px -45px 0px'});
  items.forEach(function(el){el.classList.add('reveal-on-scroll');io.observe(el);});
})();
</script>
</body>
</html>`;
}

// ─── Build halaman listing promo (/promo/index.html) ──────────

function buildPromoCard(promo) {
  const { data, slug } = promo;
  const status    = promoStatus(data);
  const isExpired = status === "berakhir";
  const image     = data.featured_image || "/assets/images/jaecoo-j5-hero.jpg";
  const title     = data.title || "Promo OMODA JAECOO Palembang";
  const excerpt   = data.excerpt || "";
  const model     = data.model || "";
  const badgeText  = isExpired ? "BERAKHIR" : "AKTIF";
  const badgeClass = isExpired
    ? "promo-list-card__badge promo-list-card__badge--expired"
    : "promo-list-card__badge";
  const periodLine = (() => {
    if (data.end_date) return `Berlaku s/d ${formatDate(data.end_date)}`;
    if (data.start_date) return `Mulai ${formatDate(data.start_date)}`;
    return "";
  })();

  return `
<a class="promo-list-card" href="/promo/${escapeAttr(slug)}/" itemscope itemtype="https://schema.org/SpecialAnnouncement">
  <div class="promo-list-card__media">
    <img src="${escapeAttr(image)}" alt="${escapeAttr(title)}" loading="lazy" decoding="async" width="600" height="338" itemprop="image">
  </div>
  <div class="promo-list-card__body">
    <span class="${escapeAttr(badgeClass)}">${escapeHtml(badgeText)}</span>
    ${model ? `<p class="promo-list-card__model">${escapeHtml(model)}</p>` : ""}
    <h3 class="promo-list-card__title" itemprop="name">${escapeHtml(title)}</h3>
    ${excerpt ? `<p class="promo-list-card__excerpt">${escapeHtml(excerpt)}</p>` : ""}
    ${periodLine ? `<p class="promo-list-card__period">📅 ${escapeHtml(periodLine)}</p>` : ""}
  </div>
</a>`;
}

function createPromoIndexHtml(promos) {
  // Urutkan: aktif dulu, baru berakhir; dalam tiap grup terbaru dulu
  const sorted = [...promos]
    .filter(p => boolVal(p.data.published) !== false)
    .sort((a, b) => {
      const aA = isActivePromo(a.data) ? 1 : 0;
      const bA = isActivePromo(b.data) ? 1 : 0;
      if (bA !== aA) return bA - aA;
      return new Date(b.data.start_date || 0) - new Date(a.data.start_date || 0);
    });

  const cardsHtml = sorted.map(buildPromoCard).join("\n");
  const emptyHtml = sorted.length ? "" : `
<div class="promo-list-empty">
  <h2>Belum ada promo saat ini</h2>
  <p>Pantau terus halaman ini atau hubungi Alvan untuk info penawaran terbaru.</p>
</div>`;

  const indexUrl = `${SITE_URL}/promo/`;

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${indexUrl}#page`,
    "name": "Promo OMODA JAECOO Palembang",
    "description": "Daftar promo terbaru OMODA JAECOO Palembang — penawaran harga spesial, bonus, dan simulasi kredit.",
    "url": indexUrl,
    "publisher": {
      "@type": "AutomotiveBusiness",
      "name": "OMODA JAECOO Palembang",
      "url": SITE_URL
    },
    "inLanguage": "id-ID"
  };

  const breadSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home",  "item": `${SITE_URL}/` },
      { "@type": "ListItem", "position": 2, "name": "Promo", "item": indexUrl }
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
<title>Promo OMODA JAECOO Palembang | Penawaran Terbaru</title>
<meta name="description" content="Promo terbaru OMODA JAECOO Palembang — penawaran harga spesial, bonus aksesori, DP ringan, dan simulasi kredit untuk JAECOO J5, J7, J8, dan OMODA O4.">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<link rel="canonical" href="${indexUrl}">
<meta property="og:type" content="website">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="OMODA JAECOO Palembang">
<meta property="og:title" content="Promo OMODA JAECOO Palembang | Penawaran Terbaru">
<meta property="og:description" content="Promo terbaru OMODA JAECOO Palembang — penawaran harga spesial, bonus, DP ringan, dan simulasi kredit.">
<meta property="og:url" content="${indexUrl}">
<meta property="og:image" content="${SITE_URL}/assets/images/jaecoo-j5-hero.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Promo OMODA JAECOO Palembang">
<meta name="twitter:description" content="Penawaran harga spesial, bonus, dan simulasi kredit JAECOO & OMODA di Palembang.">
<meta name="twitter:image" content="${SITE_URL}/assets/images/jaecoo-j5-hero.jpg">
<link rel="preload" href="/assets/css/style.css" as="style">
<link rel="stylesheet" href="/assets/css/style.css">
<link rel="preload" href="/assets/css/promo.css" as="style">
<link rel="stylesheet" href="/assets/css/promo.css">
<script type="application/ld+json">${JSON.stringify(listSchema, null, 2)}</script>
<script type="application/ld+json">${JSON.stringify(breadSchema, null, 2)}</script>
</head>
<body class="promo-list-page">
${navbarHtml()}

<main>
  <section class="promo-list-hero">
    <div class="wrap">
      <p class="promo-list-hero__kicker">Special Offer</p>
      <h1 class="promo-list-hero__title">Promo OMODA JAECOO Palembang</h1>
      <p class="promo-list-hero__desc">Penawaran harga spesial, bonus aksesori, DP ringan, dan simulasi kredit untuk JAECOO J5, J7, J8, dan OMODA O4 di Palembang.</p>
    </div>
  </section>

  <section class="promo-list-section">
    <div class="wrap">
      <div class="promo-list-grid">
        ${PROMO_INDEX_START}
        ${cardsHtml}
        ${emptyHtml}
        ${PROMO_INDEX_END}
      </div>
    </div>
  </section>

  <section class="section sales-cta" style="padding:64px 0;" aria-label="Hubungi Alvan">
    <div class="wrap" style="text-align:center">
      <div class="kicker">Sales Consultant</div>
      <h2 style="font-size:clamp(1.5rem,3.5vw,2.2rem);margin:0 0 14px">Mau tanya langsung tentang promo?</h2>
      <p style="color:var(--color-text-muted);margin:0 0 28px;max-width:44ch;margin-left:auto;margin-right:auto">Alvan siap bantu info promo terbaru, simulasi kredit, dan jadwal test drive JAECOO & OMODA di Palembang.</p>
      <a class="btn primary" href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent("Halo Kak Alvan, saya mau tanya soal promo OMODA JAECOO Palembang.")}" target="_blank" rel="noopener">Chat WhatsApp Alvan</a>
    </div>
  </section>
</main>

${footerHtml()}
<a class="wa-float" aria-label="Chat WhatsApp Alvan" href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent("Halo Kak Alvan, saya mau tanya soal promo OMODA JAECOO Palembang.")}" target="_blank" rel="noopener"><span>WhatsApp Alvan</span></a>
<script src="/assets/js/main.js"></script>
</body>
</html>`;
}

// ─── Update homepage — section Promo ─────────────────────────

function updateHomepagePromo(promos) {
  if (!fs.existsSync(HOME_FILE)) { console.warn("index.html tidak ditemukan."); return; }

  // Promo yang aktif dan featured
  const featured = promos
    .filter(p => boolVal(p.data.published) !== false)
    .filter(p => isActivePromo(p.data))
    .filter(p => boolVal(p.data.featured))
    .sort((a, b) => new Date(b.data.start_date || 0) - new Date(a.data.start_date || 0));

  let html = fs.readFileSync(HOME_FILE, "utf8");

  // Jika tidak ada marker di homepage, sisipkan sebelum section berita
  if (!html.includes(HOME_PROMO_START)) {
    // Sisipkan marker sebelum section home-berita
    html = html.replace(
      '<section class="section home-berita"',
      `<!-- CMS:HOMEPROMO:SECTION:START -->\n    ${HOME_PROMO_START}\n    ${HOME_PROMO_END}\n    <!-- CMS:HOMEPROMO:SECTION:END -->\n\n    <section class="section home-berita"`
    );
  }

  const startIdx = html.indexOf(HOME_PROMO_START);
  const endIdx   = html.indexOf(HOME_PROMO_END);
  if (startIdx === -1 || endIdx === -1) {
    console.warn("Marker CMS:HOMEPROMO tidak ditemukan di index.html.");
    return;
  }

  let promoBlock = "";
  if (featured.length > 0) {
    const cards = featured.slice(0, 3).map(p => {
      const d = p.data;
      const image = d.featured_image || "/assets/images/jaecoo-j5-hero.jpg";
      const periodLine = d.end_date ? `Berlaku s/d ${formatDate(d.end_date)}` : "";
      return `
        <a class="home-promo__card" href="/promo/${escapeAttr(p.slug)}/">
          <div class="home-promo__card-media">
            <img src="${escapeAttr(image)}" alt="${escapeAttr(d.title || "Promo OMODA JAECOO")}" loading="lazy" decoding="async" width="600" height="338">
          </div>
          <div class="home-promo__card-body">
            <span class="home-promo__card-badge">PROMO</span>
            ${d.model ? `<p class="home-promo__card-model">${escapeHtml(d.model)}</p>` : ""}
            <h3 class="home-promo__card-title">${escapeHtml(d.title || "Promo OMODA JAECOO")}</h3>
            ${periodLine ? `<p class="home-promo__card-period">📅 ${escapeHtml(periodLine)}</p>` : ""}
            <span class="home-promo__card-cta">Lihat Detail &rarr;</span>
          </div>
        </a>`;
    }).join("");

    promoBlock = `
    <section class="section home-promo" id="promo-aktif" aria-label="Promo Aktif">
      <div class="home-promo__header-wrap">
        <div class="home-promo__header">
          <div>
            <p class="home-promo__eyebrow">Special Offer</p>
            <h2 class="home-promo__title">Promo Aktif</h2>
          </div>
          <a class="home-promo__all-link" href="/promo/">Lihat Semua &rarr;</a>
        </div>
      </div>
      <div class="home-promo__grid">
        ${cards}
      </div>
    </section>`;
  }
  // Kalau tidak ada promo aktif featured — section tidak tampil (promoBlock = "")

  html = html.slice(0, startIdx) + HOME_PROMO_START + "\n" + promoBlock + "\n    " + html.slice(endIdx);
  fs.writeFileSync(HOME_FILE, html, "utf8");
  console.log(`Updated index.html — ${featured.length} promo featured aktif.`);
}

// ─── Update berita/index.html — tambah filter & cards promo ──

function buildPromoBeritaCard(promo) {
  const { data, slug } = promo;
  const status    = promoStatus(data);
  const isExpired = status === "berakhir";
  const image     = data.featured_image || "/assets/images/jaecoo-j5-hero.jpg";
  const title     = data.title || "Promo OMODA JAECOO Palembang";
  const excerpt   = data.excerpt || `Promo ${data.model || "OMODA JAECOO"} di Palembang.`;
  const href      = `/promo/${slug}/`;
  const badge     = isExpired ? "Promo Berakhir" : "Promo";

  return `
        <article class="berita-card" data-category="promo" itemscope itemtype="https://schema.org/SpecialAnnouncement">
          <a class="berita-card__media-link" href="${href}" tabindex="-1" aria-hidden="true">
            <div class="berita-card__media"><img src="${escapeAttr(image)}" alt="${escapeAttr(title)}" loading="lazy" decoding="async" width="600" height="400" itemprop="image"/></div>
          </a>
          <div class="berita-card__body">
            <div class="berita-card__meta"><span class="berita-cat berita-cat--promo">${escapeHtml(badge)}</span>${data.end_date ? `<time class="berita-date" datetime="${escapeAttr(isoDate(data.end_date))}">${escapeHtml(formatDate(data.end_date))}</time>` : ""}</div>
            <h3 class="berita-card__title" itemprop="name"><a href="${href}">${escapeHtml(title)}</a></h3>
            <p class="berita-card__excerpt" itemprop="text">${escapeHtml(excerpt)}</p>
            <div class="berita-card__footer"><a class="berita-read-more berita-read-more--sm" href="${href}">Lihat Promo &rarr;</a></div>
          </div>
        </article>`;
}

function updateBeritaWithPromo(promos) {
  if (!fs.existsSync(BERITA_INDEX)) { console.warn("berita/index.html tidak ditemukan."); return; }

  let html = fs.readFileSync(BERITA_INDEX, "utf8");

  // 1. Tambahkan tombol filter "Promo" jika belum ada
  if (!html.includes('data-filter="promo"')) {
    html = html.replace(
      '<button class="berita-filter__btn" data-filter="perbandingan" type="button">Perbandingan Model</button>',
      '<button class="berita-filter__btn" data-filter="perbandingan" type="button">Perbandingan Model</button>\n        <button class="berita-filter__btn" data-filter="promo" type="button">Promo</button>'
    );
  }

  // 2. Tambahkan marker jika belum ada
  if (!html.includes(BERITA_PROMO_START)) {
    html = html.replace(
      BERITA_PROMO_START,
      ""
    );
    // Sisipkan setelah INJECT_END (artikel berita)
    const ARTIKEL_END = "<!-- CMS:ARTIKEL:END -->";
    html = html.replace(
      ARTIKEL_END,
      `${ARTIKEL_END}\n        ${BERITA_PROMO_START}\n        ${BERITA_PROMO_END}`
    );
  }

  // 3. Update cards promo
  const published = promos
    .filter(p => boolVal(p.data.published) !== false)
    .sort((a, b) => {
      const aA = isActivePromo(a.data) ? 1 : 0;
      const bA = isActivePromo(b.data) ? 1 : 0;
      if (bA !== aA) return bA - aA;
      return new Date(b.data.start_date || 0) - new Date(a.data.start_date || 0);
    });

  const cardsHtml = published.map(buildPromoBeritaCard).join("\n");

  const startIdx = html.indexOf(BERITA_PROMO_START);
  const endIdx   = html.indexOf(BERITA_PROMO_END);
  if (startIdx === -1 || endIdx === -1) {
    console.warn("Marker CMS:BERITAPROMO tidak ditemukan di berita/index.html.");
    return;
  }
  html = html.slice(0, startIdx) + BERITA_PROMO_START + "\n" + cardsHtml + "\n        " + html.slice(endIdx);
  fs.writeFileSync(BERITA_INDEX, html, "utf8");
  console.log(`Updated berita/index.html dengan ${published.length} promo.`);
}

// ─── Update sitemap ───────────────────────────────────────────

function updateSitemap(promos) {
  if (!fs.existsSync(SITEMAP_FILE)) { console.warn("sitemap.xml tidak ditemukan."); return; }
  let xml = fs.readFileSync(SITEMAP_FILE, "utf8");

  // Sisipkan marker promo ke sitemap (sebelum Sales section)
  if (!xml.includes(SITEMAP_START)) {
    xml = xml.replace(
      "  <!-- Sales -->",
      `  <!-- Promo -->\n  ${SITEMAP_START}\n  ${SITEMAP_END}\n\n  <!-- Sales -->`
    );
    // Tambahkan listing page /promo/
    xml = xml.replace(
      SITEMAP_START,
      `${SITEMAP_START}\n  <url>\n    <loc>${SITE_URL}/promo/</loc>\n    <lastmod>${new Date().toISOString().slice(0,10)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const entries = promos
    .filter(p => boolVal(p.data.published) !== false)
    .map(p => {
      const d  = p.data.start_date ? new Date(p.data.start_date) : new Date();
      const dt = isNaN(d) ? today : d.toISOString().slice(0, 10);
      return `  <url>\n    <loc>${SITE_URL}/promo/${p.slug}/</loc>\n    <lastmod>${dt}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.75</priority>\n  </url>`;
    })
    .join("\n");

  const startIdx = xml.indexOf(SITEMAP_START);
  const endIdx   = xml.indexOf(SITEMAP_END);
  if (startIdx === -1 || endIdx === -1) { console.warn("Marker sitemap promo tidak ditemukan."); return; }

  // Pertahankan baris listing page /promo/ yang sudah ada
  const between = xml.slice(startIdx + SITEMAP_START.length, endIdx);
  const listingLine = between.match(/(\s*<url>[\s\S]*?\/promo\/<\/loc>[\s\S]*?<\/url>)/)?.[1] || "";

  xml = xml.slice(0, startIdx) + SITEMAP_START + listingLine + "\n" +
    (entries ? entries + "\n  " : "  ") + xml.slice(endIdx);
  fs.writeFileSync(SITEMAP_FILE, xml, "utf8");
  console.log(`Updated sitemap.xml dengan ${promos.length} promo.`);
}

// ─── Clean deleted promo dirs ─────────────────────────────────

function cleanDeleted(activeSlugs) {
  if (!fs.existsSync(PROMO_DIR)) return;
  const entries = fs.readdirSync(PROMO_DIR, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const htmlFile = path.join(PROMO_DIR, e.name, "index.html");
    if (!fs.existsSync(htmlFile)) continue;
    if (!activeSlugs.has(e.name)) {
      fs.rmSync(path.join(PROMO_DIR, e.name), { recursive: true, force: true });
      console.log(`Deleted promo/${e.name}/`);
    }
  }
}

// ─── Entry point ─────────────────────────────────────────────

function generate() {
  fs.mkdirSync(PROMO_DIR, { recursive: true });

  const files = fs.existsSync(PROMO_DIR)
    ? fs.readdirSync(PROMO_DIR).filter(f => f.toLowerCase().endsWith(".md"))
    : [];

  const promos = [];
  const activeSlugs = new Set();

  for (const file of files) {
    const src = fs.readFileSync(path.join(PROMO_DIR, file), "utf8");
    const { data } = parseFrontMatter(src);
    if (!data.title) { console.warn(`Lewati ${file}: tidak ada title.`); continue; }
    const slug = data.slug ? slugify(data.slug) : slugify(data.title);
    activeSlugs.add(slug);
    promos.push({ data, slug });
  }

  // Generate detail page per promo
  for (const promo of promos) {
    const outDir = path.join(PROMO_DIR, promo.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), createPromoHtml(promo.data, promos), "utf8");
    console.log(`Generated promo/${promo.slug}/index.html`);
  }

  cleanDeleted(activeSlugs);

  // Listing page
  fs.writeFileSync(PROMO_INDEX, createPromoIndexHtml(promos), "utf8");
  console.log(`Generated promo/index.html`);

  updateHomepagePromo(promos);
  updateBeritaWithPromo(promos);
  updateSitemap(promos);

  console.log(files.length
    ? `Semua promo berhasil diproses (${files.length} file).`
    : "Belum ada file promo Markdown. Listing page dibuat kosong.");
}

generate();
