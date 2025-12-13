'use strict';

window.IlkeSendika = (function(){
  const api = {};
  // reCAPTCHA state
  let recaptcha = {
    siteKey: null,
    widgetId: null,
    token: null
  };

  function qs(sel, root=document){ return root.querySelector(sel); }
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  function initNav() {
    const toggle = qs('.nav-toggle');
    const menu = qs('#navMenu');
    if (!toggle || !menu) return;
  
    // Main menu toggle
    toggle.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  
    // Handle all link clicks within the menu
    qsa('#navMenu a').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        const li = anchor.closest('li');
        if (!li) return;
  
        const isSubmenuToggle = li.classList.contains('has-sub');
        const isMobile = window.innerWidth <= 768;
  
        // --- Mobile Logic ---
        if (isMobile) {
          if (isSubmenuToggle) {
            // This is a link with a submenu (like "Kurumsal" or "Anasayfa")
            const isHomePageLink = anchor.getAttribute('href') === 'index.html';
  
            // If it's NOT the homepage link, prevent navigation.
            // Allow homepage link to navigate.
            if (!isHomePageLink) {
              e.preventDefault();
            }
            
            // Always toggle the submenu open/closed
            const isOpen = li.classList.toggle('open');
            anchor.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  
          } else {
            // This is a regular link with no submenu. Close the main menu.
            menu.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
          }
        }
        // --- Desktop logic is handled by CSS :hover, no JS needed ---
      });
    });
  }
  // Ensure menu items exist and correct ordering across all pages
  function ensureMenuStructure(){
    try{
      const nav = document.getElementById('navMenu');
      if (!nav) return;
      const items = Array.from(nav.children).filter(el => el.matches && el.matches('li.has-sub'));
      // Helper to match top-level by anchor text
      const findTop = (title) => items.find(li => {
        const a = li.firstElementChild && li.firstElementChild.tagName === 'A' ? li.firstElementChild : li.querySelector('a');
        return a && (a.textContent||'').trim().toLowerCase() === title;
      });

      // 1) Anasayfa submenu: add "Amaç" after "Misyon"
      const homeLi = findTop('anasayfa');
      if (homeLi){
        const submenu = (homeLi.querySelector('.submenu') || Array.from(homeLi.children).find(c=>c.classList && c.classList.contains('submenu')));
        if (submenu){
          const lis = Array.from(submenu.children).filter(n => n.tagName === 'LI');
          const hasAmac = submenu.querySelector('a[href*="slug=amac"]');
          const misyonLi = lis.find(li => {
            const a = li.querySelector('a');
            return a && /slug=misyon/i.test(a.getAttribute('href')||'');
          });
          if (!hasAmac){
            // Create Amaç item
            const li = document.createElement('li');
            const a = document.createElement('a'); a.href = 'page.html?slug=amac'; a.textContent = 'Amaç';
            li.appendChild(a);
            if (misyonLi && misyonLi.nextSibling){
              submenu.insertBefore(li, misyonLi.nextSibling);
            } else if (misyonLi){
              submenu.appendChild(li);
            } else {
              // Fallback: append at end
              submenu.appendChild(li);
            }
          }
        }
      }

      // 2) Kurumsal submenu: move Genel Başkan to top
      const corpLi = findTop('kurumsal');
      if (corpLi){
        const submenu = (corpLi.querySelector('.submenu') || Array.from(corpLi.children).find(c=>c.classList && c.classList.contains('submenu')));
        if (submenu){
          const gbLi = Array.from(submenu.children).find(li => {
            const a = li.querySelector('a');
            return a && /slug=genel-baskan/i.test(a.getAttribute('href')||'');
          });
          if (gbLi && submenu.firstElementChild !== gbLi){
            submenu.insertBefore(gbLi, submenu.firstElementChild);
          }
        }
      }

      // 3) Normalize top-level "İletişim" link to contact.html on all pages (handle Turkish casing/diacritics)
      try{
        const links = Array.from(nav.querySelectorAll('a'));
        const norm = (s)=> String(s||'')
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          .replace(/ı/g,'i').replace(/İ/g,'i')
          .trim();
        links.forEach(a=>{
          const t = norm(a.textContent);
          if (t === 'iletisim' || t.includes('iletisim')){
            const href = (a.getAttribute('href') || '').trim();
            if (!/contact\.html(?:$|[?#])/i.test(href)){
              a.setAttribute('href','contact.html');
            }
          }
        });
      }catch{}
    }catch(e){ /* no-op */ }
  }
  // Expose for other modules/IIFEs
  window.sanitizeInlineHtml = sanitizeInlineHtml;

  // For homepage slider band and news cards: allow only tiny inline HTML
  function sanitizeInlineHtml(dirty){
    try{
      const allowedTags = new Set(['B','STRONG','I','EM','U','SPAN','A','BR','SMALL']);
      const allowedAttrs = {
        'A': new Set(['href','target','rel']),
        'SPAN': new Set(['style','class']),
        'SMALL': new Set([])
      };
      const allowedStyles = new Set(['font-weight','font-style','text-decoration','font-size','font-family']);
      const tmp = document.createElement('div'); tmp.innerHTML = dirty || '';
      const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_ELEMENT, null);
      const toRemove = [];
      function cleanStyle(el){
        const style = el.getAttribute('style')||''; if (!style) return;
        const parts = style.split(';').map(s=>s.trim()).filter(Boolean);
        const kept = [];
        for (const part of parts){
          const [prop, valRaw] = part.split(':'); if (!prop || !valRaw) continue;
          const p = prop.trim().toLowerCase(); const v = valRaw.trim();
          if (!allowedStyles.has(p)) continue;
          if (p === 'font-size' && !/^\d{1,3}px$/.test(v)) continue;
          if (p === 'font-family' && /[;{}]/.test(v)) continue;
          kept.push(`${p}:${v}`);
        }
        if (kept.length) el.setAttribute('style', kept.join('; ')); else el.removeAttribute('style');
      }
      while (walker.nextNode()){
        const el = walker.currentNode;
        if (!allowedTags.has(el.tagName)) { toRemove.push(el); continue; }
        Array.from(el.attributes).forEach(attr=>{
          if (!allowedAttrs[el.tagName] || !allowedAttrs[el.tagName].has(attr.name)) el.removeAttribute(attr.name);
        });
        cleanStyle(el);
        if (el.tagName === 'A'){
          const href = el.getAttribute('href')||'';
          if (!/^https?:\/\//i.test(href)) el.removeAttribute('href');
          el.setAttribute('rel','noopener noreferrer'); el.setAttribute('target','_blank');
        }
      }
      toRemove.forEach(n => n.replaceWith(document.createTextNode(n.textContent||'')));
      return tmp.innerHTML;
    }catch{ return String(dirty||''); }
  }

  // Ensure "Konu" field exists on contact page even if cached HTML lacks it
  function ensureContactSubjectField(){
    try{
      const form = document.querySelector('.contact-form');
      if (!form) return;
      const hasSubject = !!form.querySelector('input[name="subject"]');
      if (hasSubject) return;
      const emailInput = form.querySelector('input[name="email"]');
      const emailLabel = emailInput && emailInput.closest ? emailInput.closest('label') : null;
      const messageTextarea = form.querySelector('textarea[name="message"]');
      const messageLabel = messageTextarea && messageTextarea.closest ? messageTextarea.closest('label') : null;
      const lbl = document.createElement('label');
      lbl.innerHTML = '<span>Konu</span>';
      const input = document.createElement('input'); input.type='text'; input.name='subject'; input.required = true; input.id = 'contactSubject';
      lbl.appendChild(input);
      if (messageLabel && messageLabel.parentNode){ messageLabel.parentNode.insertBefore(lbl, messageLabel); }
      else if (emailLabel && emailLabel.parentNode){ emailLabel.parentNode.insertBefore(lbl, emailLabel.nextSibling); }
    }catch(e){ console.warn('ensureContactSubjectField error:', e); }
  }
  // expose for console/debug
  window.ensureContactSubjectField = ensureContactSubjectField;

  // Minimal sanitizer for rendering trusted admin content safely
  function sanitizePolicyHtml(dirty){
    try{
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
      const allowedStyles = new Set(['text-align','font-size','font-family','font-weight','font-style','text-decoration']);
      function cleanStyle(el){
        const style = el.getAttribute('style')||''; if (!style) return;
        const parts = style.split(';').map(s=>s.trim()).filter(Boolean);
        const kept = [];
        for (const part of parts){
          const [prop, valRaw] = part.split(':'); if (!prop || !valRaw) continue;
          const p = prop.trim().toLowerCase(); const v = valRaw.trim();
          if (!allowedStyles.has(p)) continue;
          if (p === 'font-size' && !/^\d{1,3}px$/.test(v)) continue;
          if (p === 'text-align' && !/^(left|right|center|justify)$/.test(v)) continue;
          if (p === 'font-family' && /[;{}]/.test(v)) continue;
          kept.push(`${p}:${v}`);
        }
        if (kept.length) el.setAttribute('style', kept.join('; ')); else el.removeAttribute('style');
      }
      const tmp = document.createElement('div'); tmp.innerHTML = dirty || '';
      const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_ELEMENT, null);
      const toRemove = [];
      while (walker.nextNode()){
        const el = walker.currentNode;
        if (!allowedTags.has(el.tagName)) { toRemove.push(el); continue; }
        Array.from(el.attributes).forEach(attr => {
          if (!allowedAttrs[el.tagName] || !allowedAttrs[el.tagName].has(attr.name)) el.removeAttribute(attr.name);
        });
        cleanStyle(el);
        if (el.tagName === 'A'){
          const href = el.getAttribute('href')||''; if (!/^https?:\/\//i.test(href)) el.removeAttribute('href');
          el.setAttribute('rel','noopener noreferrer'); el.setAttribute('target','_blank');
        }
      }
      toRemove.forEach(n => n.replaceWith(document.createTextNode(n.textContent||'')));
      return tmp.innerHTML;
    }catch{ return String(dirty||''); }
  }

  function initPolicyModal(){
    const modal = document.getElementById('policyModal');
    if (!modal) return; // only on pages that have the modal
    const titleEl = document.getElementById('policyTitle');
    const contentEl = document.getElementById('policyContent');
    const closeBtn = document.getElementById('policyClose');
    const linkPrivacy = document.getElementById('privacyLink');
    const linkDisclosure = document.getElementById('disclosureLink');

    function hide(){ modal.style.display = 'none'; document.removeEventListener('keydown', onEsc); }
    function onEsc(e){ if (e.key === 'Escape') hide(); }
    closeBtn && closeBtn.addEventListener('click', hide);

    async function openPolicy(key, title){
      try{
        titleEl && (titleEl.textContent = title || 'Bilgi');
        contentEl && (contentEl.innerHTML = '<div class="muted">Yükleniyor...</div>');
        if (window.IlkeSendikaReload && typeof window.IlkeSendikaReload.getPolicy === 'function'){
          const txt = await window.IlkeSendikaReload.getPolicy(key);
          contentEl.innerHTML = sanitizePolicyHtml(txt||'');
        }
        modal.style.display = 'block';
        document.addEventListener('keydown', onEsc);
      } catch(e){
        console.warn('policy modal error:', e);
      }
    }

    function maybeBind(linkEl, key, title){
      if (!linkEl) return;
      // If link navigates to page.html, do not intercept; modal is only for in-place display legacy
      const href = (linkEl.getAttribute('href')||'').toLowerCase();
      if (href.includes('page.html')) return;
      linkEl.addEventListener('click', (e)=>{ e.preventDefault(); openPolicy(key, title); });
    }
    maybeBind(linkPrivacy, 'policy_privacy', 'Gizlilik Politikası');
    maybeBind(linkDisclosure, 'policy_disclosure', 'Aydınlatma Metni');
  }

  // (no data-access helpers here; defined in Supabase IIFE below)

  // (duplicate removed)

    function initSlider(){
    const slider = qs('[data-slider]');
    if (!slider) return;
    const track = qs('[data-slides]', slider);
    const prev = qs('[data-prev]', slider);
    const next = qs('[data-next]', slider);
    if (!track) return;

    let index = 0;

    function slides(){ return qsa('.slide', track); }

    function ensureIndex(){
      const len = slides().length;
      if (len === 0) return 0;
      if (index >= len) index = len - 1;
      if (index < 0) index = 0;
      return len;
    }

    function update(){
      const len = ensureIndex();
      if (len === 0) return;
      const offset = -index * 100;
      track.style.transform = `translateX(${offset}%)`;
      slides().forEach((s, i) => s.classList.toggle('current', i === index));
    }

    function go(delta){
      const len = slides().length;
      if (len === 0) return;
      index = (index + delta + len) % len;
      update();
    }

    prev && prev.addEventListener('click', () => go(-1));
    next && next.addEventListener('click', () => go(1));
    // Delegate clicks in case buttons are re-rendered
    slider.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!t) return;
      if (t.closest && t.closest('[data-prev]')) { ev.preventDefault(); go(-1); }
      else if (t.closest && t.closest('[data-next]')) { ev.preventDefault(); go(1); }
    });

    // Auto-rotate every 6s
    let timer = setInterval(() => go(1), 6000);
    slider.addEventListener('mouseenter', () => clearInterval(timer));
    slider.addEventListener('mouseleave', () => { timer = setInterval(() => go(1), 6000); });

    // If slides load asynchronously, observe and update when children change
    const obs = new MutationObserver(() => { index = 0; update(); });
    obs.observe(track, { childList: true });
    // Also respond to a custom event if loaders dispatch it
    document.addEventListener('slider:updated', () => { index = 0; update(); }, { once:false });

    // Initial update (may be a no-op if no slides yet)
    update();
  }

  api.handleContactSubmit = async function(e){
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const name = (fd.get('name') || '').toString().trim();
    const email = (fd.get('email') || '').toString().trim();
    const subject = (fd.get('subject') || '').toString().trim();
    const message = (fd.get('message') || '').toString().trim();

    // Basic validation
    if (!name || !email || !subject || !message){
      alert('Lütfen formdaki tüm alanları doldurunuz.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      alert('Lütfen geçerli bir e-posta adresi giriniz.');
      return false;
    }

    // reCAPTCHA validation
    const isContactPage = document.body && document.body.getAttribute('data-page') === 'contact';
    if (isContactPage){
      const hasSiteKey = !!(window.IlkeSendikaRecaptcha && window.IlkeSendikaRecaptcha.siteKey);
      if (hasSiteKey && window.grecaptcha){
        // Ensure token exists
        recaptcha.token = window.grecaptcha.getResponse();
        if (!recaptcha.token){
          alert('Lütfen doğrulamayı tamamlayınız.');
          return false;
        }
      } else {
        const fallback = document.getElementById('captchaAgree');
        if (!fallback || !fallback.checked){
          alert('Lütfen robot olmadığınızı onaylayınız.');
          return false;
        }
      }
    }

// Persist to Supabase messages table
try{
  if (!window.ilkeSupabase){ throw new Error('Veritabanı bağlantısı yok'); }
  const payload = {
    name,
    email,
    subject,
    body: message,
    captcha_token: recaptcha.token || null,
    created_at: new Date().toISOString()
  };
  const { error } = await window.ilkeSupabase.from('messages').insert(payload);
  if (error) throw error;

  // Trigger email via Edge Function (non-blocking)
  try {
    await window.ilkeSupabase.functions.invoke('send_contact', {
      body: { name, email, subject, message, captcha_token: recaptcha.token || null }
    });
  } catch {}

  alert('Teşekkürler! Mesajınız alınmıştır. En kısa sürede dönüş yapacağız.');
  form.reset();
  try{ if (window.grecaptcha) window.grecaptcha.reset(); }catch{}
  return false;
}catch(err){
  console.error('Mesaj kaydı başarısız:', err);
  alert('Mesajınız kaydedilemedi. Lütfen daha sonra tekrar deneyiniz.');
  return false;
}
  };

  function initYear(){
    const el = qs('#year');
    if (el) el.textContent = new Date().getFullYear();
  }

  function initHeaderScrollShadow(){
    const header = document.querySelector('.site-header');
    if (!header) return;
    const onScroll = () => {
      if ((window.scrollY || document.documentElement.scrollTop || 0) > 8) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function init(){
    initNav();
    ensureMenuStructure();
    initMobileSubmenus();
    initSlider();
    initYear();
    initPolicyModal();
    initHeaderScrollShadow();
    if (window.initReveal) window.initReveal();
    if (window.initAnnouncementsTicker) window.initAnnouncementsTicker();

    // Enforce subject field immediately on contact page
    if (document.body && document.body.getAttribute('data-page') === 'contact'){
      ensureContactSubjectField();
      // Watch the form in case it is re-rendered later
      try{
        const form = document.querySelector('.contact-form');
        if (form){
          const obs = new MutationObserver(()=> ensureContactSubjectField());
          obs.observe(form, { childList:true, subtree:true });
        }
      }catch{}
    }

    // Dynamic content from Supabase
    const callLoaders = () => {
      try{
        if (!window.ilkeSupabase) return false;
        if (!window.IlkeSendikaReload) return false;
        window.IlkeSendikaReload.loadSliderNews && window.IlkeSendikaReload.loadSliderNews();
        window.IlkeSendikaReload.loadNewsCards && window.IlkeSendikaReload.loadNewsCards();
        window.IlkeSendikaReload.loadAnnouncements && window.IlkeSendikaReload.loadAnnouncements();
        window.IlkeSendikaReload.loadFooterSettings && window.IlkeSendikaReload.loadFooterSettings();
        // Home posters area (if exists) — call without await (this function is not async)
        try{
          const hp = document.getElementById('homePosters');
          if (hp) { window.IlkeSendikaReload.loadHomePosters().catch(()=>{}); }
        }catch{}
        // Contact page extras
        if (document.body && document.body.getAttribute('data-page') === 'contact'){
          ensureContactSubjectField();
          try{
            const p = window.IlkeSendikaReload.loadContactSettings ? window.IlkeSendikaReload.loadContactSettings() : null;
            if (p && typeof p.then === 'function'){
              p.then(()=>{ initRecaptcha(); }).catch((e)=>{ console.warn('loadContactSettings failed:', e); initRecaptcha(); });
            } else {
              initRecaptcha();
            }
          }catch(e){ console.warn('contact init error:', e); initRecaptcha(); }
        }
        return true;
      } catch(e){ console.error('Dynamic load error:', e); return false; }
    };
    if (!callLoaders()){
      let attempts = 0;
      const timer = setInterval(() => {
        attempts++;
        if (callLoaders() || attempts >= 50) clearInterval(timer);
      }, 200);
    }
  }

  // Re-apply menu normalization at strategic times to defeat stale markup
  window.addEventListener('load', () => {
    try { ensureMenuStructure(); } catch {}
    try {
      const nav = document.getElementById('navMenu');
      if (nav){
        // Re-run when user hovers the nav (useful if markup changed late)
        nav.addEventListener('mouseenter', () => { try { ensureMenuStructure(); } catch {} }, { once:false });
        // Observe DOM changes within nav and re-normalize
        const obs = new MutationObserver(() => { try { ensureMenuStructure(); } catch {} });
        obs.observe(nav, { childList: true, subtree: true });
      }
    } catch {}
  }, { once: true });

  document.addEventListener('DOMContentLoaded', init);
  return api;
})();

// ============ Contact Helpers: reCAPTCHA enable/disable ============
function initRecaptcha(){
  try{
    const container = document.getElementById('recaptcha-container');
    const submitBtn = document.getElementById('contactSubmit');
    const setSubmitEnabled = (v)=>{ if (submitBtn){ submitBtn.disabled = !v; submitBtn.setAttribute('aria-disabled', (!v).toString()); } };
    // Default: disabled until verified
    setSubmitEnabled(false);
    if (!container){ setSubmitEnabled(true); return; }

    const key = (window.IlkeSendikaRecaptcha && window.IlkeSendikaRecaptcha.siteKey) || window.IlkeSendikaRecaptchaDefaultSiteKey || null;
    if (!key){
      // No site key: show fallback checkbox
      const fb = document.getElementById('captchaFallback'); if (fb) fb.hidden = false;
      const cb = document.getElementById('captchaAgree');
      if (cb){
        const onChange = ()=> setSubmitEnabled(!!cb.checked);
        cb.addEventListener('change', onChange);
        onChange();
      }
      return;
    }

    // We have a site key: ensure fallback stays hidden unless script fails
    { const fb = document.getElementById('captchaFallback'); if (fb) fb.hidden = true; }

    // Load Google reCAPTCHA script once
    const RENDER_CB = 'onRecaptchaReady';
    const scriptId = 'recaptcha-api';
    if (!document.getElementById(scriptId)){
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = `https://www.google.com/recaptcha/api.js?onload=${RENDER_CB}&render=explicit`;
      s.async = true; s.defer = true;
      document.head.appendChild(s);
    }
    // If script fails to load within 6s, present fallback checkbox
    setTimeout(()=>{
      try{
        if (!window.grecaptcha || !window.grecaptcha.render){
          const fb = document.getElementById('captchaFallback'); if (fb) fb.hidden = false;
          const cb = document.getElementById('captchaAgree'); if (cb){ cb.addEventListener('change', ()=> setSubmitEnabled(!!cb.checked)); }
        }
      }catch{}
    }, 6000);
    // Define onload callback (idempotent)
    window[RENDER_CB] = function(){
      try{
        if (!window.grecaptcha) return;
        // Hide fallback if it was shown by timeout and proceed with widget
        { const fb = document.getElementById('captchaFallback'); if (fb) fb.hidden = true; }
        const widgetId = window.grecaptcha.render('recaptcha-container', {
          sitekey: key,
          callback: (token) => {
            try { (window.IlkeSendika || {}).recaptcha && (window.IlkeSendika.recaptcha.token = token); } catch {}
            // Token received -> ensure fallback stays hidden and enable submit
            { const fb = document.getElementById('captchaFallback'); if (fb) fb.hidden = true; }
            setSubmitEnabled(!!token);
          },
          'expired-callback': () => {
            try { (window.IlkeSendika || {}).recaptcha && (window.IlkeSendika.recaptcha.token = null); } catch {}
            setSubmitEnabled(false);
          }
        });
        try { (window.IlkeSendika || {}).recaptcha && ((window.IlkeSendika.recaptcha.widgetId = widgetId)); } catch {}
        // Do NOT auto-show fallback just because user hasn't clicked yet. Only show it when script/render is unavailable.
      } catch(e){ console.warn('recaptcha render error:', e); }
    };
  } catch(e){ console.warn('initRecaptcha error:', e); }
}

// ============ Supabase Dynamic Content ============
(function(){
  const db = () => window.ilkeSupabase;

  async function loadSliderNews(){
    if (!db()) return;
    const slidesRoot = document.getElementById('sliderSlides');
    if (!slidesRoot) return;
    try {
      // Prefer featured news, then latest
      const { data, error } = await db()
        .from('news')
        .select('id, title, summary, image_url, cover_image_url, published_at, unpublish_at, is_featured, status')
        .eq('status', 'published')
        .order('is_featured', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(6);
      if (error) throw error;

      const now = Date.now();
      const items = (data || []).filter(n => {
        const u = n.unpublish_at ? new Date(n.unpublish_at).getTime() : null;
        return !u || u > now;
      });

      slidesRoot.innerHTML = '';
      // helper to split meta (key|z=...,ox=...,oy=...)
      function splitMetaUrl(u){
        const s = String(u||''); const i = s.indexOf('|');
        if (i < 0) return { url: s, meta: null };
        const base = s.slice(0, i); const tail = s.slice(i+1);
        const meta = { z:1, ox:0, oy:0, oxp:null, oyp:null };
        tail.split(',').forEach(p=>{
          const [k,v] = p.split('=');
          const n = Number(v);
          if (k==='z' && isFinite(n)) meta.z = n;
          if (k==='ox' && isFinite(n)) meta.ox = Math.round(n);
          if (k==='oy' && isFinite(n)) meta.oy = Math.round(n);
          if (k==='oxp' && isFinite(n)) meta.oxp = n;
          if (k==='oyp' && isFinite(n)) meta.oyp = n;
        });
         return { url: base, meta };
       }
      items.forEach((n, idx) => {
         const art = document.createElement('article');
         art.className = 'slide' + (idx === 0 ? ' current' : '');
         art.setAttribute('role', 'listitem');
         // Image underlay (prefer cover with crop meta)
         const raw = n.cover_image_url || n.image_url || n.cover_image_url; // prefer cover
         if (raw) {
           const { url, meta } = splitMetaUrl(raw);
           const holder = document.createElement('div');
           holder.style.position = 'absolute'; holder.style.inset = '0'; holder.style.overflow = 'hidden'; holder.style.background = '#fff';
           const bg = document.createElement('div');
           bg.style.position = 'absolute'; bg.style.inset = '0'; bg.style.backgroundColor = '#fff';
           bg.style.backgroundImage = `url(${url})`;
           bg.style.backgroundRepeat = 'no-repeat';
           // Clamp to at least 100% to avoid letterboxing/black areas
           if (meta){
             const z = Math.max(1, Number(meta.z||1));
             bg.style.backgroundSize = `${Math.round(100 * z)}%`;
             // Use percent-based offsets when available for responsive parity
             const hasPercent = (meta.oxp != null && isFinite(meta.oxp)) || (meta.oyp != null && isFinite(meta.oyp));
             if (hasPercent){
               const x = (meta.oxp != null && isFinite(meta.oxp)) ? `calc(50% + ${meta.oxp}%)` : `calc(50% + ${(meta.ox||0)}px)`;
               const y = (meta.oyp != null && isFinite(meta.oyp)) ? `calc(50% + ${meta.oyp}%)` : `calc(50% + ${(meta.oy||0)}px)`;
               bg.style.backgroundPosition = `${x} ${y}`;
             } else {
               const ox = meta.ox||0; const oy = meta.oy||0;
               bg.style.backgroundPosition = `calc(50% + ${ox}px) calc(50% + ${oy}px)`;
             }
           } else {
             bg.style.backgroundSize = 'cover';
             bg.style.backgroundPosition = 'center center';
           }
           holder.appendChild(bg);
           art.appendChild(holder);
         }
         // Overlay content: only title
         const wrap = document.createElement('div');
         wrap.className = 'slide-content';
         const title = document.createElement('h3'); title.className = 'slide-title';
         const link = document.createElement('a'); link.href = `news.html?id=${encodeURIComponent(n.id)}`; link.textContent = n.title || 'Haber';
         title.appendChild(link); wrap.appendChild(title);
         art.appendChild(wrap);
         slidesRoot.appendChild(art);
       });
      // Notify slider that content changed
      document.dispatchEvent(new CustomEvent('slider:updated'));
    } catch (e) {
      console.error('loadSliderNews error:', e);
    }
  }

  async function loadNewsCards(){
    if (!db()) return;
    const root = document.getElementById('newsCards');
    if (!root) return;
    try {
      const { data, error } = await db()
        .from('news')
        .select('id, title, summary, published_at, unpublish_at, image_url, cover_image_url, status')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(9);
      if (error) throw error;

      const now = Date.now();
      const items = (data || []).filter(n => {
        const u = n.unpublish_at ? new Date(n.unpublish_at).getTime() : null;
        return !u || u > now;
      });

      root.innerHTML = '';
      items.forEach(n => {
        const card = document.createElement('article');
        card.className = 'card';
        card.setAttribute('role', 'listitem');
        // Show cover/image + title only
        const imgUrl2 = n.image_url || n.cover_image_url;
        if (imgUrl2) {
          const img = document.createElement('img');
          img.src = imgUrl2; img.alt = n.title || 'Haber görseli'; img.style.borderRadius = '10px';
          card.appendChild(img);
        }
        const h3 = document.createElement('h3'); h3.textContent = n.title || 'Haber';
        const a = document.createElement('a'); a.className = 'card-link'; a.href = `news.html?id=${encodeURIComponent(n.id)}`; a.textContent = 'Haberi Oku →';
        card.appendChild(h3);
        card.appendChild(a);
        root.appendChild(card);
      });
    } catch (e) {
      console.error('loadNewsCards error:', e);
    }
  }

  async function loadAnnouncements(){
    if (!db()) return;
    const ul = document.getElementById('announcementsList');
    if (!ul) return;
    try {
      const { data, error } = await db()
        .from('announcements')
        .select('id, title, body, image_url, published_at, unpublish_at, status')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(6);
      if (error) throw error;

      const now = Date.now();
      const items = (data || []).filter(a => {
        const u = a.unpublish_at ? new Date(a.unpublish_at).getTime() : null;
        return !u || u > now;
      });

      ul.innerHTML = '';
      items.forEach(a => {
        const li = document.createElement('li');
        // thumbnail
        if (a.image_url) {
          const img = document.createElement('img');
          img.src = a.image_url;
          img.alt = a.title || 'Duyuru görseli';
          img.style.width = '48px';
          img.style.height = '48px';
          img.style.objectFit = 'cover';
          img.style.borderRadius = '8px';
          img.style.marginRight = '8px';
          img.style.verticalAlign = 'middle';
          li.appendChild(img);
        }
        const strong = document.createElement('strong'); strong.textContent = (a.title || 'Duyuru') + ': ';
        const span = document.createElement('span'); span.textContent = a.body || '';
        li.appendChild(strong);
        li.appendChild(span);
        ul.appendChild(li);
      });
    } catch (e) {
      console.error('loadAnnouncements error:', e);
    }
  }

  async function loadFooterSettings(){
    if (!db()) return;
    try {
      const { data, error } = await db()
        .from('settings')
        .select('key, value')
        .in('key', ['footer_logo_url','footer_address','footer_email','footer_phone','social_twitter','social_facebook','social_instagram','social_youtube']);
      if (error) throw error;
      const map = new Map((data||[]).map(r => [r.key, r.value]));
      const logoUrl = map.get('footer_logo_url') || 'ilkesen.jpg';
      const addr = map.get('footer_address') || null;
      const email = map.get('footer_email') || null;
      const phone = map.get('footer_phone') || null;
      const sTwitter = map.get('social_twitter') || '';
      const sFacebook = map.get('social_facebook') || '';
      const sInstagram = map.get('social_instagram') || '';
      const sYouTube = map.get('social_youtube') || '';

      // Cache-bust images to avoid stale assets
      const buster = (url) => {
        try { const u = new URL(url, window.location.origin); u.searchParams.set('v', Date.now().toString()); return u.toString(); }
        catch { return url; }
      };
      const footerLogo = document.getElementById('footerLogo'); if (footerLogo && logoUrl) footerLogo.src = buster(logoUrl);
      const headerLogo = document.getElementById('headerLogo'); if (headerLogo && logoUrl) headerLogo.src = buster(logoUrl);
      const addrEl = document.getElementById('footerAddress');
      if (addrEl){
        const full = String(addr || addrEl.textContent || '').trim();
        let short = full;
        try{
          // Tercih: "İlçe/İl" ya da "İlçe, İl"
          const slashIdx = full.lastIndexOf('/');
          if (slashIdx > -1){
            const left = full.slice(0, slashIdx).trim();
            const right = full.slice(slashIdx+1).trim();
            const leftTokens = left.split(/\s+/).filter(Boolean);
            const district = leftTokens.length ? leftTokens[leftTokens.length-1].replace(/[.,;:]$/,'') : left;
            short = `${district}, ${right}`;
          } else if (full.includes(',')){
            const parts = full.split(',').map(s=>s.trim()).filter(Boolean);
            if (parts.length >= 2){
              const left = parts[parts.length-2];
              const right = parts[parts.length-1];
              const lt = left.split(/\s+/).filter(Boolean);
              const district = lt.length ? lt[lt.length-1].replace(/[.,;:]$/,'') : left;
              short = `${district}, ${right}`;
            } else {
              short = parts.join(', ');
            }
          } else {
            // Yedek: sondan iki kelime
            const toks = full.split(/\s+/).filter(Boolean);
            short = toks.length >= 2 ? `${toks[toks.length-2]} ${toks[toks.length-1]}` : full;
          }
        }catch{}
        addrEl.textContent = short;
      }
      const emailEl = document.getElementById('footerEmail'); if (emailEl && email) emailEl.textContent = email;
      const phoneEl = document.getElementById('footerPhone'); if (phoneEl && phone) phoneEl.textContent = phone;

      function setLink(id, url){
        const a = document.getElementById(id);
        if (!a) return;
        if (url && /^https?:\/\//i.test(url)) { a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.display=''; }
        else { a.style.display='none'; }
      }
      setLink('socialTwitter', sTwitter);
      setLink('socialFacebook', sFacebook);
      setLink('socialInstagram', sInstagram);
      setLink('socialYouTube', sYouTube);
    } catch(e){
      console.warn('loadFooterSettings error:', e);
    }
  }

  async function loadContactSettings(){
    if (!db()) return;
    try{
      const { data, error } = await db()
        .from('settings')
        .select('key, value')
        .in('key', ['footer_address','footer_email','footer_phone','recaptcha_site_key']);
      if (error) throw error;
      const map = new Map((data||[]).map(r => [r.key, r.value]));
      const setText = (id, val) => { const el = document.getElementById(id); if (el && val) el.textContent = val; };
      setText('contactAddress', map.get('footer_address') || '');
      setText('contactEmail', map.get('footer_email') || '');
      setText('contactPhone', map.get('footer_phone') || '');
      const siteKey = map.get('recaptcha_site_key');
      if (siteKey){
        window.IlkeSendikaRecaptcha = window.IlkeSendikaRecaptcha || {};
        window.IlkeSendikaRecaptcha.siteKey = siteKey;
      }
    }catch(e){
      console.warn('loadContactSettings error:', e);
    }
  }

  // Home "Önemli Günler" carousel (3-up, auto-rotate, keyboard + buttons)
  async function loadHomePosters(){
    if (!db()) return;
    const wrap = document.getElementById('homePosters'); if (!wrap) return;
    const track = wrap.querySelector('[data-hp-track]'); if (!track) return;
    try{
      // Inject styles once
      if (!document.getElementById('homePostersCss')){
        const st=document.createElement('style'); st.id='homePostersCss'; st.textContent=`
          .home-posters{ position:relative; overflow:hidden; padding:0 36px; min-height:160px; }
          .home-posters .hp-track{ display:flex; gap:12px; will-change:transform; transition:transform .4s ease; }
          .home-posters .hp-item{ flex:0 0 calc(33.333% - 8px); box-sizing:border-box; }
          .home-posters .hp-card{ background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,.06); }
          .home-posters .hp-card img{ width:100%; height:140px; object-fit:contain; display:block; background:#fff; }
          .home-posters .hp-nav{ position:absolute; top:50%; transform:translateY(-50%); border:none; background:rgba(0,0,0,.35); color:#fff; width:28px; height:36px; border-radius:10px; cursor:pointer; }
          .home-posters .hp-prev{ left:4px; }
          .home-posters .hp-next{ right:4px; }
          @media (max-width: 900px){ .home-posters .hp-item{ flex-basis: calc(50% - 8px); } }
          @media (max-width: 560px){ .home-posters .hp-item{ flex-basis: 100%; } }
        `; document.head.appendChild(st);
      }

      const { data, error } = await db()
        .from('posters')
        .select('id, title, image_url, status, published_at')
        .eq('status','published')
        .order('published_at', { ascending:false, nullsFirst:true })
        .limit(12);
      if (error) throw error;

      const items = (data||[]).filter(p=>p.image_url);
      track.innerHTML='';
      items.forEach(p=>{
        const li=document.createElement('div'); li.className='hp-item';
        const card=document.createElement('article'); card.className='hp-card';
        const a=document.createElement('a'); a.href='page.html?slug=afis'; a.setAttribute('aria-label', p.title||'Afiş');
        const img=document.createElement('img'); img.src=p.image_url; img.alt=p.title||'Afiş';
        a.appendChild(img); card.appendChild(a); li.appendChild(card); track.appendChild(li);
      });

      // Carousel state
      let idx = 0; let timer = null;
      const prevBtn = wrap.querySelector('[data-hp-prev]');
      const nextBtn = wrap.querySelector('[data-hp-next]');

      function visible(){ const w = wrap.clientWidth; if (w <= 560) return 1; if (w <= 900) return 2; return 3; }
      function clampIndex(){ const vis = visible(); const max = Math.max(0, items.length - vis); if (idx < 0) idx = 0; if (idx > max) idx = max; return { vis, max }; }
      function update(){ const { vis } = clampIndex(); const item = track.querySelector('.hp-item'); if (!item) return; const itemWidth = item.getBoundingClientRect().width + 12; const off = -(idx * itemWidth); track.style.transform = `translate3d(${off}px,0,0)`; }
      function go(d){ idx += d; update(); }
      function start(){ stop(); timer = setInterval(()=>{ const { max } = clampIndex(); if (idx >= max) idx = 0; else idx++; update(); }, 5000); }
      function stop(){ if (timer){ clearInterval(timer); timer = null; } }

      prevBtn && prevBtn.addEventListener('click', ()=> go(-1));
      nextBtn && nextBtn.addEventListener('click', ()=> go(1));
      wrap.addEventListener('mouseenter', stop); wrap.addEventListener('mouseleave', start);
      // Keyboard arrows
      const onKey = (e)=>{ if (e.key==='ArrowLeft') go(-1); else if (e.key==='ArrowRight') go(1); };
      document.addEventListener('keydown', onKey);
      // Keep layout responsive
      window.addEventListener('resize', update);
      // Initial
      update(); start();
    }catch(e){ console.warn('loadHomePosters error:', e); }
  }

  // Expose for manual refresh from console if needed
  // Provide policy reader for modal consumers
  async function getPolicy(key){
    if (!db()) return '';
    try {
      const { data, error } = await db()
        .from('settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();
      if (error) throw error;
      return data?.value || '';
    } catch(e){
      console.warn('getPolicy error:', e);
      return '';
    }
  }

  window.IlkeSendikaReload = {
    loadSliderNews,
    loadNewsCards,
    loadAnnouncements,
    loadFooterSettings,
    getPolicy,
    loadContactSettings,
    loadHomePosters
  };
})();

// ============ Motion & Interactions (Reveal + Ticker) ============
(function(){
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  // Scroll-Reveal: applies .revealed when in viewport
  window.initReveal = function(){
    const candidates = qsa('.section, .card, .slide');
    if (!('IntersectionObserver' in window) || candidates.length === 0) return;
    candidates.forEach(el => el.classList.add('reveal'));
    const obs = new IntersectionObserver((entries)=>{
      entries.forEach(entry => {
        if (entry.isIntersecting){
          entry.target.classList.add('revealed');
          obs.unobserve(entry.target);
        }
      });
    }, { root: null, rootMargin: '0px 0px -5% 0px', threshold: 0.12 });
    candidates.forEach(el => obs.observe(el));
  };

  // Announcements auto-scroll (vertical ticker)
  window.initAnnouncementsTicker = function(){
    const list = document.getElementById('announcementsList');
    if (!list) return;
    const items = qsa('li', list);
    if (items.length <= 1) return;

    let timer = null;
    function step(){
      const first = list.querySelector('li');
      if (!first) return;
      const h = first.getBoundingClientRect().height;
      list.style.transition = 'transform 500ms ease';
      list.style.transform = `translateY(-${h}px)`;
      const onEnd = ()=>{
        list.style.transition = 'none';
        list.style.transform = 'translateY(0)';
        list.appendChild(first);
        list.removeEventListener('transitionend', onEnd);
        // allow next tick to re-enable transition
        setTimeout(()=>{ list.style.transition = ''; }, 20);
      };
      list.addEventListener('transitionend', onEnd);
    }
    function start(){ if (!timer) timer = setInterval(step, 3500); }
    function stop(){ if (timer){ clearInterval(timer); timer = null; } }
    list.addEventListener('mouseenter', stop); list.addEventListener('mouseleave', start);
    start();
  };
})();
