// Cloudflare Worker for routing fix
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const isAsset = (p) => {
      const last = (p.split('/').filter(Boolean).pop() || '');
      return last.includes('.');
    };
    
    // Handle trailing slashes
    if (path !== '/' && path.endsWith('/')) {
      const newPath = path.slice(0, -1);
      if (url.search) {
        return Response.redirect(`${url.origin}${newPath}${url.search}`, 301);
      }
      return Response.redirect(`${url.origin}${newPath}`, 301);
    }
    
    // Handle specific routes
    const routes = {
      '/contact': '/contact.html',
      '/avukatlik-talebi': '/avukatlik-talebi.html',
      '/gorusme-talebi': '/gorusme-talebi.html',
      '/uyelik-basvurusu': '/uyelik-basvurusu.html',
      '/news': '/news.html',
    };
    
    if (routes[path]) {
      return env.ASSETS.fetch(new Request(url.origin + routes[path] + url.search, request));
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
