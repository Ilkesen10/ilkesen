(function(){
  const qs = (s, r=document) => r.querySelector(s);
  // Founder images may include crop meta like "...|z=1.000,ox=0,oy=0"; strip it for actual src
  function stripPhotoKey(v){
    if (!v) return '';
    const s = String(v);
    const i = s.indexOf('|');
    return i >= 0 ? s.slice(0, i) : s;
  }
  // Parse optional crop meta from URLs like "...|z=1.00,ox=0,oy=0"
  function splitMetaUrl(u){
    const s = String(u||'');
    const i = s.indexOf('|');
    if (i < 0) return { url: s, meta: null };
    const base = s.slice(0, i);
    const tail = s.slice(i+1);
    const meta = { z:1, ox:0, oy:0 };
    tail.split(',').forEach(p=>{
      const [k, v] = p.split('=');
      const n = Number(v);
      if (k==='z' && isFinite(n)) meta.z = n;
      if (k==='ox' && isFinite(n)) meta.ox = Math.round(n);
      if (k==='oy' && isFinite(n)) meta.oy = Math.round(n);
    });
    return { url: base, meta };
  }
  const params = new URLSearchParams(window.location.search);
  const slug = (params.get('slug')||'').trim().toLowerCase();

  async function loadPage(){
    try{
      if (!window.ilkeSupabase){
        qs('#pageTitle').textContent = 'Yapılandırma bulunamadı';
        return;
      }
      if (!slug){
        qs('#pageTitle').textContent = 'Sayfa bulunamadı';
        return;
      }
      // Special pages under Basın-Yayın
      if (slug === 'afis'){
        await renderPosters();
        return;
      }
      if (slug === 'rapor'){
        await renderReports();
        return;
      }
      // Special layout for Kurucular
      if (slug === 'kurucular'){
        await renderFounders();
        return;
      }
      // Special layout for Genel Başkan
      if (slug === 'genel-baskan'){
        await renderChairman();
        return;
      }
      if (!slug){
        qs('#pageTitle').textContent = 'Sayfa bulunamadı';
        return;
      }
      const { data, error } = await window.ilkeSupabase
        .from('pages')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data){
        // Fallback for policies stored in settings
        if (slug === 'gizlilik' || slug === 'aydinlatma'){
          const key = slug === 'gizlilik' ? 'policy_privacy' : 'policy_disclosure';
          try{
            const { data: s } = await window.ilkeSupabase
              .from('settings')
              .select('value')
              .eq('key', key)
              .maybeSingle();
            const raw = String(s?.value||'').trim();
            if (raw){
              const title = slug === 'gizlilik' ? 'Gizlilik Politikası' : 'Aydınlatma Metni';
              document.title = title + ' | İlke Sendika';
              qs('#pageTitle').textContent = title;
              const metaEl = qs('#pageMeta'); if (metaEl) metaEl.hidden = true;
              const looksHtml = /<\s*[a-z][\s\S]*>/i.test(raw);
              function normalizeBullets(s){ return String(s||'').replace(/^\s*•\s+/gm, '- '); }
              const outHtml = looksHtml
                ? sanitizeHtml(normalizeAlignment(raw))
                : sanitizeHtml(mdToHtml(normalizeBullets(raw)));
              qs('#pageBody').innerHTML = outHtml;
              buildToc();
              return;
            }
          }catch{}
        }
        qs('#pageTitle').textContent = 'Sayfa bulunamadı';
        return;
      }
      // Respect unpublish_at
      if (data.unpublish_at){
        const u = new Date(data.unpublish_at).getTime();
        if (!isNaN(u) && u <= Date.now()){
          qs('#pageTitle').textContent = 'Sayfa yayından kaldırılmış.';
          return;
        }
      }
      document.title = (data.title || 'Sayfa') + ' | İlke Sendika';
      qs('#pageTitle').textContent = data.title || 'Sayfa';
      // İç sayfalarda yayımlanma tarihi gösterilmeyecek
      const metaEl = qs('#pageMeta');
      if (metaEl) metaEl.hidden = true;

      const raw = String(data.body||'').trim();
      const looksHtml = /<\s*[a-z][\s\S]*>/i.test(raw);
      function normalizeBullets(s){ return String(s||'').replace(/^\s*•\s+/gm, '- '); }
      const outHtml = looksHtml ? sanitizeHtml(normalizeAlignment(raw)) : sanitizeHtml(mdToHtml(normalizeBullets(raw)));
      qs('#pageBody').innerHTML = outHtml;
      buildToc();
    } catch(e){
      qs('#pageTitle').textContent = 'Sayfa yüklenemedi';
      console.error(e);
    }
  }

  // Render Afiş list: 3-column thumbs + lightbox with arrow keys
  async function renderPosters(){
    try{
      document.title = 'Afiş | İlke Sendika';
      qs('#pageTitle').textContent = 'Afiş';
      const metaEl = qs('#pageMeta'); if (metaEl) metaEl.hidden = true;
      const { data, error } = await window.ilkeSupabase
        .from('posters')
        .select('id, title, body, image_url, published_at, status')
        .eq('status','published')
        .order('published_at', { ascending:false, nullsFirst:true });
      if (error) throw error;

      // Inject minimal styles once
      if (!document.getElementById('posterStyles')){
        const st = document.createElement('style'); st.id = 'posterStyles'; st.textContent = `
          #pageBody.poster-grid{ display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; }
          @media (max-width: 900px){ #pageBody.poster-grid{ grid-template-columns:repeat(2, minmax(0, 1fr)); } }
          @media (max-width: 560px){ #pageBody.poster-grid{ grid-template-columns:1fr; } }
          .poster-item{ cursor:pointer; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,.06); background:#fff; }
          .poster-item img{ width:100%; height:180px; object-fit:contain; display:block; background:#fff; }
          .poster-item h3{ font-size:16px; margin:8px 10px; }
          .poster-lightbox{ position:fixed; inset:0; background:rgba(0,0,0,.8); display:flex; align-items:center; justify-content:center; z-index:1000; }
          .poster-lightbox[hidden]{ display:none; }
          .poster-lightbox img{ max-width:90vw; max-height:85vh; border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.5); }
          .poster-nav{ position:fixed; top:50%; transform:translateY(-50%); color:#fff; background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.2); padding:8px 10px; border-radius:10px; cursor:pointer; user-select:none; font-size:22px; }
          .poster-prev{ left:20px; }
          .poster-next{ right:20px; }
          .poster-close{ position:fixed; top:16px; right:16px; color:#fff; background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.2); padding:6px 10px; border-radius:10px; cursor:pointer; font-size:16px; }
        `; document.head.appendChild(st);
      }

      // Prepare grid
      const root = qs('#pageBody'); root.innerHTML=''; root.classList.remove('cards'); root.classList.add('poster-grid');
      const items = (data||[]).filter(r=> !!r.image_url);
      const urls = items.map(r=> r.image_url);
      window.__posterGallery = { urls, index: 0 };

      // Render thumbs
      items.forEach((row, idx)=>{
        const a = document.createElement('article'); a.className='poster-item'; a.setAttribute('tabindex','0');
        const img = document.createElement('img'); img.src = row.image_url; img.alt = row.title||'Afiş'; a.appendChild(img);
        const h = document.createElement('h3'); h.textContent = row.title || ''; a.appendChild(h);
        a.addEventListener('click', ()=> openPosterLightbox(idx));
        a.addEventListener('keydown', (ev)=>{ if (ev.key==='Enter' || ev.key===' ') { ev.preventDefault(); openPosterLightbox(idx); } });
        root.appendChild(a);
      });
      buildToc();
    }catch(e){ qs('#pageTitle').textContent='Afişler yüklenemedi'; console.error(e); }
  }

  function ensurePosterLightbox(){
    let box = document.getElementById('posterLightbox');
    if (box) return box;
    box = document.createElement('div'); box.id='posterLightbox'; box.className='poster-lightbox'; box.setAttribute('hidden','');
    const img = document.createElement('img'); img.alt='Afiş'; box.appendChild(img);
    const btnPrev = document.createElement('button'); btnPrev.className='poster-nav poster-prev'; btnPrev.textContent='‹'; box.appendChild(btnPrev);
    const btnNext = document.createElement('button'); btnNext.className='poster-nav poster-next'; btnNext.textContent='›'; box.appendChild(btnNext);
    const btnClose = document.createElement('button'); btnClose.className='poster-close'; btnClose.textContent='Kapat ✕'; box.appendChild(btnClose);
    box.addEventListener('click', (e)=>{ if (e.target === box) closePosterLightbox(); });
    btnClose.addEventListener('click', closePosterLightbox);
    btnPrev.addEventListener('click', ()=> navPoster(-1));
    btnNext.addEventListener('click', ()=> navPoster(1));
    document.body.appendChild(box);
    return box;
  }

  function openPosterLightbox(idx){
    try{
      const g = window.__posterGallery; if (!g || !g.urls || !g.urls.length) return;
      g.index = Math.max(0, Math.min(idx, g.urls.length-1));
      const box = ensurePosterLightbox();
      const img = box.querySelector('img'); img.src = g.urls[g.index];
      box.removeAttribute('hidden');
      // Keyboard navigation
      if (!window.__posterKb){
        window.__posterKb = (ev)=>{
          if (ev.key === 'Escape') return closePosterLightbox();
          if (ev.key === 'ArrowLeft') return navPoster(-1);
          if (ev.key === 'ArrowRight') return navPoster(1);
        };
      }
      document.addEventListener('keydown', window.__posterKb);
    }catch{}
  }

  function closePosterLightbox(){
    const box = document.getElementById('posterLightbox'); if (box) box.setAttribute('hidden','');
    if (window.__posterKb) document.removeEventListener('keydown', window.__posterKb);
  }

  function navPoster(delta){
    const g = window.__posterGallery; if (!g || !g.urls || !g.urls.length) return;
    g.index = (g.index + delta + g.urls.length) % g.urls.length;
    const box = document.getElementById('posterLightbox'); if (!box) return;
    const img = box.querySelector('img'); if (!img) return; img.src = g.urls[g.index];
  }

  // Render Rapor list: downloadable files
  async function renderReports(){
    try{
      document.title = 'Rapor | İlke Sendika';
      qs('#pageTitle').textContent = 'Rapor';
      const metaEl = qs('#pageMeta'); if (metaEl) metaEl.hidden = true;
      const { data, error } = await window.ilkeSupabase
        .from('reports')
        .select('id, title, file_url, published_at, status')
        .eq('status','published')
        .order('published_at', { ascending:false, nullsFirst:true });
      if (error) throw error;
      const root = qs('#pageBody'); root.innerHTML='';
      const ul=document.createElement('ul'); ul.className='checks';
      (data||[]).forEach(row=>{
        const li=document.createElement('li');
        const a=document.createElement('a'); a.href=row.file_url||'#'; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent=row.title||'Rapor';
        li.appendChild(a); ul.appendChild(li);
      });
      root.appendChild(ul);
      buildToc();
    }catch(e){ qs('#pageTitle').textContent='Raporlar yüklenemedi'; console.error(e); }
  }

  // Render Kurucular: 7 founders in 1–3–3 layout
  async function renderFounders(){
    try{
      document.title = 'Kurucular | İlke Sendika';
      qs('#pageTitle').textContent = 'Kurucular';
      const metaEl = qs('#pageMeta'); if (metaEl) metaEl.hidden = true;
      // Ensure styles once
      if (!document.getElementById('foundersStyles')){
        const st = document.createElement('style'); st.id='foundersStyles'; st.textContent = `
          .founders{ max-width:1100px; margin:0 auto; }
          .founders .row{ display:flex; gap:16px; justify-content:center; margin-bottom:16px; flex-wrap:nowrap; }
          .founder{ width: 220px; max-width: 30vw; text-align:center; }
          .founder .ph{ position:relative; width: 100%; aspect-ratio:1/1; border-radius:14px; overflow:hidden; background:#fff; box-shadow:0 2px 10px rgba(0,0,0,.06); }
          .founder .ph img{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block; }
          .founder h3{ font-size:16px; margin:8px 0 0; }
          @media (max-width: 900px){ .founder{ width: 180px; } }
          @media (max-width: 600px){ .founder{ width: 150px; } }
        `; document.head.appendChild(st);
      }

      const { data, error } = await window.ilkeSupabase
        .from('founders')
        .select('id, name, image_url, sort, status')
        .eq('status', 'published')
        .order('sort', { ascending: true, nullsFirst: true })
        .limit(7);
      if (error) throw error;
      const list = (data||[]).filter(x=> x && x.image_url);
      const root = qs('#pageBody'); root.innerHTML='';
      const wrap = document.createElement('div'); wrap.className='founders';

      function item(f){
        const a = document.createElement('article'); a.className='founder';
        const ph = document.createElement('div'); ph.className='ph';
        const { url } = splitMetaUrl(f.image_url || '');
        const img = document.createElement('img');
        img.alt = f.name || '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.src = url || stripPhotoKey(f.image_url);
        ph.appendChild(img);
        a.appendChild(ph);
        const h = document.createElement('h3'); h.textContent = f.name || '';
        a.appendChild(h);
        return a;
      }

      // Split into rows: 1 | 3 | 3
      const r1 = document.createElement('div'); r1.className='row row-1';
      const r2 = document.createElement('div'); r2.className='row row-2';
      const r3 = document.createElement('div'); r3.className='row row-3';

      if (list[0]) r1.appendChild(item(list[0]));
      for (let i=1; i<Math.min(list.length, 4); i++) r2.appendChild(item(list[i]));
      for (let i=4; i<Math.min(list.length, 7); i++) r3.appendChild(item(list[i]));

      if (r1.children.length) wrap.appendChild(r1);
      if (r2.children.length) wrap.appendChild(r2);
      if (r3.children.length) wrap.appendChild(r3);

      root.appendChild(wrap);
      buildToc();
    }catch(e){
      qs('#pageTitle').textContent='Kurucular yüklenemedi'; console.error(e);
    }
  }

  // Render Genel Başkan: left photo (with crop meta) + right message
  async function renderChairman(){
    try{
      document.title = 'Genel Başkan | İlke Sendika';
      qs('#pageTitle').textContent = 'Genel Başkan';
      const metaEl = qs('#pageMeta'); if (metaEl) metaEl.hidden = true;

      // Ensure styles once
      if (!document.getElementById('chairmanStyles')){
        const st = document.createElement('style'); st.id = 'chairmanStyles'; st.textContent = `
          #pageBody.chairman{ display:grid; grid-template-columns: 380px 1fr; gap:16px; align-items:stretch; }
          /* Mobile: single column, normal top alignment */
          @media (max-width: 900px){ #pageBody.chairman{ grid-template-columns:1fr; align-items:start; } }
          .chairman-photo{ position:relative; width:100%; aspect-ratio:3/4; border-radius:14px; overflow:hidden; background:#fff; box-shadow:0 2px 10px rgba(0,0,0,.06); }
          .chairman-photo .bg{ position:absolute; inset:0; background-repeat:no-repeat; }
          .chairman-msg.card{ padding:16px; display:flex; flex-direction:column; justify-content:center; align-items:flex-start; min-height:0; }
        `; document.head.appendChild(st);
      }

      const { data, error } = await window.ilkeSupabase
        .from('chairman')
        .select('photo_url, message_html, status, updated_at')
        .eq('status','published')
        .order('updated_at',{ ascending:false, nullsFirst:true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const row = data || { photo_url:'', message_html:'' };

      const root = qs('#pageBody');
      root.innerHTML = '';
      root.classList.remove('cards');
      root.classList.add('chairman');

      // Left: photo
      const left = document.createElement('div'); left.className='chairman-photo card';
      const holder = document.createElement('div'); holder.className='bg';
      const info = splitMetaUrl(row.photo_url||'');
      const url = info.url || stripPhotoKey(row.photo_url);
      const meta = info.meta || { z:1, ox:0, oy:0 };
      if (url){
        holder.style.backgroundImage = `url(${url})`;
        const z = Number(meta.z||1); holder.style.backgroundSize = `${Math.max(100, Math.round(100*z))}%`;
        const ox = Number(meta.ox||0); const oy = Number(meta.oy||0);
        holder.style.backgroundPosition = `calc(50% + ${ox}px) calc(50% + ${oy}px)`;
      }
      left.appendChild(holder);

    // Right: message
    const right = document.createElement('div'); right.className='chairman-msg card';
    const html = String(row.message_html||'').trim();
    const normalized = normalizeAlignment(html);
    const clean = sanitizeHtml(normalized);
    right.innerHTML = clean || '<div class="muted">İçerik yakında…</div>';

      root.appendChild(left);
      root.appendChild(right);
      buildToc();
    }catch(e){
      qs('#pageTitle').textContent='Genel Başkan yüklenemedi'; console.error(e);
    }
  }

  // Minimal Markdown and sanitizer (reuse logic similar to news.js)
  function mdToHtml(md){
    let html = '\n' + String(md||'') + '\n';
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/^######\s+(.*)$/gm, '<h6>$1</h6>')
               .replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>')
               .replace(/^####\s+(.*)$/gm, '<h4>$1</h4>')
               .replace(/^###\s+(.*)$/gm, '<h3>$1</h3>')
               .replace(/^##\s+(.*)$/gm, '<h2>$1</h2>')
               .replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1<\/strong>')
               .replace(/\*(.+?)\*/g, '<em>$1<\/em>')
               .replace(/`([^`]+)`/g, '<code>$1<\/code>');
    html = html.replace(/\[([^\]]+)\]\((https?:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1<\/a>');
    html = html.replace(/^(?:\s*[-\*]\s+.+\n)+/gm, (block)=>{
      const items = block.trim().split(/\n/).map(l=> l.replace(/^\s*[-\*]\s+/, '')).map(t=>`<li>${t}<\/li>`).join('');
      return `<ul>${items}<\/ul>`;
    });
    html = html.replace(/^(?!<h\d|<ul|<li|<p|<code|<blockquote|<img|<a)(.+)$/gm, '<p>$1<\/p>');
    return html;
  }

  function sanitizeHtml(dirty){
    const allowedTags = new Set(['A','B','STRONG','I','EM','U','P','UL','OL','LI','H1','H2','H3','H4','H5','H6','CODE','BR','SPAN','DIV']);
    const allowedAttrs = {
      'A': new Set(['href','target','rel','style','class']),
      'P': new Set(['class','style']),
      'SPAN': new Set(['class','style']),
      'DIV': new Set(['class','style']),
      'H1': new Set(['class','style']),
      'H2': new Set(['class','style']),
      'H3': new Set(['class','style']),
      'H4': new Set(['class','style']),
      'H5': new Set(['class','style']),
      'H6': new Set(['class','style'])
    };
    const allowedStyles = new Set(['text-align','font-size','font-family','font-weight','font-style','text-decoration','color','line-height']);
    function cleanStyle(el){
      const style = el.getAttribute('style')||'';
      if (!style) return;
      const parts = style.split(';').map(s=>s.trim()).filter(Boolean);
      const kept = [];
      for (const part of parts){
        const [prop, valRaw] = part.split(':'); if (!prop || !valRaw) continue;
        const p = prop.trim().toLowerCase(); const v = valRaw.trim();
        if (!allowedStyles.has(p)) continue;
        if (p === 'font-size'){
          const okPx = /^\d{1,3}px$/i.test(v);
          const okPt = /^\d{1,3}pt$/i.test(v);
          const okEmRem = /^(?:0|\d{1,2})(?:\.\d+)?(?:em|rem)$/i.test(v);
          const okPercent = /^([5-9]\d|\d{3})(?:\.\d+)?%$/i.test(v); // 50% - 999%
          if (!(okPx || okPt || okEmRem || okPercent)) continue;
        }
        if (p === 'text-align' && !/^(left|right|center|justify)$/.test(v)) continue;
        if (p === 'font-family' && /[;{}]/.test(v)) continue;
        kept.push(`${p}:${v}`);
      }
      if (kept.length) el.setAttribute('style', kept.join('; ')); else el.removeAttribute('style');
    }
    const tmp = document.createElement('div');
    tmp.innerHTML = dirty || '';
    const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_ELEMENT, null);
    const toRemove = [];
    while (walker.nextNode()){
      const el = walker.currentNode;
      if (!allowedTags.has(el.tagName)) { toRemove.push(el); continue; }
      Array.from(el.attributes).forEach(attr => {
        if (!allowedAttrs[el.tagName] || !allowedAttrs[el.tagName].has(attr.name)) {
          el.removeAttribute(attr.name);
        }
      });
      cleanStyle(el);
      if (el.tagName === 'A'){
        const href = el.getAttribute('href')||'';
        if (!/^https?:\/\//i.test(href)) el.removeAttribute('href');
        el.setAttribute('rel','noopener noreferrer');
        el.setAttribute('target','_blank');
      }
    }
    toRemove.forEach(n => n.replaceWith(document.createTextNode(n.textContent||'')));
    return tmp.innerHTML;
  }

// Normalize legacy alignment so sanitizeHtml preserves it
// - Converts align="left|right|center|justify" to style="text-align: ..."
// - Maps non-standard values to allowed: start->left, end->right, justifyfull->justify
// - Converts <center> ... </center> to <div style="text-align:center"> ... </div>
function normalizeAlignment(html){
  let s = String(html||'');

  // 0) Convert <center> to <div style="text-align:center">
  //    Do this first so later sanitizer keeps the style.
  s = s
    .replace(/<center>/gi, '<div style="text-align: center">')
    .replace(/<\/center>/gi, '</div>');

  // 1) Convert align attribute on common tags to style
  s = s.replace(/<(p|div|h[1-6]|span)([^>]*?)\s+align="(left|right|center|justify)"([^>]*)>/gi,
    (m, tag, pre, align, post) => {
      let attrs = (pre + ' ' + post).trim();
      // remove align attr first
      attrs = attrs.replace(/\s+align="[^"]*"/i, '');
      const styleMatch = attrs.match(/\sstyle="([^"]*)"/i);
      if (styleMatch){
        let style = styleMatch[1];
        if (!/text-align\s*:/i.test(style)) style = style.replace(/;?\s*$/, '; ') + `text-align: ${align}`;
        attrs = attrs.replace(styleMatch[0], ` style="${style}"`);
      } else {
        attrs += ` style="text-align: ${align}"`;
      }
      return `<${tag} ${attrs}>`;
    }
  );

  // 2) Normalize uncommon values that editors may emit
  s = s.replace(/text-align\s*:\s*(justifyfull)\b/ig, 'text-align: justify');
  s = s.replace(/text-align\s*:\s*(start)\b/ig, 'text-align: left');
  s = s.replace(/text-align\s*:\s*(end)\b/ig, 'text-align: right');

  return s;
}

  // Build a Table of Contents from headings inside #pageBody
  function buildToc(){
    try{
      const body = document.getElementById('pageBody');
      const tocWrap = document.getElementById('tocWrap');
      const tocNav = document.getElementById('pageToc');
      if (!body || !tocWrap || !tocNav) return;
      const hs = Array.from(body.querySelectorAll('h2, h3'));
      if (!hs.length) { tocWrap.hidden = true; return; }
      const slugify = (t)=> String(t||'')
        .toLowerCase()
        .replace(/[^a-z0-9ğüşöçı\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const used = new Set();
      hs.forEach(h => {
        let id = h.id || slugify(h.textContent||'');
        let c = 1; while (used.has(id) || !id) { id = id ? id + '-' + c++ : 'bölüm-' + c++; }
        used.add(id); h.id = id;
      });
      tocNav.innerHTML = '';
      hs.forEach(h => {
        const a = document.createElement('a'); a.href = '#' + h.id; a.textContent = h.textContent||'';
        a.className = h.tagName === 'H3' ? 'lvl-3' : 'lvl-2';
        a.addEventListener('click', (e)=>{
          e.preventDefault();
          const target = document.getElementById(h.id); if (!target) return;
          const y = target.getBoundingClientRect().top + window.scrollY - 80; // account for sticky header
          window.scrollTo({ top: y, behavior: 'smooth' });
          history.replaceState(null, '', '#' + h.id);
        });
        tocNav.appendChild(a);
      });
      tocWrap.hidden = false;
    }catch{}
  }

  document.addEventListener('DOMContentLoaded', loadPage);
})();
