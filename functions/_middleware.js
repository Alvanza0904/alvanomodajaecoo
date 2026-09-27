// Cloudflare Pages ignores host rules in _redirects and netlify.toml.
// Bing will not index www while the canonical host is the apex domain.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === "www.omodajaecoopalembang.web.id") {
    url.hostname = "omodajaecoopalembang.web.id";
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
