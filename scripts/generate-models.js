const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

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

function getModelEntries() {
  const files = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.yml')).sort();
  const entries = [];

  for (const file of files) {
    const full = path.join(MODELS_DIR, file);
    const data = yaml.load(fs.readFileSync(full, 'utf8'));

    if (!data || !data.slug) {
      throw new Error(`Missing slug in ${file}`);
    }

    const variants = Array.isArray(data.variants) ? data.variants.filter(v => v && v.slug) : [];

    if (variants.length > 0) {
      for (const variant of variants) {
        const otr = Number(variant.otr);
        if (!variant.slug || isNaN(otr)) {
          throw new Error(`Missing variant OTR data in ${file}: ${JSON.stringify(variant)}`);
        }
        entries.push({
          slug: variant.slug,
          name: variant.name,
          otr,
          display: toRupiah(otr),
          source: file,
        });
      }
      continue;
    }

    const otr = Number(data.otr);
    if (isNaN(otr)) {
      throw new Error(`Missing OTR for model ${data.slug} in ${file}`);
    }

    entries.push({
      slug: data.slug,
      name: data.name,
      otr,
      display: toRupiah(otr),
      source: file,
    });
  }

  return entries;
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
      html = `${before}${entry.display}${after}`;
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
