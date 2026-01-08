// Cloudflare Worker for routing fix
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
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
      return env.ASSETS.fetch(request.clone({ url: url.origin + routes[path] + url.search }));
    }
    
    // Handle dynamic pages
    if (path.startsWith('/page/') || path.startsWith('/disiplin-kurulu') || 
        path.startsWith('/genel-baskan') || path.startsWith('/vizyon') || 
        path.startsWith('/misyon') || path.startsWith('/amac') || 
        path.startsWith('/kurucular') || path.startsWith('/yonetim-kurulu') || 
        path.startsWith('/denetleme-kurulu') || path.startsWith('/afis') || 
        path.startsWith('/rapor') || path.startsWith('/kanun')) {
      
      const slug = path.replace(/^\/+/, '');
      const pageUrl = url.origin + '/page.html?slug=' + encodeURIComponent(slug) + url.search;
      return env.ASSETS.fetch(request.clone({ url: pageUrl }));
    }
    
    // Default to Assets
    return env.ASSETS.fetch(request);
  }
};
