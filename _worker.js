// Cloudflare Worker for routing fix
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const isAsset = (p) => {
      const last = (p.split('/').filter(Boolean).pop() || '');
      return last.includes('.');
    };
    
    if (path === '/page.html') {
      const target = new URL(url.origin + '/page');
      url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
      return Response.redirect(target.toString(), 301);
    }

    if (path === '/lawyer-request' || path === '/lawyer-request/') {
      const target = new URL(url.origin + '/avukatlik-talebi');
      url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
      return Response.redirect(target.toString(), 301);
    }

    if (path === '/index') {
      const target = new URL(url.origin + '/');
      url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
      return Response.redirect(target.toString(), 301);
    }
    
    // Handle trailing slashes
    if (path !== '/' && path.endsWith('/')) {
      const newPath = path.slice(0, -1);
      if (url.search) {
        return Response.redirect(`${url.origin}${newPath}${url.search}`, 301);
      }
      return Response.redirect(`${url.origin}${newPath}`, 301);
    }

    const staticBypass = new Set([
      '/contact',
      '/avukatlik-talebi',
      '/gorusme-talebi',
      '/uyelik-basvurusu',
      '/news',
      '/admin',
      '/verify',
    ]);
    if (staticBypass.has(path)) {
      return env.ASSETS.fetch(request);
    }

    if (isAsset(path)) {
      return env.ASSETS.fetch(request);
    }

    if (path === '/page') {
      return env.ASSETS.fetch(request);
    }
    
    // Handle dynamic pages
    if (path.startsWith('/page/')) {
      const slug = path.slice('/page/'.length).replace(/\/+$/,'');
      const pageUrl = new URL(url.origin + '/page');
      pageUrl.searchParams.set('slug', slug);
      url.searchParams.forEach((v, k) => { if (k !== 'slug') pageUrl.searchParams.set(k, v); });
      return env.ASSETS.fetch(new Request(pageUrl.toString(), request));
    }

    const parts = path.split('/').filter(Boolean);
    if (parts.length === 1) {
      const slug = parts[0];
      const pageUrl = new URL(url.origin + '/page');
      pageUrl.searchParams.set('slug', slug);
      url.searchParams.forEach((v, k) => { if (k !== 'slug') pageUrl.searchParams.set(k, v); });
      return env.ASSETS.fetch(new Request(pageUrl.toString(), request));
    }
    
    // Default to Assets
    return env.ASSETS.fetch(request);
  }
};
