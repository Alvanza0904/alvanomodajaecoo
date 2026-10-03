const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const MODELS_DIR = path.join(ROOT, 'content', 'models');
const HTML_FILES = [
  path.join(ROOT, 'jaecoo-j5.html'),
  path.join(ROOT, 'jaecoo-j7.html'),
  path.join(ROOT, 'jaecoo-j8.html'),
  path.join(ROOT, 'index.html')
];

function toRupiah(num) {
  if (typeof num !== 'number' || Number.isNaN(num)) {
    throw new Error(`Invalid numeric value: ${num}`);
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function parseYamlValue(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1);
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

function parseSimpleYaml(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const data = {};
  let currentList = null;
  let currentItem = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (/^variants:/.test(line)) {
      currentList = 'variants';
      data.variants = [];
      continue;
    }

    if (currentList === 'variants' && /^- /.test(line)) {
      currentItem = {};
      data.variants.push(currentItem);
      const rest = line.slice(2).trim();
      if (rest) {
        const idx = rest.indexOf(':');
        if (idx !== -1) {
          const key = rest.slice(0, idx).trim();
          const value = parseYamlValue(rest.slice(idx + 1).trim());
          currentItem[key] = value;
        }
      }
      continue;
    }

    if (currentList === 'variants' && currentItem && /^\w+:/.test(line)) {
      const idx = line.indexOf(':');
      const key = line.slice(0, idx).trim();
      const value = parseYamlValue(line.slice(idx + 1).trim());
      currentItem[key] = value;
      continue;
    }

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = parseYamlValue(line.slice(idx + 1).trim());
    data[key] = value;
  }

  return data;
}

function getModelEntries() {
  const files = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.yml')).sort();
  const entries = [];

  for (const file of files) {
    const full = path.join(MODELS_DIR, file);
    const data = parseSimpleYaml(full);
    if (!data.slug) {
      throw new Error(`Missing slug in ${file}`);
    }

    if (data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
      for (const variant of data.variants) {
        if (!variant.slug || typeof variant.otr !== 'number') {
          throw new Error(`Missing variant OTR data in ${file}: ${JSON.stringify(variant)}`);
        }
        entries.push({
          slug: variant.slug,
          name: variant.name,
          otr: variant.otr,
          display: toRupiah(variant.otr),
          source: file,
        });
      }
      continue;
    }

    if (typeof data.otr !== 'number') {
      throw new Error(`Missing OTR for model ${data.slug} in ${file}`);
    }

    entries.push({
      slug: data.slug,
      name: data.name,
      otr: data.otr,
      display: toRupiah(data.otr),
      source: file,
    });
  }

  return entries;
}

function ensureExactMarker(html, marker) {
  if (html.includes(marker)) {
    return true;
  }
  throw new Error(`Missing expected marker: ${marker}`);
}

function replaceInMarker(html, marker, value) {
  const start = html.indexOf(marker);
  if (start === -1) {
    throw new Error(`Marker not found: ${marker}`);
  }
  const end = html.indexOf(marker.replace('START', 'END'));
  if (end === -1) {
    throw new Error(`Closing marker not found for: ${marker}`);
  }

  const startMarker = marker;
  const endMarker = marker.replace('START', 'END');
  const before = html.slice(0, start + startMarker.length);
  const after = html.slice(end);
  const block = html.slice(start + startMarker.length, end);
  const cleaned = block.replace(/\s*Rp\s*[^\n]+|\s*\$?\d[\d.,\s]*\s*/g, '').trim();
  const replacement = `${value}`;
  return `${before}${replacement}${after}`;
}

function updateHtmlWithModelValues() {
  const entries = getModelEntries();
  const lookup = new Map(entries.map(item => [item.slug, item]));

  for (const filePath of HTML_FILES) {
    let html = fs.readFileSync(filePath, 'utf8');
    const markerMatches = [...html.matchAll(/<!-- CMS:OTR:([a-z0-9-]+):START -->/g)];

    if (!markerMatches.length) {
      throw new Error(`No OTR markers found in ${path.basename(filePath)}`);
    }

    for (const match of markerMatches) {
      const slug = match[1];
      const entry = lookup.get(slug);
      if (!entry) {
        throw new Error(`Missing model data for OTR slug: ${slug}`);
      }
      const startMarker = `<!-- CMS:OTR:${slug}:START -->`;
      const endMarker = `<!-- CMS:OTR:${slug}:END -->`;
      const start = html.indexOf(startMarker);
      const end = html.indexOf(endMarker);
      if (start === -1 || end === -1 || end < start) {
        throw new Error(`Broken OTR markers in ${path.basename(filePath)} for slug ${slug}`);
      }
      const before = html.slice(0, start + startMarker.length);
      const after = html.slice(end);
      const replacement = `${entry.display}`;
      html = `${before}${replacement}${after}`;
    }

    fs.writeFileSync(filePath, html, 'utf8');
  }
}

function main() {
  if (!fs.existsSync(MODELS_DIR)) {
    throw new Error(`Missing models directory: ${MODELS_DIR}`);
  }
  updateHtmlWithModelValues();
  console.log('OTR model values regenerated successfully.');
}

main();
