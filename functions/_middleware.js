// Canonical URL enforcement for Cloudflare Pages.
// Host rules in _redirects/netlify.toml are ignored; this runs first.
// Pretty-URL 308 (.html → clean) is upgraded to 301, and missing files
// like /omoda-o4.html (which otherwise 200 the homepage) are redirected.

const CANON_HOST = "omodajaecoopalembang.web.id";

const KEEP_HTML = [
  /^\/yandex_/i,
  /^\/admin\//i,
];

const DIR_SLASH = [
  /^\/omoda-o4(\/|$)/,
  /^\/jaecoo-j7-sivp(\/|$)/,
  /^\/berita(\/|$)/,
  /^\/promo(\/|$)/,
  /^\/jaecoo-j5\/(design|interior|technology|specifications)(\/|$)/,
];

const FILE_NO_SLASH = new Set([
  "/jaecoo-j5",
  "/jaecoo-j7",
  "/jaecoo-j8",
  "/jaecoo-j8-design",
  "/jaecoo-j8-technology",
  "/sales-jaecoo-palembang",
  "/jaecoo-j7/design",
  "/jaecoo-j7/interior",
  "/jaecoo-j7/performance",
  "/jaecoo-j7/technology",
  "/jaecoo-j7/safety",
]);

function needsSlash(pathNoSlash) {
  return DIR_SLASH.some((re) => re.test(pathNoSlash));
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const method = context.request.method;
  if (method !== "GET" && method !== "HEAD") {
    return context.next();
  }

  let changed = false;

  if (url.protocol === "http:") {
    url.protocol = "https:";
    changed = true;
  }

  if (url.hostname === `www.${CANON_HOST}`) {
    url.hostname = CANON_HOST;
    changed = true;
  }

  let path = url.pathname;

  if (KEEP_HTML.some((re) => re.test(path))) {
    if (changed) {
      return Response.redirect(url.toString(), 301);
    }
    return context.next();
  }

  if (path === "/index.html" || path === "/index") {
    path = "/";
    changed = true;
  } else if (/\.html$/i.test(path)) {
    path = path.replace(/\.html$/i, "");
    if (path === "") path = "/";
    changed = true;
  }

  if (path.length > 1) {
    const noSlash = path.replace(/\/+$/, "");
    if (needsSlash(noSlash) && !path.endsWith("/")) {
      path = `${noSlash}/`;
      changed = true;
    } else if ((FILE_NO_SLASH.has(noSlash) || path === "/jaecoo-j5/") && path.endsWith("/")) {
      path = noSlash;
      changed = true;
    }
  }

  if (changed) {
    url.pathname = path;
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}
