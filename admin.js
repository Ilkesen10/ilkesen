'use strict';

(function(){
  const sb = () => window.ilkeSupabase;
  const qs = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));

  const $loginSection = () => qs('#loginSection');
  const $adminSection = () => qs('#adminSection');
  const $authStatus = () => qs('#authStatus');
  const $newsTBody = () => qs('#newsTableBody');
  const $annTBody = () => qs('#annTableBody');
  const $msgsTBody = () => qs('#msgsTableBody');
  const $membersTBody = () => qs('#membersTableBody');
  const $usersTBody = () => qs('#usersTableBody');
  const $foundersTBody = () => qs('#foundersTableBody');
  const $chairmanTBody = () => qs('#chairmanTableBody');
  const $modal = () => qs('#modal');
  const $modalTitle = () => qs('#modalTitle');
  const $modalForm = () => qs('#modalForm');

  // Modal helpers
  function openModal(){
    const m = $modal();
    if (!m) return;
    m.style.display = 'block';
    m.style.maxHeight = '90vh';
    m.style.overflow = 'auto';
  }
  function closeModal(){
    const m = $modal();
    if (!m) return;
    m.style.display = 'none';
    editing = null;
  }
  try{ const closeBtn = qs('#modalClose'); if (closeBtn) closeBtn.addEventListener('click', closeModal); }catch{}
  // Also expose to window to avoid scope issues across handlers
  try{ window.openModal = openModal; window.closeModal = closeModal; }catch{}

  // Safe HTML escaper used in table renderers
  function escapeHtml(s){ const div=document.createElement('div'); div.textContent=String(s); return div.innerHTML; }

  let currentTab = 'news';
  let currentAdmin = { email:null, roles:[], allowed_tabs:[] };
  let editing = null; // { type: 'news'|'ann', id: string|null }
  let messagesById = new Map();

// Seçime inline stil uygula (ör. font-size)
// NOTE: Tek bir kez, IIFE içinde üst seviye scope’a ekleyin.
function applyInlineStyle(prop, val){
  const sel = window.getSelection(); 
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed){
    const span = document.createElement('span');
    span.style[prop] = val;
    // imleci span içinden çıkarmak için zero-width char bırak
    span.appendChild(document.createTextNode('\u200b'));
    range.insertNode(span);
    sel.removeAllRanges();
    const r = document.createRange();
    r.selectNodeContents(span);
    r.collapse(false);
    sel.addRange(r);
  } else {
    const span = document.createElement('span');
    span.style[prop] = val;
    try{ range.surroundContents(span); }
    catch { /* bazı karmaşık seçimlerde surround çalışmayabilir; burada no-op */ }
  }
}
  function showLogin(){
    $loginSection().hidden = false;
    $adminSection().hidden = true;
    $authStatus().textContent = 'Giriş yapınız';
  }

  // ========== USERS (RBAC) ==========
  async function loadAdminUsers(){
    const tbody = $usersTBody(); if (!tbody) return;
    tbody.innerHTML='';
    try{
      const { data, error } = await sb().from('admin_users').select('email, roles, allowed_tabs').order('email');
      if (error) throw error;
      const tabNames = { news:'Haberler', ann:'Duyurular', msgs:'Mesajlar', pages:'Sayfalar', posters:'Afiş', reports:'Rapor', founders:'Kurucular', chairman:'Genel Başkan', members:'Üyeler', users:'Kullanıcılar', settings:'Ayarlar' };
      (data||[]).forEach(row=>{
        const tr=document.createElement('tr');
        const roles = Array.isArray(row.roles)? row.roles.join(', ') : '';
        const tabs = Array.isArray(row.allowed_tabs)
          ? row.allowed_tabs.map(t => tabNames[t] || t).join(', ')
          : '';
        tr.innerHTML = `<td>${escapeHtml(row.email||'')}</td><td>${escapeHtml(roles)}</td><td>${escapeHtml(tabs)}</td><td class="actions"><button class="btn btn-warning" data-edit-user="${row.email}">Düzenle</button><button class="btn btn-danger" data-del-user="${row.email}">Sil</button></td>`;
        tbody.appendChild(tr);
      });
      wireUsersRowActions();
    }catch(e){ alert('Kullanıcılar yüklenemedi: ' + (e?.message||String(e))); }
  }

  function wireUsersRowActions(){
    const tbody=$usersTBody(); if(!tbody) return;
    tbody.querySelectorAll('button[data-edit-user]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const email = btn.getAttribute('data-edit-user');
        const { data } = await sb().from('admin_users').select('email, roles, allowed_tabs').eq('email', email).maybeSingle();
        openUserModal(data || { email, roles:[], allowed_tabs:[] });
      });
    });
    tbody.querySelectorAll('button[data-del-user]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const email = btn.getAttribute('data-del-user');
        if (!confirm('Silinsin mi?')) return;
        const { error } = await sb().from('admin_users').delete().eq('email', email);
        if (error) return alert('Silme hatası: ' + error.message);
        loadAdminUsers();
      });
    });
    const addBtn = qs('#newAdminUserBtn'); if (addBtn) addBtn.onclick = ()=> openUserModal({ email:'', roles:[], allowed_tabs:[] });
  }

  // ========== ADMIN USERS MODAL ==========
  function openUserModal(row){
    editing = { type:'user', id: row.email };
    $modalTitle().textContent = row.email ? 'Kullanıcıyı Düzenle' : 'Yeni Kullanıcı';
    $modalForm().innerHTML='';
    const form = $modalForm();

    // Helpers for building labeled inputs/selects
    function inputEl(labelText, name, value, type='text'){
      const label = document.createElement('label');
      label.style.display='grid';
      label.style.gap='6px';
      label.innerHTML = `<span>${labelText}</span>`;
      const input = document.createElement('input');
      input.name = name;
      input.type = type;
      input.value = value || '';
      input.className = 'btn btn-outline';
      input.style.padding='8px';
      input.style.border='1px solid #e5e7eb';
      input.style.borderRadius='6px';
      label.appendChild(input);
      return label;
    }
    function selectEl(labelText, name, value, options){
      const label = document.createElement('label');
      label.style.display='grid';
      label.style.gap='6px';
      label.innerHTML = `<span>${labelText}</span>`;
      const sel = document.createElement('select');
      sel.name=name;
      sel.className='btn btn-outline';
      sel.style.padding='8px';
      sel.style.border='1px solid #e5e7eb';
      sel.style.borderRadius='6px';
      (options||[]).forEach(o=>{ const opt=document.createElement('option'); opt.value=o.v; opt.textContent=o.t; if(String(o.v)===String(value)) opt.selected=true; sel.appendChild(opt); });
      label.appendChild(sel);
      return label;
    }

    // Email
    form.appendChild(inputEl('E‑posta', 'email', row.email||''));
    // Roles (at least superadmin is supported by applyTabPermissions)
    const rolesLbl = document.createElement('div'); rolesLbl.style.display='grid'; rolesLbl.style.gap='6px'; rolesLbl.innerHTML='<span>Roller</span>';
    const rolesWrap = document.createElement('div'); rolesWrap.style.display='flex'; rolesWrap.style.flexWrap='wrap'; rolesWrap.style.gap='10px';
    const roleOptions = [
      { v:'superadmin', t:'Süper Yönetici' },
      { v:'editor', t:'Editör' },
      { v:'viewer', t:'Görüntüleyici' }
    ];
    roleOptions.forEach(r=>{
      const lab=document.createElement('label'); lab.style.display='inline-flex'; lab.style.alignItems='center'; lab.style.gap='6px';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.value=r.v; cb.checked=row.roles && row.roles.includes(r.v);
      lab.appendChild(cb); lab.appendChild(document.createTextNode(r.t)); rolesWrap.appendChild(lab);
    });
    rolesLbl.appendChild(rolesWrap); form.appendChild(rolesLbl);

    // Allowed tabs
    const tabsLbl = document.createElement('div'); tabsLbl.style.display='grid'; tabsLbl.style.gap='6px'; tabsLbl.innerHTML='<span>İzinli Sekmeler</span>';
    const tabsWrap = document.createElement('div'); tabsWrap.style.display='flex'; tabsWrap.style.flexWrap='wrap'; tabsWrap.style.gap='10px';
    const tabOptions = [
      { v:'news', t:'Haberler' },
      { v:'ann', t:'Duyurular' },
      { v:'msgs', t:'Mesajlar' },
      { v:'pages', t:'Sayfalar' },
      { v:'posters', t:'Afiş' },
      { v:'reports', t:'Rapor' },
      { v:'founders', t:'Kurucular' },
      { v:'chairman', t:'Genel Başkan' },
      { v:'members', t:'Üyeler' },
      { v:'users', t:'Kullanıcılar' },
      { v:'settings', t:'Ayarlar' }
    ];
    tabOptions.forEach(t=>{
      const lab=document.createElement('label'); lab.style.display='inline-flex'; lab.style.alignItems='center'; lab.style.gap='6px';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.value=t.v; cb.checked=row.allowed_tabs && row.allowed_tabs.includes(t.v);
      lab.appendChild(cb); lab.appendChild(document.createTextNode(t.t)); tabsWrap.appendChild(lab);
    });
    tabsLbl.appendChild(tabsWrap); form.appendChild(tabsLbl);

    // Actions
    const actions=document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';
    const saveBtn=document.createElement('button'); saveBtn.className='btn btn-success'; saveBtn.textContent='Kaydet';
    const cancelBtn=document.createElement('button'); cancelBtn.className='btn btn-danger'; cancelBtn.textContent='İptal';
    actions.appendChild(saveBtn); actions.appendChild(cancelBtn); form.appendChild(actions);

    cancelBtn.addEventListener('click', (e)=>{ e.preventDefault(); closeModal(); });
    saveBtn.addEventListener('click', async (e)=>{
      e.preventDefault();
      const email = String(qs('input[name="email"]', form).value||'').trim();
      if (!email) return alert('E‑posta gerekli');
      const selectedRoles = Array.from(rolesWrap.querySelectorAll('input[type="checkbox"]'))
        .filter(i=>i.checked).map(i=>i.value);
      const selectedTabs = Array.from(tabsWrap.querySelectorAll('input[type="checkbox"]'))
        .filter(i=>i.checked).map(i=>i.value);
      try{
        const payload = { email, roles: selectedRoles, allowed_tabs: selectedTabs };
        const { error } = await sb().from('admin_users').upsert(payload, { onConflict:'email' });
        if (error) throw error;
        closeModal();
        if (typeof loadAdminUsers === 'function') await loadAdminUsers();
      }catch(err){ alert('Kaydedilemedi: ' + (err?.message||String(err))); }
    });

    // Open modal
    (typeof openModal === 'function' ? openModal() : (window.openModal && window.openModal()));
  }

  // ========== MEMBERS ==========
  async function loadAdminMembers(){
    const tbody = $membersTBody(); if (!tbody) return;
    // Ensure search toolbar exists
    try{
      const table = tbody.closest('table');
      const host = table && table.parentElement ? table.parentElement : tbody.parentElement;
      if (host && !qs('#membersSearchBar')){
        const bar = document.createElement('div');
        bar.id = 'membersSearchBar';
        bar.style.display='flex'; bar.style.gap='8px'; bar.style.alignItems='center'; bar.style.margin='8px 0';
        const input = document.createElement('input'); input.type='text'; input.placeholder='İsim veya TC ile ara'; input.id='membersSearchInput'; input.className='btn btn-outline'; input.style.flex='1';
        const btn = document.createElement('button'); btn.id='membersSearchBtn'; btn.textContent='Ara'; btn.className='btn';
        bar.appendChild(input); bar.appendChild(btn);
        host.insertBefore(bar, table || host.firstChild);
        // Events
        const reload = ()=> loadAdminMembers();
        let tmr; input.addEventListener('keyup', (e)=>{ clearTimeout(tmr); tmr = setTimeout(reload, 300); if (e.key==='Enter') reload(); });
        btn.addEventListener('click', reload);
      }
    }catch{}

    tbody.innerHTML='';
    try{
      const term = (qs('#membersSearchInput')?.value || '').trim();
      let q = sb().from('members').select('id, member_no, first_name, last_name, national_id, email, phone, status, join_date').order('member_no');
      if (term){
        const like = `%${term}%`;
        q = q.or(
          `first_name.ilike.${like},last_name.ilike.${like},national_id.ilike.${like}`
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      (data||[]).forEach(row=>{
        const tr=document.createElement('tr');
        const name = `${escapeHtml(row.first_name||'')} ${escapeHtml(row.last_name||'')}`.trim();
        const status = row.status || 'active';
        const statusTr = status === 'active' ? 'Aktif' : 'Pasif';
        const toggleText = status === 'active' ? 'Pasife Al' : 'Aktife Al';
        const jd = row.join_date ? new Date(row.join_date).toLocaleDateString('tr-TR') : '-';
        tr.innerHTML = `
          <td>${row.member_no||'-'}</td>
          <td>${name}<div class="muted" style="font-size:12px">${escapeHtml(row.national_id||'')}</div></td>
          <td>${escapeHtml(row.email||'')}</td>
          <td>${escapeHtml(row.phone||'')}</td>
          <td>${escapeHtml(statusTr)}</td>
          <td>${jd}</td>
          <td class="actions">
            <button class="btn btn-warning" data-edit-mem="${row.id}">Düzenle</button>
            <button class="btn btn-${status==='active'?'danger':'success'}" data-toggle-mem="${row.id}" data-status="${status}">${toggleText}</button>
            <button class="btn btn-primary" data-idcard-mem="${row.id}">Kimlik Göster</button>
          </td>`;
        tbody.appendChild(tr);
      });
      wireMembersRowActions();
    }catch(e){ alert('Üyeler yüklenemedi: ' + (e?.message||String(e))); }
  }

  function wireMembersRowActions(){
    const tbody=$membersTBody(); if(!tbody) return;
    tbody.querySelectorAll('button[data-edit-mem]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-edit-mem');
        const { data } = await sb().from('members').select('*').eq('id', id).maybeSingle();
        openMemberModal(data || { id:null, status:'active' });
      });
    });
    tbody.querySelectorAll('button[data-toggle-mem]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-toggle-mem');
        const cur = btn.getAttribute('data-status') || 'active';
        try{
          if (cur === 'active'){
            if (!confirm('Üyelik pasife alınsın mı?')) return;
            const today = new Date().toISOString().slice(0,10);
            const { error } = await sb().from('members').update({ status:'passive', leave_date: today }).eq('id', id);
            if (error) throw error;
          } else {
            if (!confirm('Üyelik aktifleştirilsin mi?')) return;
            const { error } = await sb().from('members').update({ status:'active', leave_date: null }).eq('id', id);
            if (error) throw error;
          }
          loadAdminMembers();
        }catch(err){ alert('İşlem başarısız: ' + (err?.message||String(err))); }
      });
    });
    tbody.querySelectorAll('button[data-idcard-mem]').forEach(btn=>{
      if (btn.dataset.wired) return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-idcard-mem');
        try{
          const { data } = await sb().from('members').select('*').eq('id', id).maybeSingle();
          if (!data) return alert('Üye bulunamadı');
          openIdCardPreview(data);
        }catch(e){ alert('Kimlik gösterilemedi: ' + (e?.message||String(e))); }
      });
    });
    const addBtn = qs('#newMemberBtn'); if (addBtn) addBtn.onclick = ()=> openMemberModal({ id:null, status:'active' });
  }

  async function nextMemberNo(){
    try{
      const { data, error } = await sb().from('members').select('member_no').order('member_no', { ascending:false }).limit(1);
      if (error) throw error;
      const max = (data && data[0] && Number(data[0].member_no)) || 0;
      return max + 1;
    }catch{ return 1; }
  }

  async function uploadToBucket(file, filePath) {
    try {
      // Normalize path: remove leading slashes and accidental bucket prefix
      const cleanPath = filePath.replace(/^\/+/, '').replace(/^member-photos\//, '');
      
      // Upload to the root (or given subfolder) of the bucket
      const { error } = await sb()
        .storage
        .from('member-photos')
        .upload(cleanPath, file, {
          cacheControl: '3600',
          upsert: true
        });
      
      if (error) {
        console.error('Upload error:', error);
        throw error;
      }
      
      // Get the public URL for this object
      const { data: { publicUrl } } = sb()
        .storage
        .from('member-photos')
        .getPublicUrl(cleanPath);
        
      return publicUrl;
    } catch (error) {
      console.error('Error in uploadToBucket:', error);
      throw new Error('Dosya yüklenirken bir hata oluştu: ' + (error.message || 'Bilinmeyen hata'));
    }
  }

  // Resolve a usable image URL for member photos. If bucket is private, create a signed URL.
  async function resolveMemberPhotoUrl(src){
    if (!src) return '';
    try{
      // Remove crop meta if present
      src = stripPhotoKey(src);
      // Try to extract the object key from a Supabase storage URL
      if (/^https?:\/\//i.test(src)){
        const mm = src.match(/\/storage\/v1\/object\/(public|authenticated)\/member-photos\/([^?]+)/);
        if (mm && mm[1] && mm[2]) {
          const kind = mm[1]; // 'public' | 'authenticated'
          const key = decodeURIComponent(mm[2]);
          if (kind === 'public') {
            // Public URL'yi olduğu gibi kullan (CORS düzgün gelir)
            return src;
          }
          // authenticated vb. ise imzala
          const { data, error } = await sb().storage.from('member-photos').createSignedUrl(key, 60*60);
          if (!error && data?.signedUrl) return data.signedUrl;
          return src;
        }
        // Non-supabase URL: return as-is
        return src;
      }
      // If it's not a URL, treat it as an object key inside the bucket
      const key = String(src).replace(/^\/+/, '');
      const { data, error } = await sb().storage.from('member-photos').createSignedUrl(key, 60*60);
      if (!error && data?.signedUrl) return data.signedUrl;
      return src;
    }catch(e){
      console.warn('resolveMemberPhotoUrl failed:', e);
      return src;
    }
  }

  // === Photo crop meta helpers (compact: key|z=1.00,ox=0,oy=0) ===
  function stripPhotoKey(v){
    if (!v) return '';
    const s = String(v);
    const i = s.indexOf('|');
    return i >= 0 ? s.slice(0, i) : s;
  }
  function parsePhotoMeta(v){
    const meta = { z: 1.0, ox: 0, oy: 0, oxp: null, oyp: null };
    if (!v) return meta;
    const s = String(v);
    const i = s.indexOf('|');
    if (i < 0) return meta;
    const tail = s.slice(i+1);
    tail.split(',').forEach(p=>{
      const [k, val] = p.split('=');
      const n = Number(val);
      if (k === 'z' && isFinite(n)) meta.z = n;
      if (k === 'ox' && isFinite(n)) meta.ox = Math.round(n);
      if (k === 'oy' && isFinite(n)) meta.oy = Math.round(n);
      if (k === 'oxp' && isFinite(n)) meta.oxp = n;
      if (k === 'oyp' && isFinite(n)) meta.oyp = n;
    });
    return meta;
  }
  function buildPhotoValue(key, meta){
    const k = stripPhotoKey(key);
    const z = (meta?.z ?? 1).toFixed(3);
    const ox = Math.round(meta?.ox ?? 0);
    const oy = Math.round(meta?.oy ?? 0);
    const oxp = (meta?.oxp != null) ? Number(meta.oxp) : null;
    const oyp = (meta?.oyp != null) ? Number(meta.oyp) : null;
    const parts = [`z=${z}`, `ox=${ox}`, `oy=${oy}`];
    if (oxp != null && isFinite(oxp)) parts.push(`oxp=${Math.round(oxp * 10) / 10}`);
    if (oyp != null && isFinite(oyp)) parts.push(`oyp=${Math.round(oyp * 10) / 10}`);
    return `${k}|${parts.join(',')}`;
  }

  function openMemberModal(row){
    editing = { type:'member', id: row.id };
    $modalTitle().textContent = row.id ? 'Üyeyi Düzenle' : 'Yeni Üye';
    $modalForm().innerHTML='';
    const form = $modalForm();

    // Helpers for building labeled inputs/selects
    function inputEl(labelText, name, value, type='text'){
      const label = document.createElement('label');
      label.style.display='grid';
      label.style.gap='6px';
      label.innerHTML = `<span>${labelText}</span>`;
      const input = document.createElement('input');
      input.name = name;
      input.type = type;
      input.value = value || '';
      input.className = 'btn btn-outline';
      input.style.padding='8px';
      input.style.border='1px solid #e5e7eb';
      input.style.borderRadius='6px';
      label.appendChild(input);
      return label;
    }
    function selectEl(labelText, name, value, options){
      const label = document.createElement('label');
      label.style.display='grid';
      label.style.gap='6px';
      label.innerHTML = `<span>${labelText}</span>`;
      const sel = document.createElement('select');
      sel.name=name;
      sel.className='btn btn-outline';
      sel.style.padding='8px';
      sel.style.border='1px solid #e5e7eb';
      sel.style.borderRadius='6px';
      (options||[]).forEach(o=>{ const opt=document.createElement('option'); opt.value=o.v; opt.textContent=o.t; if(String(o.v)===String(value)) opt.selected=true; sel.appendChild(opt); });
      label.appendChild(sel);
      return label;
    }

    // Identity
    form.appendChild(inputEl('Ad', 'first_name', row.first_name||''));
    form.appendChild(inputEl('Soyad', 'last_name', row.last_name||''));
    form.appendChild(inputEl('TC Kimlik No', 'national_id', row.national_id||''));
    // Family
    form.appendChild(inputEl('Baba Adı', 'father_name', row.father_name||''));
    form.appendChild(inputEl('Anne Adı', 'mother_name', row.mother_name||''));
    // Birth
    form.appendChild(inputEl('Doğum Yeri', 'birth_place', row.birth_place||''));
    form.appendChild(inputEl('Doğum Tarihi', 'birth_date', row.birth_date||'', 'date'));
    // Personal
    form.appendChild(selectEl('Cinsiyet', 'gender', row.gender||'', [ {v:'',t:'Seçiniz'}, {v:'erkek',t:'Erkek'}, {v:'kadin',t:'Kadın'} ]));
    form.appendChild(selectEl('Öğrenim Durumu', 'education', row.education||'', [ {v:'',t:'Seçiniz'},{v:'ilkokul',t:'İlkokul'},{v:'ortaokul',t:'Ortaokul'},{v:'lise',t:'Lise'},{v:'onlisans',t:'Önlisans'},{v:'lisans',t:'Lisans'},{v:'yukseklisans',t:'Yüksek Lisans'},{v:'doktora',t:'Doktora'} ]));
    // Work (Province/District dynamic selects)
    const provLabel = document.createElement('label'); provLabel.style.display='grid'; provLabel.style.gap='6px'; provLabel.innerHTML='<span>İl</span>';
    const provSel = document.createElement('select'); provSel.name='work_province'; provSel.className='btn btn-outline'; provSel.style.padding='8px'; provSel.style.border='1px solid #e5e7eb'; provSel.style.borderRadius='6px'; provLabel.appendChild(provSel); form.appendChild(provLabel);
    const distLabel = document.createElement('label'); distLabel.style.display='grid'; distLabel.style.gap='6px'; distLabel.innerHTML='<span>İlçe</span>';
    const distSel = document.createElement('select'); distSel.name='work_district'; distSel.className='btn btn-outline'; distSel.style.padding='8px'; distSel.style.border='1px solid #e5e7eb'; distSel.style.borderRadius='6px'; distLabel.appendChild(distSel); form.appendChild(distLabel);
    // Helpers for geo dropdowns and cache-busting
    const bust = (u)=>{ try{ const x=new URL(u, location.origin); x.searchParams.set('v', Date.now()); return x.toString(); }catch{ return u; } };
    const GEO_CACHE_KEY = 'ilkesen_geo_cache_v1';
    const GEO_TTL_MS = 24 * 60 * 60 * 1000; // 24h
    window.__ilkesenGeoCache = window.__ilkesenGeoCache || { provinces:null, districtsByProv:{} , ts:0 };
    async function loadCache(){
      try{
        if (window.__ilkesenGeoCache?.provinces) return window.__ilkesenGeoCache;
        const raw = localStorage.getItem(GEO_CACHE_KEY);
        if (!raw) return window.__ilkesenGeoCache;
        const obj = JSON.parse(raw);
        if (obj && Date.now() - (obj.ts||0) < GEO_TTL_MS){ window.__ilkesenGeoCache = obj; }
      }catch{}
      return window.__ilkesenGeoCache;
    }
    async function saveCache(){ try{ localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(window.__ilkesenGeoCache)); }catch{} }
    async function fetchProvinces(){
      const cache = await loadCache();
      if (cache.provinces) return cache.provinces;
      try{
        const { data: provs, error } = await sb().from('provinces').select('id,name,plate_code').order('name');
        if (error) throw error;
        window.__ilkesenGeoCache.provinces = provs || [];
        window.__ilkesenGeoCache.ts = Date.now();
        await saveCache();
        return window.__ilkesenGeoCache.provinces;
      }catch{
        // Fallback to local JSON keys as province list if DB is unavailable
        try{
          const res = await fetch('data/districts_tr.json', { cache: 'no-store' });
          const obj = await res.json();
          const names = Object.keys(obj || {});
          const provs = names.map((n, idx)=>({ id: String(idx+1), name: n, plate_code: null }));
          window.__ilkesenGeoCache.provinces = provs;
          window.__ilkesenGeoCache.ts = Date.now();
          await saveCache();
          return window.__ilkesenGeoCache.provinces;
        }catch{ return []; }
      }
    }
    async function fetchDistrictsSmart({ provinceId, plateCode, provinceName }){
      const cache = await loadCache();
      // Prefer cache by provinceId
      const cacheKey = provinceId ? `pid:${provinceId}` : (plateCode ? `pc:${plateCode}` : (provinceName ? `pn:${provinceName}` : ''));
      if (cacheKey && cache.districtsByProv[cacheKey]) return cache.districtsByProv[cacheKey];
      // 1) Try DB by province id
      if (provinceId != null && provinceId !== ''){
        try{
          const { data: d1, error: e1 } = await sb().from('districts').select('id,name,province_id').eq('province_id', provinceId).order('name');
          if (!e1 && d1 && d1.length){
            window.__ilkesenGeoCache.districtsByProv[cacheKey] = d1;
            window.__ilkesenGeoCache.ts = Date.now(); await saveCache();
            return d1;
          }
        }catch{}
      }
      // 2) Try DB by plate code if provided
      if (plateCode != null && plateCode !== ''){
        try{
          const { data: d2, error: e2 } = await sb().from('districts').select('id,name,province_id').eq('province_id', plateCode).order('name');
          if (!e2 && d2 && d2.length){
            const key = cacheKey || `pc:${plateCode}`;
            window.__ilkesenGeoCache.districtsByProv[key] = d2; window.__ilkesenGeoCache.ts = Date.now(); await saveCache();
            return d2;
          }
        }catch{}
      }
      // 3) Fallback to local JSON by province name
      try{
        const res = await fetch('data/districts_tr.json', { cache: 'no-store' });
        const obj = await res.json();
        const list = (provinceName && obj && obj[provinceName]) ? obj[provinceName] : [];
        const dists = (list||[]).map((n, idx)=>({ id: String(idx+1), name: n, province_id: provinceId || plateCode || provinceName || '' }));
        const key = cacheKey || (provinceName ? `pn:${provinceName}` : '');
        if (key){ window.__ilkesenGeoCache.districtsByProv[key] = dists; window.__ilkesenGeoCache.ts = Date.now(); await saveCache(); }
        return window.__ilkesenGeoCache.districtsByProv[key];
      }catch{}
      return [];
    }
    async function populateProvincesAndDistricts(){
      try{
        const provs = await fetchProvinces();
        provSel.innerHTML = '';
        const optNone = document.createElement('option'); optNone.value=''; optNone.textContent='İl Seçiniz'; provSel.appendChild(optNone);
        (provs||[]).forEach(p=>{ const o=document.createElement('option'); o.value=String(p.id); o.textContent=p.name; o.dataset.plate = String(p.plate_code||p.plate||''); provSel.appendChild(o); });
        // Preselect by name if row has stored province name
        if (row.work_province){
          const found = (provs||[]).find(p=> String(p.name||'').toLowerCase() === String(row.work_province||'').toLowerCase());
          if (found) provSel.value = String(found.id);
        }
        // Load districts for selected province
        async function loadDistrictsForSelected(){
          distSel.innerHTML='';
          const o0=document.createElement('option'); o0.value=''; o0.textContent='İlçe Seçiniz'; distSel.appendChild(o0);
          const selOpt = provSel.selectedOptions && provSel.selectedOptions[0];
          const pid = provSel.value;
          const plate = selOpt ? (selOpt.dataset.plate || '') : '';
          const pname = selOpt ? (selOpt.textContent || '').trim() : '';
          if (!pid && !plate && !pname){ return; }
          let dists = await fetchDistrictsSmart({ provinceId: pid, plateCode: plate, provinceName: pname });
          // If nothing came and we have a province id but missing plate code, try to resolve plate_code from DB and retry
          if ((!dists || !dists.length) && pid && !plate){
            try{
              const { data: p } = await sb().from('provinces').select('plate_code').eq('id', pid).maybeSingle();
              const plate2 = p && (p.plate_code != null) ? String(p.plate_code) : '';
              if (plate2){
                dists = await fetchDistrictsSmart({ provinceId: pid, plateCode: plate2, provinceName: pname });
              }
            }catch{}
          }
          (dists||[]).forEach(d=>{ const o=document.createElement('option'); o.value=String(d.id); o.textContent=d.name; distSel.appendChild(o); });
          if (!dists || !dists.length){
            const o=document.createElement('option'); o.value=''; o.textContent='(İlçeler yüklenemedi)'; distSel.appendChild(o);
          }
          if (row.work_district){
            const foundD = (dists||[]).find(d=> String(d.name||'').toLowerCase() === String(row.work_district||'').toLowerCase());
            if (foundD) distSel.value = String(foundD.id);
          }
        }
        await loadDistrictsForSelected();
        provSel.addEventListener('change', loadDistrictsForSelected);
      }catch{}
    }
    // Kick off population
    populateProvincesAndDistricts();
    form.appendChild(inputEl('Çalıştığınız Kurum Tam Adı', 'institution_name', row.institution_name||''));
    // Corp
    form.appendChild(inputEl('Kurum Sicil No', 'corp_reg_no', row.corp_reg_no||''));
    form.appendChild(inputEl('Unvan', 'title', row.title||''));
    form.appendChild(selectEl('Kan Grubu', 'blood_type', row.blood_type||'', [ {v:'',t:'Seçiniz'},{v:'0 Rh+',t:'0 Rh+'},{v:'0 Rh-',t:'0 Rh-'},{v:'A Rh+',t:'A Rh+'},{v:'A Rh-',t:'A Rh-'},{v:'B Rh+',t:'B Rh+'},{v:'B Rh-',t:'B Rh-'},{v:'AB Rh+',t:'AB Rh+'},{v:'AB Rh-',t:'AB Rh-'} ]));
    // Other
    form.appendChild(inputEl('Emekli Sandığı Sicil No', 'retirement_no', row.retirement_no||''));
    form.appendChild(inputEl('SSK No', 'ssk_no', row.ssk_no||''));
    // Contact
    form.appendChild(inputEl('E-posta', 'email', row.email||''));
    const phoneInput = inputEl('Telefon (5XX...)', 'phone', row.phone||'');
    form.appendChild(phoneInput);
    // Phone input mask: (XXX) XXX XX XX (visual only)
    try{
      const phoneEl = phoneInput.querySelector('input');
      if (phoneEl){
        phoneEl.placeholder = '5XX XXX XX XX';
        // Do not hard-limit to exact visual length; formatter already limits to 10 digits.
        // Some browsers count '+' and spaces in maxLength and block the last digit.
        phoneEl.maxLength = 20;
        try{ phoneEl.setAttribute('inputmode','tel'); phoneEl.autocomplete='off'; }catch{}
        phoneEl.addEventListener('input', ()=>{
          let d = String(phoneEl.value||'').replace(/\D/g,'');
          if (d.startsWith('90')) d = d.slice(2);
          if (d.startsWith('0')) d = d.slice(1);
          d = d.slice(0,10);
          let out = '';
          if (d.length > 0){ out = d.slice(0, Math.min(3,d.length)); }
          if (d.length > 3){ out += ' ' + d.slice(3, Math.min(6,d.length)); }
          if (d.length > 6){ out += ' ' + d.slice(6, Math.min(8,d.length)); }
          if (d.length > 8){ out += ' ' + d.slice(8, Math.min(10,d.length)); }
          phoneEl.value = '+90' + out; // store normalized E.164
        });
      }
    }catch{}
    // Dates & status
    form.appendChild(inputEl('Üye Kayıt Tarihi', 'join_date', row.join_date||new Date().toISOString().slice(0,10), 'date'));
    form.appendChild(inputEl('Üyelikten Ayrılış Tarihi', 'leave_date', row.leave_date||'', 'date'));
    form.appendChild(selectEl('Durum', 'status', row.status||'active', [ {v:'active',t:'Aktif'}, {v:'passive',t:'Pasif'} ]));
    // Files
    const photoLabel = document.createElement('label'); photoLabel.style.display='grid'; photoLabel.style.gap='6px'; photoLabel.innerHTML = '<span>Fotoğraf</span>';
    const photoPrev = document.createElement('img');
    photoPrev.style.maxWidth = '160px';
    photoPrev.style.maxHeight = '160px';
    photoPrev.style.objectFit = 'cover';
    photoPrev.style.borderRadius = '10px';
    photoPrev.style.border = '1px solid #e5e7eb';
    photoPrev.style.display = row.photo_url ? 'block' : 'none';
    if (row.photo_url){
      // Resolve to signed URL if needed; avoid cache-busting on signed URLs
      resolveMemberPhotoUrl(row.photo_url).then(u=>{ photoPrev.src = u; }).catch(()=>{ try{ photoPrev.src = stripPhotoKey(row.photo_url); }catch{} });
    }
    photoLabel.appendChild(photoPrev);
    const photoInput = document.createElement('input'); photoInput.type='file'; photoInput.accept='image/*'; photoLabel.appendChild(photoInput); form.appendChild(photoLabel);
    // Live preview on file select (does not upload yet)
    photoInput.addEventListener('change', ()=>{
      const f = photoInput.files && photoInput.files[0];
      if (!f){ photoPrev.style.display='none'; photoPrev.removeAttribute('src'); return; }
      const url = URL.createObjectURL(f);
      photoPrev.src = url; photoPrev.style.display='block';
    });
    // Crop controls for ID card (circle) — uses data attributes read by save logic
    const cropWrap = document.createElement('div'); cropWrap.className='card'; cropWrap.style.padding='10px'; cropWrap.style.display='grid'; cropWrap.style.gap='8px'; cropWrap.style.marginTop='8px';
    const cropTitle = document.createElement('div'); cropTitle.textContent='Kimlik Fotoğraf Kadrajı'; cropTitle.style.fontWeight='600'; cropWrap.appendChild(cropTitle);
    const initMeta = parsePhotoMeta(row.photo_url||'');
    const zoomLbl = document.createElement('label'); zoomLbl.style.display='grid'; zoomLbl.style.gap='4px'; zoomLbl.innerHTML='<span>Yakınlık</span>';
    const zoomRange = document.createElement('input'); zoomRange.type='range'; zoomRange.min='0.30'; zoomRange.max='2.00'; zoomRange.step='0.01'; zoomRange.value=String(initMeta.z||1); zoomRange.setAttribute('data-photo-zoom','1');
    zoomLbl.appendChild(zoomRange); cropWrap.appendChild(zoomLbl);
    const oyLbl = document.createElement('label'); oyLbl.style.display='grid'; oyLbl.style.gap='4px'; oyLbl.innerHTML='<span>Dikey Ofset</span>';
    const oyRange = document.createElement('input'); oyRange.type='range'; oyRange.min='-160'; oyRange.max='160'; oyRange.step='1'; oyRange.value=String(initMeta.oy||0); oyRange.setAttribute('data-photo-oy','1');
    oyLbl.appendChild(oyRange); cropWrap.appendChild(oyLbl);
    const oxLbl = document.createElement('label'); oxLbl.style.display='grid'; oxLbl.style.gap='4px'; oxLbl.innerHTML='<span>Yatay Ofset</span>';
    const oxRange = document.createElement('input'); oxRange.type='range'; oxRange.min='-160'; oxRange.max='160'; oxRange.step='1'; oxRange.value=String(initMeta.ox||0); oxRange.setAttribute('data-photo-ox','1');
    oxLbl.appendChild(oxRange); cropWrap.appendChild(oxLbl);
    const circPrev = document.createElement('canvas'); circPrev.width=160; circPrev.height=160; circPrev.style.borderRadius='50%'; circPrev.style.border='1px solid #e5e7eb'; cropWrap.appendChild(circPrev);
    form.appendChild(cropWrap);

    let circImg = null;
    async function ensureCircImg(){
      if (circImg) return circImg;
      try{
        if (photoInput.files && photoInput.files[0]){
          circImg = await new Promise((res)=>{ const i=new Image(); i.onload=()=>res(i); try{i.src=URL.createObjectURL(photoInput.files[0]);}catch{res(null);} });
          return circImg;
        } else if (row.photo_url){
          const u = await resolveMemberPhotoUrl(row.photo_url);
          circImg = await new Promise((res)=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=u; });
          return circImg;
        }
      }catch{}
      return null;
    }
    async function drawCircPrev(){
      const ctx = circPrev.getContext('2d');
      ctx.clearRect(0,0,160,160);
      ctx.save(); ctx.beginPath(); ctx.arc(80,80,78,0,Math.PI*2); ctx.closePath(); ctx.clip();
      const img = await ensureCircImg();
      if (!img){ ctx.fillStyle='#e5e7eb'; ctx.fillRect(0,0,160,160); ctx.restore(); return; }
      const R = 78; const baseScale = Math.max((R*2)/img.width, (R*2)/img.height);
      let scale = baseScale * Number(zoomRange.value||1);
      if (img.width*scale < R*2 || img.height*scale < R*2) scale = baseScale;
      const w = img.width*scale, h = img.height*scale;
      const x = 80 - w/2 + Number(oxRange.value||0);
      const y = 80 - h/2 + Number(oyRange.value||0);
      try{ ctx.drawImage(img, x, y, w, h); }catch{}
      ctx.restore();
      ctx.beginPath(); ctx.arc(80,80,78,0,Math.PI*2); ctx.closePath(); ctx.strokeStyle='#0ea5b1'; ctx.lineWidth=3; ctx.stroke();
      ctx.beginPath(); ctx.arc(80,80,72,0,Math.PI*2); ctx.closePath(); ctx.strokeStyle='#fb923c'; ctx.lineWidth=2; ctx.stroke();
    }
    drawCircPrev();
    ;[zoomRange, oyRange, oxRange].forEach(el=> el.addEventListener('input', drawCircPrev));
    photoInput.addEventListener('change', ()=>{ circImg=null; ensureCircImg().then(()=>drawCircPrev()); try{ if (photoInput.files && photoInput.files[0]){ photoPrev.src = URL.createObjectURL(photoInput.files[0]); photoPrev.style.display='block'; } }catch{} });
    const docLabel = document.createElement('label'); docLabel.style.display='grid'; docLabel.style.gap='6px'; docLabel.innerHTML = '<span>Belgeler</span>';
    const docInput = document.createElement('input'); docInput.type='file'; docInput.multiple=true; docLabel.appendChild(docInput); form.appendChild(docLabel);

    const docsPrev = document.createElement('div');
    docsPrev.style.display='grid';
    docsPrev.style.gridTemplateColumns='repeat(auto-fill, minmax(120px, 1fr))';
    docsPrev.style.gap='8px';
    docsPrev.style.margin='6px 0 10px';
    form.appendChild(docsPrev);
    function isImg(url){ return /(\.png|\.jpe?g|\.gif|\.webp|\.bmp|\.svg)$/i.test(String(url||'')); }
    function fileName(url){ try{ const u=new URL(url, location.origin); return u.pathname.split('/').pop()||'dosya'; }catch{ const parts=String(url||'').split('/'); return parts[parts.length-1]||'dosya'; } }
    function renderExistingDocs(){
      docsPrev.innerHTML='';
      let arr=[]; try{ arr = JSON.parse(row.documents_urls||'[]'); if(!Array.isArray(arr)) arr=[]; }catch{}
      arr.forEach(url=>{
        const card = document.createElement('div'); card.className='card'; card.style.padding='6px'; card.style.display='flex'; card.style.flexDirection='column'; card.style.gap='6px';
        if (isImg(url)){
          const img = document.createElement('img'); img.alt=''; img.style.width='100%'; img.style.height='86px'; img.style.objectFit='cover'; img.style.borderRadius='8px';
          img.src = bust(url);
          card.appendChild(img);
        } else {
          const a=document.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent=fileName(url); a.style.wordBreak='break-all'; card.appendChild(a);
        }
        docsPrev.appendChild(card);
      });
    }
    renderExistingDocs();
    const docsNewPrevTitle = document.createElement('div'); docsNewPrevTitle.className='muted'; docsNewPrevTitle.textContent='Seçilen Belgeler (önizleme)'; docsNewPrevTitle.style.margin='6px 0 2px';
    const docsNewPrev = document.createElement('div');
    docsNewPrev.style.display='grid'; docsNewPrev.style.gridTemplateColumns='repeat(auto-fill, minmax(120px, 1fr))'; docsNewPrev.style.gap='8px';
    form.appendChild(docsNewPrevTitle); form.appendChild(docsNewPrev);
    function renderNewDocs(files){
      docsNewPrev.innerHTML='';
      const fs = Array.from(files||[]);
      fs.forEach(f=>{
        const card = document.createElement('div'); card.className='card'; card.style.padding='6px'; card.style.display='flex'; card.style.flexDirection='column'; card.style.gap='6px';
        if (/^image\//i.test(f.type)){
          const img = document.createElement('img'); img.alt=''; img.style.width='100%'; img.style.height='86px'; img.style.objectFit='cover'; img.style.borderRadius='8px';
          try{ img.src = URL.createObjectURL(f); }catch{}
          card.appendChild(img);
        } else {
          const span=document.createElement('span'); span.textContent=f.name; span.title=f.name; span.style.wordBreak='break-all'; card.appendChild(span);
        }
        docsNewPrev.appendChild(card);
      });
      docsNewPrevTitle.style.display = fs.length ? 'block' : 'none';
    }
    docsNewPrevTitle.style.display='none';
    docInput.addEventListener('change', ()=>{ renderNewDocs(docInput.files||[]); });

    const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button'; // avoid form submit
    saveBtn.className = 'btn btn-success';
    saveBtn.textContent = 'Kaydet';
    actions.appendChild(saveBtn);
    form.appendChild(actions);

    saveBtn.addEventListener('click', async (e)=>{
      e.preventDefault();
      const fd=new FormData(form);
      const payload={
        first_name: String(fd.get('first_name')||'').trim(),
        last_name: String(fd.get('last_name')||'').trim(),
        national_id: String(fd.get('national_id')||'').trim(),
        father_name: String(fd.get('father_name')||'').trim(),
        mother_name: String(fd.get('mother_name')||'').trim(),
        birth_place: String(fd.get('birth_place')||'').trim(),
        birth_date: String(fd.get('birth_date')||'').trim() || null,
        gender: String(fd.get('gender')||'').trim()||null,
        education: String(fd.get('education')||'').trim()||null,
        // Convert selected province/district IDs to names for storage
        work_province: null,
        work_district: null,
        institution_name: String(fd.get('institution_name')||'').trim(),
        corp_reg_no: String(fd.get('corp_reg_no')||'').trim(),
        title: String(fd.get('title')||'').trim(),
        blood_type: String(fd.get('blood_type')||'').trim()||null,
        retirement_no: String(fd.get('retirement_no')||'').trim(),
        ssk_no: String(fd.get('ssk_no')||'').trim(),
        email: String(fd.get('email')||'').trim().toLowerCase() || null, // Normalize optional email: lowercase and send null if empty
        phone: String(fd.get('phone')||'').trim(),
        join_date: String(fd.get('join_date')||'').trim() || new Date().toISOString().slice(0,10),
        leave_date: String(fd.get('leave_date')||'').trim() || null,
        status: String(fd.get('status')||'active')
      };
      // Generic cleanup: convert empty strings to null to avoid DB CHECK issues
      Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
      if (!payload.first_name || !payload.last_name) return alert('Ad ve Soyad zorunlu');

      // Resolve province/district NAMES from selected options (no extra round-trips)
      try{
        payload.work_province = provSel && provSel.value ? (provSel.selectedOptions[0]?.textContent || null) : null;
        payload.work_district = distSel && distSel.value ? (distSel.selectedOptions[0]?.textContent || null) : null;
      }catch{}

      // Basic client-side validations
      if (payload.national_id){
        if (!/^\d{11}$/.test(payload.national_id)) return alert('TC Kimlik No 11 haneli olmalı');
      }
      // Phone normalize for DB check: expect exactly 10 digits and store as +90XXXXXXXXXX
      if (payload.phone){
        let d = String(payload.phone||'').replace(/\D/g,'');
        if (d.startsWith('90')) d = d.slice(2);
        if (d.startsWith('0')) d = d.slice(1);
        d = d.slice(0,10);
        if (d.length === 10){
          payload.phone = '+90' + d;
        } else {
          payload.phone = null; // let DB accept null if user didn't provide full number
        }
      }
      if (payload.phone === null) { delete payload.phone; }
      // Email normalize strictly before regex: NFKC, strip whitespace/zero-width, lowercase
      if (payload.email){
        try{
          const cleaned = String(payload.email)
            .normalize('NFKC')
            .replace(/[\s\u00A0\u200B-\u200D\uFEFF]/g, '')
            .toLowerCase();
          payload.email = cleaned || null;
        }catch{ payload.email = String(payload.email||'').trim().toLowerCase() || null; }
      }
      if (payload.email && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(payload.email)) return alert('Geçerli bir e‑posta giriniz');
      if (payload.email === null) { delete payload.email; }

      // Handle uploads: photo and documents
      try{
        // Photo: preserve existing if none selected
        let photoUrl = row.photo_url || null;
        const fileInput = form.querySelector('input[type="file"]');
        const readPhotoMeta = () => {
          const zEl = form.querySelector('[data-photo-zoom]');
          const oxEl = form.querySelector('[data-photo-ox]');
          const oyEl = form.querySelector('[data-photo-oy]');
          const z = Number((zEl && zEl.value) || 1);
          const ox = Number((oxEl && oxEl.value) || 0);
          const oy = Number((oyEl && oyEl.value) || 0);
          return { z, ox, oy };
        };
        const photoMeta = readPhotoMeta();
        if (fileInput.files && fileInput.files[0]) {
          const file = fileInput.files[0];
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}.${fileExt}`;
          const filePath = fileName;
          // Store only the object key; previews will resolve with a signed URL if needed
          const key = await uploadToBucket(file, filePath);
          photoUrl = buildPhotoValue(key, photoMeta);
        }
        // Normalize legacy full public URLs to keys and attach current meta
        if (photoUrl && /^https?:\/\//i.test(photoUrl)){
          const m = String(photoUrl).match(/\/storage\/v1\/object\/(public|authenticated)\/member-photos\/([^?]+)/);
          if (m && m[1] && m[2]) photoUrl = buildPhotoValue(decodeURIComponent(m[2]), photoMeta);
        }
        // If no new file but sliders changed, persist meta on existing key
        if (!fileInput.files?.length && row.photo_url){
          const existingKey = stripPhotoKey(row.photo_url);
          photoUrl = buildPhotoValue(existingKey, photoMeta);
        }
        payload.photo_url = photoUrl;

        // Documents: start with existing list
        let documentsUrls = [];
        try{ documentsUrls = JSON.parse(row.documents_urls||'[]'); if(!Array.isArray(documentsUrls)) documentsUrls=[]; }catch{}
        const filesDocs = docInput.files ? Array.from(docInput.files) : [];
        for (const f of filesDocs){
          const fileExt = f.name.split('.').pop();
          const fileName = `${Date.now()}.${fileExt}`;
          const filePath = `member-docs/${fileName}`;
          const url = await uploadToBucketGeneric(f, 'member-docs', filePath);
          if (url) documentsUrls.push(url);
        }
        payload.documents_urls = JSON.stringify(documentsUrls);
      }catch(upErr){ console.warn('upload failed', upErr); }

      let resp;
if (editing && editing.id) {
  // Mevcut üye: UPDATE
  resp = await sb().from('members')
    .update(payload)
    .eq('id', editing.id)
    .select('id')
    .maybeSingle();
} else {
  // Yeni üye: INSERT
  resp = await sb().from('members')
    .insert(payload)
    .select('id')
  .maybeSingle();
}

if (resp.error) {
  const msg = String(resp.error?.message || '').toLowerCase();
  const code = String(resp.error?.code || '');
  if (code === '23505' || /uq_members_national_id|unique|duplicate key/.test(msg)) {
    alert('Bu TC Kimlik No başka bir üyede zaten kayıtlı.');
  } else {
    alert('Kaydetme hatası: ' + (resp.error.message || String(resp.error)));
  }
  return;
}

// Başarılıysa kapat ve listeyi yenile
closeModal();
await loadAdminMembers();
    });

    (typeof openModal === 'function' ? openModal() : (window.openModal && window.openModal()));
  }

  async function sendDigitalIdCard(memberId){
    // Sends request to Edge Function to email the rendered card
    try{
      const { data: m } = await sb().from('members').select('*').eq('id', memberId).maybeSingle();
      if (!m) throw new Error('Üye bulunamadı');
  //    const { data: s } = await sb().from('settings').select('value').eq('key','email_edge_url').maybeSingle();
  //    const edgeUrl = s?.value || '';
  //    if (!edgeUrl) throw new Error('E-posta gönderim servisi yapılandırılmamış (email_edge_url).');
      const imgData = window.__idcardLastPng || null;
      const payload = { type:'digital_id', member: m, image_base64: imgData };
      const { data, error } = await window.ilkeSupabase.functions.invoke('idcard', {
        body: payload
      });
      if (error) {
        throw new Error('Sunucu hatası: ' + (error.message || JSON.stringify(error)));
      }
    }catch(e){ throw e; }
  }

  // Show member ID card: Canvas render using PSD-exported background, logo overlays, QR and join date
  function openIdCardPreview(member){
    try{
      $modalTitle().textContent = 'Dijital Kimlik';
      const form = $modalForm(); form.innerHTML='';
      const wrap = document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='12px';
      form.appendChild(wrap);
      const canvas = document.createElement('canvas'); canvas.width = 638; canvas.height = 1012; canvas.style.maxWidth='100%'; canvas.style.borderRadius='12px'; canvas.style.border='1px solid #e5e7eb'; wrap.appendChild(canvas);
      const actions = document.createElement('div'); actions.style.display='flex'; actions.style.flexWrap='wrap'; actions.style.gap='8px'; wrap.appendChild(actions);
      const sendBtn = document.createElement('button'); sendBtn.className='btn btn-success'; sendBtn.textContent='E‑posta ile Gönder';
      const dlBtn = document.createElement('button'); dlBtn.className='btn btn-primary'; dlBtn.textContent='JPEG İndir';
      const printBtn = document.createElement('button'); printBtn.className='btn btn-primary'; printBtn.textContent='Yazdır';
      const closeBtn = document.createElement('button'); closeBtn.className='btn btn-danger'; closeBtn.textContent='Kapat';
      actions.appendChild(sendBtn); actions.appendChild(dlBtn); actions.appendChild(printBtn); actions.appendChild(closeBtn);

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';

      (async ()=>{
        // Decide style: PSD if idcard_bg_url is set and idcard_style != 'vector'; otherwise draw vector theme
        let bgUrl = await getSettingValue('idcard_bg_url');
        if (!bgUrl) { bgUrl = 'edge/idcard/id_card.png'; } // default to provided template
        const stylePref = (await getSettingValue('idcard_style')) || '';
        const useVector = (!bgUrl || String(stylePref).toLowerCase() === 'vector') ? true : false;

        // Common settings
        const companyName = (await getSettingValue('company_name')) || (await getSettingValue('site_name')) || '';
        const companyTag = (await getSettingValue('company_tagline')) || (await getSettingValue('site_tagline')) || '';
        let logoUrl = await getSettingValue('logo_url'); if(!logoUrl){ logoUrl = await getSettingValue('footer_logo_url'); }

        // Colors similar to sample
        const C_TEAL = '#0ea5b1';
        const C_ORANGE = '#fb923c';
        const C_TEXT = '#0f172a';
        const C_MUTED = '#6b7280';

        // Background + rounded corners clip (exported PNG is also rounded)
        ctx.clearRect(0,0,canvas.width,canvas.height);
        // Clip entire card to rounded rect
        ctx.save();
        roundRect(ctx, 0, 0, canvas.width, canvas.height, 24);
        ctx.clip();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0,0,canvas.width,canvas.height);

        if (!useVector){
          // Draw the PNG template exactly as background
          try{ const bg=await loadImg(bust(bgUrl)); ctx.drawImage(bg,0,0,canvas.width,canvas.height);}catch{}
        } else {
          // Draw vector waves adapted for vertical card
          // Top wave (teal)
          ctx.save();
          const gradTop = ctx.createLinearGradient(0,0,canvas.width,0);
          gradTop.addColorStop(0, '#14b8a6'); gradTop.addColorStop(1, '#0ea5b1');
          ctx.fillStyle = gradTop;
          ctx.beginPath();
          ctx.moveTo(0, 110);
          ctx.bezierCurveTo(canvas.width*0.15, 40, canvas.width*0.7, 170, canvas.width, 100);
          ctx.lineTo(canvas.width, 0);
          ctx.lineTo(0, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // Middle wave (orange)
          ctx.save();
          const gradMid = ctx.createLinearGradient(0,0,canvas.width,0);
          gradMid.addColorStop(0, '#fdba74'); gradMid.addColorStop(1, C_ORANGE);
          ctx.fillStyle = gradMid;
          ctx.beginPath();
          ctx.moveTo(0, canvas.height*0.42);
          ctx.bezierCurveTo(canvas.width*0.25, canvas.height*0.50, canvas.width*0.7, canvas.height*0.35, canvas.width, canvas.height*0.46);
          ctx.lineTo(canvas.width, canvas.height*0.58);
          ctx.bezierCurveTo(canvas.width*0.7, canvas.height*0.48, canvas.width*0.25, canvas.height*0.64, 0, canvas.height*0.56);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // Bottom accent ribbon
          ctx.save();
          ctx.fillStyle = C_ORANGE;
          ctx.beginPath();
          ctx.moveTo(0, canvas.height-52);
          ctx.lineTo(80, canvas.height);
          ctx.lineTo(0, canvas.height);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        // Small logo plate at top-left (white plate with logo)
        try{
          if (logoUrl){
            const lg=await loadImg(bust(logoUrl));

            const lx = 26, ly = 100, lr = 56; // konum ve yarıçap
            // Daire kırp
            ctx.save();
            ctx.beginPath();
            ctx.arc(lx + lr, ly + lr, lr, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();

            // Görseli hafif taşırarak çiz: şeffaf padding olsa bile daireyi tam doldursun
            ctx.drawImage(lg, lx - 6, ly - 6, lr * 2 + 12, lr * 2 + 12);
            ctx.restore();
          
            // Border yok (çerçeveyi tamamen kaldırdık)
           }
        }catch{}
          // Headings: first two orange, third teal 'İLKE-SEN'
         // Logoyla çakışmayı önlemek için min sol kenar: logo sağ ucu + 8px
        const baseX = canvas.width / 2 + 20;
        const lx = 26, ly = 100, lr = 56;                 // logo konumları (yukarıda kullandıklarımız)
        const circleRight = lx + lr * 2;
        const minLeft = circleRight + 8;                  // metnin sol kenarı en az bu değerin sağında olmalı

        function centeredX(text) {
          // Ölç ve gerekirse merkezi sağa kaydır
          const w = ctx.measureText(text).width;
          return Math.max(baseX, minLeft + w / 2);
        }

        ctx.textAlign = 'center';

        // İLKE-SEN – biraz daha yukarı
        ctx.fillStyle = C_TEAL;
        ctx.font = 'bold 42px Inter, Arial, sans-serif';
        ctx.fillText('İLKE-SEN', centeredX('İLKE-SEN'), ly + lr - 28);

        // Turuncu başlık 1 – logonun yatay merkezine hizalı (ly + lr)
        ctx.fillStyle = C_ORANGE;
        ctx.font = 'bold 20px Inter, Arial, sans-serif';
        const line1 = 'İLKELİ YEREL YÖNETİM HİZMETLERİ KOLU';
        ctx.fillText(line1, centeredX(line1), ly + lr);        // 156

        // Turuncu başlık 2 – 1. satırın altına
        const line2 = 'KAMU GÖREVLİLERİ SENDİKASI';
        ctx.fillText(line2, centeredX(line2), ly + lr + 26);   // 182
                          
        // Photo circle centered (continues…)
        const photoCX = canvas.width/2;
        // Match template circular hole (bigger, slightly lower) and eliminate edge gaps
        const photoCY = useVector ? 338 : 432;
        const photoR = useVector ? 84 : 180; // significantly increased to fill the frame
        ctx.save();
        if (useVector){
          ctx.beginPath(); ctx.arc(photoCX, photoCY, photoR+10, 0, Math.PI*2); ctx.closePath(); ctx.strokeStyle=C_TEAL; ctx.lineWidth=6; ctx.stroke();
          ctx.beginPath(); ctx.arc(photoCX, photoCY, photoR+2, 0, Math.PI*2); ctx.closePath(); ctx.strokeStyle=C_ORANGE; ctx.lineWidth=4; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(photoCX, photoCY, photoR, 0, Math.PI*2); ctx.closePath(); ctx.clip();
        try{
          if (member.photo_url){
            const meta = parsePhotoMeta(member.photo_url);
            const src = await resolveMemberPhotoUrl(member.photo_url);
            const ph = await loadImg(src);
            const baseScale = Math.max((photoR*2) / ph.width, (photoR*2) / ph.height);
            let scale = baseScale * (Number(meta.z)||1);
            if (ph.width * scale < photoR*2 || ph.height * scale < photoR*2){ scale = baseScale; }
            const newWidth = ph.width * scale;
            const newHeight = ph.height * scale;
            // Scale offsets from preview (R=78) to actual card radius
            const offScale = photoR / 78; // preview used 160x160 circle with R=78
            const offX = (Number(meta.ox)||0) * offScale;
            const offY = (Number(meta.oy)||0) * offScale;
            const x = photoCX - (newWidth / 2) + offX;
            const y = photoCY - (newHeight / 2) + offY;
            // Draw the photo
            ctx.drawImage(ph, x, y, newWidth, newHeight);
          }
          else { ctx.fillStyle='#e5e7eb'; ctx.fillRect(photoCX-photoR, photoCY-photoR, photoR*2, photoR*2); }
        }catch{ ctx.fillStyle='#e5e7eb'; ctx.fillRect(photoCX-photoR, photoCY-photoR, photoR*2, photoR*2); }
        ctx.restore();
        // Ensure a visible circular frame on template mode as well
        if (!useVector){
          ctx.save();
          // outer white halo for contrast
          ctx.beginPath(); ctx.arc(photoCX, photoCY, photoR+3, 0, Math.PI*2); ctx.closePath();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.stroke();
          // teal ring
          ctx.beginPath(); ctx.arc(photoCX, photoCY, photoR+1, 0, Math.PI*2); ctx.closePath();
          ctx.strokeStyle = C_TEAL; ctx.lineWidth = 4; ctx.stroke();
          // inner orange ring
          ctx.beginPath(); ctx.arc(photoCX, photoCY, photoR-4, 0, Math.PI*2); ctx.closePath();
          ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 3; ctx.stroke();
          ctx.restore();
        }
        // Name area: in template we only print texts (no banner), in vector we draw banner
        ctx.textAlign='center';
        if (useVector){
          const bannerW = canvas.width - 120, bannerH = 54, bannerX=(canvas.width-bannerW)/2, bannerY=photoCY+photoR+24;
          ctx.save(); roundRect(ctx, bannerX, bannerY, bannerW, bannerH, 10); ctx.clip();
          ctx.fillStyle=C_TEAL; ctx.fill(); ctx.restore();
          ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px Inter, Arial, sans-serif';
          ctx.fillText(`${(member.first_name||'').toUpperCase()} ${(member.last_name||'').toUpperCase()}`.trim(), canvas.width/2, bannerY+34);
          if (member.title){ ctx.fillStyle = C_ORANGE; ctx.font='bold 22px Inter, Arial, sans-serif'; ctx.fillText(String(member.title).toUpperCase(), canvas.width/2, bannerY+58); }
        } else {
          // Shifted further down by ~24px from previous
          ctx.fillStyle = C_TEAL; ctx.font = 'bold 28px Inter, Arial, sans-serif';
          ctx.fillText(`${(member.first_name||'').toUpperCase()} ${(member.last_name||'').toUpperCase()}`.trim(), canvas.width/2, photoCY+photoR+88);
          if (member.title){ ctx.fillStyle = C_ORANGE; ctx.font='bold 22px Inter, Arial, sans-serif'; ctx.fillText(String(member.title).toUpperCase(), canvas.width/2, photoCY+photoR+114); }
        }
        // Details and QR: if vector, draw white card; if template, print directly in template box
        const uyelik = member.join_date ? new Date(member.join_date).toLocaleDateString('tr-TR') : '-';
        if (useVector){
          const cardX=32, cardY=(photoCY+photoR+24)+54+78, cardW=canvas.width-64, cardH=260;
          ctx.save(); roundRect(ctx, cardX, cardY, cardW, cardH, 12); ctx.fillStyle='#ffffff'; ctx.fill(); ctx.strokeStyle='#e5e7eb'; ctx.lineWidth=1; ctx.stroke(); ctx.restore();
          ctx.textAlign='left'; const pad=16; const leftX=cardX+pad; let lineY=cardY+36;
          ctx.fillStyle=C_ORANGE; ctx.font='bold 18px Inter, Arial, sans-serif'; ctx.fillText('Üye Numarası', leftX, lineY); ctx.fillStyle=C_TEXT; ctx.font='18px Inter, Arial, sans-serif'; ctx.fillText(`: ${member.member_no||'-'}`, leftX+140, lineY);
          lineY+=32; ctx.fillStyle=C_ORANGE; ctx.font='bold 18px Inter, Arial, sans-serif'; ctx.fillText('Üyelik Tarihi', leftX, lineY); ctx.fillStyle=C_TEXT; ctx.font='18px Inter, Arial, sans-serif'; ctx.fillText(`: ${uyelik}`, leftX+140, lineY);
          lineY+=32; ctx.fillStyle=C_ORANGE; ctx.font='bold 18px Inter, Arial, sans-serif'; ctx.fillText('TC. No', leftX, lineY); ctx.fillStyle=C_TEXT; ctx.font='18px Inter, Arial, sans-serif'; ctx.fillText(`: ${member.national_id||'-'}`, leftX+140, lineY);
          try{
            async function buildVerifyUrl(){
              try{
                const base = (await getSettingValue('verify_base_url')) || '';
                const fallbackBase = location.origin + '/verify.html';
                let page = base && /^https?:\/\//i.test(base) ? base : fallbackBase;
                const u = new URL(page, location.origin);
                if (!/verify\.html$/i.test(u.pathname)) u.pathname = u.pathname.replace(/\/$/, '') + '/verify.html';
                if (member.verify_token) { u.searchParams.set('t', member.verify_token); }
                else { u.searchParams.set('id', member.id); }
                return u.toString();
              }catch{ return location.origin + '/verify.html?id=' + encodeURIComponent(member.id); }
            }
            const url = await buildVerifyUrl();

const qrSize = 160;
const padBR = 28;
const cb = Date.now() + '-' + encodeURIComponent(member.verify_token || member.id); // cache-buster
const qr = await loadImg(`https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&margin=0&data=${encodeURIComponent(url)}&cb=${cb}`);
const qx = canvas.width - padBR - qrSize, qy = canvas.height - padBR - qrSize;
ctx.drawImage(qr, qx, qy, qrSize, qrSize);}catch{}
        } else {
          // template coordinates (shifted further down by ~24px)
          ctx.textAlign='left'; let leftX=64, lineY=808; // two more lines down (2 x 32px)
          ctx.fillStyle=C_ORANGE; ctx.font='bold 18px Inter, Arial, sans-serif'; ctx.fillText('Üye Numarası', leftX, lineY); ctx.fillStyle=C_TEXT; ctx.font='18px Inter, Arial, sans-serif'; ctx.fillText(`: ${member.member_no||'-'}`, leftX+140, lineY);
          lineY+=32; ctx.fillStyle=C_ORANGE; ctx.font='bold 18px Inter, Arial, sans-serif'; ctx.fillText('Üyelik Tarihi', leftX, lineY); ctx.fillStyle=C_TEXT; ctx.font='18px Inter, Arial, sans-serif'; ctx.fillText(`: ${uyelik}`, leftX+140, lineY);
          lineY+=32; ctx.fillStyle=C_ORANGE; ctx.font='bold 18px Inter, Arial, sans-serif'; ctx.fillText('TC. No', leftX, lineY); ctx.fillStyle=C_TEXT; ctx.font='18px Inter, Arial, sans-serif'; ctx.fillText(`: ${member.national_id||'-'}`, leftX+140, lineY);
          try{
            async function buildVerifyUrl(){
              try{
                const base = (await getSettingValue('verify_base_url')) || '';
                const fallbackBase = location.origin + '/verify.html';
                let page = base && /^https?:\/\//i.test(base) ? base : fallbackBase;
                const u = new URL(page, location.origin);
                if (!/verify\.html$/i.test(u.pathname)) u.pathname = u.pathname.replace(/\/$/, '') + '/verify.html';
                if (member.verify_token) { u.searchParams.set('t', member.verify_token); }
                else { u.searchParams.set('id', member.id); }
                return u.toString();
              }catch{ return location.origin + '/verify.html?id=' + encodeURIComponent(member.id); }
            }
            const url = await buildVerifyUrl();

const qrSize = 160;
const padBR = 28;
const cb = Date.now() + '-' + encodeURIComponent(member.verify_token || member.id); // cache-buster
const qr = await loadImg(`https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&margin=0&data=${encodeURIComponent(url)}&cb=${cb}`);
const qx = canvas.width - padBR - qrSize, qy = canvas.height - padBR - qrSize;
ctx.drawImage(qr, qx, qy, qrSize, qrSize);}catch{}
        }
        // finalize snapshot
        try{ window.__idcardLastPng = canvas.toDataURL('image/jpeg', 0.92); }catch{}
      })();
      function roundRect(ctx,x,y,w,h,r){ r=Math.min(r,w/2,h/2); ctx.save(); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath(); }
      function loadImg(src){ return new Promise((res,rej)=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=rej; i.src=src; }); }
      function fileName(url){ try{ const u=new URL(url, location.origin); return u.pathname.split('/').pop()||'dosya'; }catch{ const parts=String(url||'').split('/'); return parts[parts.length-1]||'dosya'; } }
      function renderExistingDocs(){
        docsPrev.innerHTML='';
        let arr=[]; try{ arr = JSON.parse(row.documents_urls||'[]'); if(!Array.isArray(arr)) arr=[]; }catch{}
        arr.forEach(url=>{
          const card = document.createElement('div'); card.className='card'; card.style.padding='6px'; card.style.display='flex'; card.style.flexDirection='column'; card.style.gap='6px';
          if (isImg(url)){
            const img = document.createElement('img'); img.alt=''; img.style.width='100%'; img.style.height='86px'; img.style.objectFit='cover'; img.style.borderRadius='8px';
            img.src = bust(url);
            card.appendChild(img);
          } else {
            const a=document.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent=fileName(url); a.style.wordBreak='break-all'; card.appendChild(a);
          }
          docsPrev.appendChild(card);
        });
      }
      dlBtn.addEventListener('click',(e)=>{ e.preventDefault(); try{ const data=canvas.toDataURL('image/jpeg', 0.92); try{ window.__idcardLastPng = data; }catch{} const a=document.createElement('a'); a.download=`kimlik_${member.member_no||member.id||'uye'}.jpg`; a.href=data; a.click(); }catch{} });
      printBtn.addEventListener('click',(e)=>{ e.preventDefault(); try{ const w=window.open('','_blank'); if(!w) return; const data=canvas.toDataURL('image/jpeg', 0.92); try{ window.__idcardLastPng = data; }catch{} w.document.write(`<img src="${data}" style="max-width:100%" onload="window.print();setTimeout(()=>window.close(),300);"/>`); w.document.close(); }catch{} });
      sendBtn.addEventListener('click', async (e)=>{ e.preventDefault(); try{ window.__idcardLastPng = canvas.toDataURL('image/jpeg', 0.92); await sendDigitalIdCard(member.id); closeModal(); alert('Kimlik gönderim kuyruğa alındı.'); }catch(err){ alert('Kimlik gönderilemedi: ' + (err?.message||String(err))); } });
      closeBtn.addEventListener('click', (e)=>{ e.preventDefault(); closeModal(); });

      (typeof openModal === 'function' ? openModal() : (window.openModal && window.openModal()));
    }catch(e){ alert('Kimlik önizleme açılamadı: ' + (e?.message||String(e))); }
  }

  // Settings helper
  async function getSettingValue(key){
    try{ const { data } = await sb().from('settings').select('value').eq('key', key).maybeSingle(); return data?.value || ''; }catch{ return ''; }
  }

  // ========== SETTINGS ==========
  async function loadSettingsForm(){
    const panel = qs('#tab-settings'); if (!panel) return;
    // Try to find an existing form area; otherwise create one lightly
    let form = panel.querySelector('form');
    if (!form){
      form = document.createElement('form');
      form.id = 'settingsForm';
      form.style.display='grid'; form.style.gap='10px';
      panel.appendChild(form);
      const note = document.createElement('div'); note.className='muted'; note.textContent = 'Ayarlar'; form.appendChild(note);
    }

    // Fetch settings and populate matching inputs by name
    let rows = [];
    try{
      const { data, error } = await sb().from('settings').select('key, value');
      if (error) throw error;
      rows = data || [];
    }catch(e){ alert('Ayarlar yüklenemedi: ' + (e?.message||String(e))); }
    const byKey = new Map(rows.map(r=>[String(r.key), r.value]));

    // Helpers
    const norm = (s)=>String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
    const labelToKey = new Map(Object.entries({
      'recaptcha site key':'recaptcha_site_key',
      'recaptcha secret key':'recaptcha_secret_key',
      'kurum adı':'company_name',
      'slogan':'company_tagline',
      'logo url':'logo_url',
      'kart stili':'idcard_style',
      'kart arkaplan png (şablon yolu)':'idcard_bg_url',
      'doğrulama sayfası url (verify.html)':'verify_base_url'   // <-- EKLE
    }));
    labelToKey.set('e-posta gönderim servisi url (idcard)', 'email_edge_url');
    const findBtnByText = (text)=>{
      const t = norm(text);
      return Array.from(panel.querySelectorAll('button, input[type="button"], input[type="submit"]')).find(b=>norm(b.textContent||b.value)===t);
    };

    // Populate any input/select/textarea that has a name matching the key
    const inputs = Array.from(panel.querySelectorAll('input, select, textarea'));
    const bound = new Set();
    inputs.forEach(el => {
      const key = el.getAttribute('name') || el.getAttribute('data-setting') || el.id;
      if (!key) return;
      bound.add(el);
      const val = byKey.has(key) ? byKey.get(key) : '';
      if (el.type === 'checkbox'){
        el.checked = val === true || val === 'true' || val === '1' || val === 1;
      } else if (el.type === 'radio'){
        if (String(el.value) === String(val)) el.checked = true;
      } else if (val != null){
        el.value = String(val);
      }
    });
    // Populate via labels if inputs have no name/id
    Array.from(panel.querySelectorAll('label')).forEach(lbl =>{
      const k = labelToKey.get(norm(lbl.textContent)); if (!k) return;
      const el = lbl.querySelector('input,select,textarea'); if (!el || bound.has(el)) return;
      const val = byKey.has(k) ? byKey.get(k) : '';
      if (el.type === 'checkbox') el.checked = val === true || val === 'true' || val === '1' || val === 1;
      else if (el.type === 'radio'){ if (!el.checked) return; el.checked = String(el.value) === String(val); }
      else if (val != null) el.value = String(val);
      el.setAttribute('data-setting', k);
      bound.add(el);
    });

    // Ensure common fields exist visually (so they appear even if not in HTML)
    const ensureField = (label, name, type='text', placeholder='') => {
      if (form.querySelector(`[name="${name}"]`)) return;
      const row = document.createElement('label');
      row.style.display='grid';
      row.style.gap='6px';
      row.innerHTML = `<span style="font-weight:600">${label}</span>`;
      const input = document.createElement(type==='select'?'select':'input');
      if (type==='select'){
        const opt1=document.createElement('option'); opt1.value=''; opt1.textContent='Varsayılan';
        const opt2=document.createElement('option'); opt2.value='vector'; opt2.textContent='Vector (Önerilir)';
        const opt3=document.createElement('option'); opt3.value='psd'; opt3.textContent='Arkaplan (PSD PNG)';
        input.appendChild(opt1); input.appendChild(opt2); input.appendChild(opt3);
      } else { input.type='text'; input.placeholder=placeholder; }
      input.name = name;
      input.style.padding='8px';
      input.style.border='1px solid #e5e7eb';
      input.style.borderRadius='6px';
      row.appendChild(input);
      form.appendChild(row);
    };
    ensureField('Kurum Adı', 'company_name');
    ensureField('Slogan', 'company_tagline');
    ensureField('Logo URL', 'logo_url');
    ensureField('Kart Stili', 'idcard_style', 'select');
    ensureField('Kart Arkaplan PNG (şablon yolu)', 'idcard_bg_url');
    ensureField('Doğrulama Sayfası URL (verify.html)', 'verify_base_url', 'text', 'https://ilkesen.org.tr/verify.html');
    ensureField('E‑posta Gönderim Servisi URL (ID Kart)', 'email_edge_url', 'text', 'https://YOUR-PROJECT-REF.functions.supabase.co/idcard');
    // verify_base_url alanı populate turundan sonra oluşturulduğu için burada set ediyoruz
    try {
      const el = form.querySelector('input[name="verify_base_url"]');
      if (el && byKey.has('verify_base_url')) {
        el.value = String(byKey.get('verify_base_url') || '');
        el.setAttribute('data-setting', 'verify_base_url');
      }
    } catch {}
    // Wire Save and Reload buttons if exist
    const saveBtn = panel.querySelector('#settingsSaveBtn') || panel.querySelector('button[data-action="save-settings"]') || findBtnByText('kaydet');
    const reloadBtn = panel.querySelector('#settingsReloadBtn') || panel.querySelector('button[data-action="reload-settings"]') || findBtnByText('yenile');
    if (reloadBtn && !reloadBtn.dataset.wired){ reloadBtn.dataset.wired='1'; reloadBtn.addEventListener('click', (e)=>{ e.preventDefault(); loadSettingsForm(); }); }
    if (saveBtn && !saveBtn.dataset.wired){
      saveBtn.dataset.wired='1';
      saveBtn.addEventListener('click', async (e)=>{
        e.preventDefault();
        // collect values
        const els = Array.from(panel.querySelectorAll('input, select, textarea'));
        const used = new Set();
        const payload = [];
        els.forEach(el => {
          let key = el.getAttribute('name') || el.getAttribute('data-setting') || el.id;
          if (!key){
            const lbl = el.closest('label'); if (lbl){ const lk = labelToKey.get(norm(lbl.textContent)); if (lk){ key = lk; el.setAttribute('data-setting', lk); } }
          }
          if (!key || used.has(key)) return; used.add(key);
          let value;
          if (el.type === 'checkbox') value = el.checked ? 'true' : 'false';
          else if (el.type === 'radio'){ if (!el.checked) return; value = el.value; }
          else value = el.value;
          payload.push({ key, value });
        });
        try{
          const { error } = await sb().from('settings').upsert(payload, { onConflict: 'key' });
          if (error) throw error;
          alert('Ayarlar kaydedildi');
          await loadSettingsForm();
        }catch(err){ alert('Ayarlar kaydedilemedi: ' + (err?.message||String(err))); }
      });
    }
    try {
      const el2 = form.querySelector('input[name="email_edge_url"]');
      if (el2 && byKey.has('email_edge_url')) {
        el2.value = String(byKey.get('email_edge_url') || '');
        el2.setAttribute('data-setting', 'email_edge_url');
      }
    } catch {}
  }

  // ========== PAGES ==========
  async function loadAdminPages(){
    const tbody = qs('#pagesTableBody'); if (!tbody) return; tbody.innerHTML='';
    try{
      const table = tbody.closest('table');
      const headRow = table && table.tHead && table.tHead.rows && table.tHead.rows[0];
      if (headRow){
        headRow.innerHTML = `
          <th>Başlık</th>
          <th>Slug</th>
          <th>Durum</th>
          <th>Yayınlanma Tarihi</th>
          <th>Yayından Kaldırılma Tarihi</th>
          <th>İşlem</th>
        `;
      }
    }catch{}
    try{
      const { data, error } = await sb()
        .from('pages')
        .select('id, title, slug, status, published_at, unpublish_at')
        .order('title', { ascending: true });
      if (error) throw error;
      (data||[]).forEach(row => {
        const tr = document.createElement('tr');
        const statusMap = { published:'Yayımlandı', draft:'Taslak', scheduled:'Planlı', archived:'Arşivli', unpublished:'Yayından Kaldırıldı' };
        const statusTr = statusMap[String(row.status||'').toLowerCase()] || (row.status||'');
        tr.innerHTML = `
          <td>${escapeHtml(row.title||'')}</td>
          <td>${escapeHtml(row.slug||'')}</td>
          <td>${escapeHtml(statusTr)}</td>
          <td>${row.published_at ? new Date(row.published_at).toLocaleString('tr-TR') : '-'}</td>
          <td>${row.unpublish_at ? new Date(row.unpublish_at).toLocaleString('tr-TR') : '-'}</td>
          <td class="actions">
            <button class="btn btn-warning" data-edit-page="${row.id}">Düzenle</button>
          </td>`;
        tbody.appendChild(tr);
      });
       // Wire: Yeni Sayfa
    const addBtn = qs('#newPageBtn'); if (addBtn && !addBtn.dataset.wired){ addBtn.dataset.wired='1'; addBtn.onclick = ()=> openPageModal({ id:null, title:'', slug:'', status:'draft' }); }
      wirePagesRowActions();
    }catch(e){ alert('Sayfalar yüklenemedi: ' + (e?.message||String(e))); }
  }

  function wirePagesRowActions(){
    try{
      const tbody = qs('#pagesTableBody'); if (!tbody) return;

      // Edit
      tbody.querySelectorAll('button[data-edit-page]').forEach(btn=>{
        if (btn.dataset.wired) return; btn.dataset.wired='1';
        btn.addEventListener('click', async ()=>{
          const id = btn.getAttribute('data-edit-page');
          try{
            const { data } = await sb().from('pages').select('*').eq('id', id).maybeSingle();
            openPageModal(data||{ id, title:'', slug:'', status:'draft', body:'', published_at:null, unpublish_at:null });
          }catch(e){ alert('Sayfa yüklenemedi: ' + (e?.message||String(e))); }
        });
      });
    }catch{}
  }
  

  function openPageModal(row){
    try{
      row = row || { id:null, title:'', slug:'', status:'draft', body:'', published_at:null, unpublish_at:null };
      $modalTitle().textContent = row.id ? 'Sayfayı Düzenle' : 'Yeni Sayfa';
      const form = $modalForm(); form.innerHTML='';

      // Title
      const tLbl=document.createElement('label'); tLbl.style.display='grid'; tLbl.style.gap='6px'; tLbl.innerHTML='<span>Başlık</span>'; const tIn=document.createElement('input'); tIn.value=row.title||''; tLbl.appendChild(tIn); form.appendChild(tLbl);

      // Slug
      const sLbl=document.createElement('label'); sLbl.style.display='grid'; sLbl.style.gap='6px'; sLbl.innerHTML='<span>Slug</span>'; const sIn=document.createElement('input'); sIn.value=row.slug||''; sLbl.appendChild(sIn); form.appendChild(sLbl);

      // Body editor: Word-like toolbar + contentEditable area
      const bLbl=document.createElement('label'); bLbl.style.display='grid'; bLbl.style.gap='6px'; bLbl.innerHTML='<span>İçerik</span>';
      const tb=document.createElement('div'); tb.style.display='flex'; tb.style.flexWrap='wrap'; tb.style.gap='6px'; tb.style.margin='6px 0';
      const ed=document.createElement('div'); ed.contentEditable='true'; ed.className='card'; ed.style.minHeight='240px'; ed.style.padding='10px'; ed.style.overflow='auto'; ed.innerHTML = (row.body||'');
      function btn(label, title, on){ const b=document.createElement('button'); b.type='button'; b.className='btn btn-outline'; b.textContent=label; b.title=title; b.style.padding='6px 10px'; b.addEventListener('click', (e)=>{ e.preventDefault(); on(); ed.focus(); }); return b; }
      function applyInlineStyle(prop, val){
        const sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        if (range.collapsed){
          const span=document.createElement('span'); span.style[prop]=val; span.appendChild(document.createTextNode('\u200b'));
          range.insertNode(span); sel.removeAllRanges(); const r=document.createRange(); r.selectNodeContents(span); r.collapse(false); sel.addRange(r);
        } else {
          const span=document.createElement('span'); span.style[prop]=val; try{ range.surroundContents(span); }catch{ document.execCommand('foreColor'); }
        }
      }
      function applyBlock(cmd){ document.execCommand(cmd,false,null); }
      // Font family
      const ff=document.createElement('select'); ff.className='btn btn-outline'; ['Default','Arial','Georgia','Tahoma','Times New Roman','Verdana','Courier New'].forEach(f=>{ const o=document.createElement('option'); o.value=f==='Default'?'':f; o.textContent=f; ff.appendChild(o); }); ff.addEventListener('change',()=>{ if(ff.value) applyInlineStyle('fontFamily', ff.value); });
      // Font size (px)
      const fs=document.createElement('input'); fs.type='number'; fs.min='10'; fs.max='72'; fs.value='16'; fs.title='Yazı Boyutu (px)'; fs.className='btn btn-outline'; fs.style.width='84px';
      fs.addEventListener('change',()=> applyInlineStyle('fontSize', fs.value+'px'));
      // Line height
      const lh=document.createElement('select'); lh.className='btn btn-outline'; ['1.0','1.2','1.4','1.6','1.8','2.0'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent='Satır: '+v; lh.appendChild(o); }); lh.addEventListener('change',()=> applyInlineStyle('lineHeight', lh.value));
      // Text color
      const col=document.createElement('input'); col.type='color'; col.className='btn btn-outline'; col.title='Yazı Rengi'; col.addEventListener('input',()=> applyInlineStyle('color', col.value));
      // Styles
      tb.appendChild(btn('B','Kalın', ()=> applyBlock('bold')));
      tb.appendChild(btn('I','İtalik', ()=> applyBlock('italic')));
      tb.appendChild(btn('U','Altı Çizili', ()=> applyBlock('underline')));
      // Alignment
      tb.appendChild(btn('Sol','Sola Hizala', ()=> applyBlock('justifyLeft')));
      tb.appendChild(btn('Ortala','Ortala', ()=> applyBlock('justifyCenter')));
      tb.appendChild(btn('Sağ','Sağa Hizala', ()=> applyBlock('justifyRight')));
      tb.appendChild(btn('İkiye','İki Yana Yasla', ()=> applyBlock('justifyFull')));
      // Lists
      tb.appendChild(btn('• Liste','Madde İşaretli', ()=> applyBlock('insertUnorderedList')));
      tb.appendChild(btn('1. Liste','Numaralı', ()=> applyBlock('insertOrderedList')));
      // Font family / size / line-height / color controls
      tb.appendChild(ff); tb.appendChild(fs); tb.appendChild(lh); tb.appendChild(col);
      bLbl.appendChild(tb); bLbl.appendChild(ed); form.appendChild(bLbl);
     
      // Status
      const stLbl=document.createElement('label'); stLbl.style.display='grid'; stLbl.style.gap='6px'; stLbl.innerHTML='<span>Durum</span>'; const stSel=document.createElement('select');
      const statusOpts = [
        { v:'draft', t:'Taslak' },
        { v:'scheduled', t:'Planlı' },
        { v:'published', t:'Yayımlandı' },
        { v:'archived', t:'Arşivli' },
        { v:'unpublished', t:'Yayından Kaldırıldı' },
      ];
      statusOpts.forEach(({v,t})=>{ const o=document.createElement('option'); o.value=v; o.textContent=t; if (v===(row.status||'draft')) o.selected=true; stSel.appendChild(o); });
      stLbl.appendChild(stSel); form.appendChild(stLbl);

      // Dates
      const pLbl=document.createElement('label'); pLbl.style.display='grid'; pLbl.style.gap='6px'; pLbl.innerHTML='<span>Yayın Tarihi</span>'; const pIn=document.createElement('input'); pIn.type='datetime-local'; pIn.value=row.published_at? new Date(row.published_at).toISOString().slice(0,16):''; pLbl.appendChild(pIn); form.appendChild(pLbl);
      const uLbl=document.createElement('label'); uLbl.style.display='grid'; uLbl.style.gap='6px'; uLbl.innerHTML='<span>Yayından Kaldırma</span>'; const uIn=document.createElement('input'); uIn.type='datetime-local'; uIn.value=row.unpublish_at? new Date(row.unpublish_at).toISOString().slice(0,16):''; uLbl.appendChild(uIn); form.appendChild(uLbl);

      // Actions
      const actions=document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';
      const saveBtn=document.createElement('button'); saveBtn.className='btn btn-success'; saveBtn.textContent='Kaydet';
      const cancelBtn=document.createElement('button'); cancelBtn.className='btn btn-danger'; cancelBtn.textContent='İptal';
      actions.appendChild(saveBtn); actions.appendChild(cancelBtn); form.appendChild(actions);

      cancelBtn.addEventListener('click', (e)=>{ e.preventDefault(); closeModal(); });
      saveBtn.addEventListener('click', async (e)=>{
        e.preventDefault();
        try{
          const payload = {
            id: row.id || undefined,
            title: String(tIn.value||'').trim(),
            slug: String(sIn.value||'').trim(),
            body: String(ed.innerHTML||'').trim(),
            status: String(stSel.value||'draft'),
            published_at: pIn.value ? new Date(pIn.value).toISOString() : null,
            unpublish_at: uIn.value ? new Date(uIn.value).toISOString() : null,
          };
          // Basic validation
          if (!payload.title) return alert('Başlık gerekli');
          if (!payload.slug) return alert('Slug gerekli');
          if (payload.status === 'scheduled' && !payload.published_at){ return alert('Planlı için Yayın Tarihi gerekli'); }
          if (payload.unpublish_at && payload.published_at && new Date(payload.unpublish_at) < new Date(payload.published_at)){
            return alert('Yayından kaldırma tarihi, yayın tarihinden önce olamaz');
          }
          if (payload.status === 'published' && !payload.published_at){ payload.published_at = new Date().toISOString(); }

          // Upsert by id
          const q = row.id ? sb().from('pages').update(payload).eq('id', row.id) : sb().from('pages').insert(payload).select('id').single();
          const { error } = await q; if (error) throw error;
          closeModal(); if (typeof loadAdminPages==='function') await loadAdminPages();
        }catch(err){ alert('Kaydedilemedi: ' + (err?.message||String(err))); }
      });

      (typeof openModal === 'function' ? openModal() : (window.openModal && window.openModal()));
    }catch(e){ alert('Sayfa formu açılamadı: ' + (e?.message||String(e))); }
  }

  function openEmailCompose(to, subjOrig, msgId, afterSend){
    const subjDefault = /^\s*re:/i.test(subjOrig||'') ? (subjOrig||'') : `Re: ${subjOrig||'Yanıt'}`;

    $modalTitle().textContent = 'E‑posta Gönder';
    const form = $modalForm(); form.innerHTML = '';
    const wrap = document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='8px';
    form.appendChild(wrap);

    // To (read-only) - mailto: temizle
    const toLbl = document.createElement('label'); toLbl.style.display='grid'; toLbl.style.gap='6px'; toLbl.innerHTML = '<span>Alıcı</span>';
    const toIn = document.createElement('input');
    toIn.type='email';
    toIn.value = String(to||'').replace(/^mailto:/i,'').trim(); // <-- önemli
    toIn.disabled = true;
    toLbl.appendChild(toIn); wrap.appendChild(toLbl);

    // Subject
    const sLbl = document.createElement('label'); sLbl.style.display='grid'; sLbl.style.gap='6px'; sLbl.innerHTML = '<span>Konu</span>';
    const sIn = document.createElement('input'); sIn.type='text'; sIn.value = subjDefault; sLbl.appendChild(sIn); wrap.appendChild(sLbl);

    // Message
    const mLbl = document.createElement('label'); mLbl.style.display='grid'; mLbl.style.gap='6px'; mLbl.innerHTML = '<span>Mesaj</span>';
    const mIn = document.createElement('textarea'); mIn.rows = 10; mIn.placeholder = 'Yanıtınızı buraya yazınız...';
    mLbl.appendChild(mIn); wrap.appendChild(mLbl);

    // Actions
    const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';
    const sendBtn = document.createElement('button'); sendBtn.className='btn btn-success'; sendBtn.textContent='Gönder';
    const cancelBtn = document.createElement('button'); cancelBtn.className='btn btn-danger'; cancelBtn.textContent='İptal';
    actions.appendChild(sendBtn); actions.appendChild(cancelBtn); wrap.appendChild(actions);

    cancelBtn.addEventListener('click', (e)=>{ e.preventDefault(); closeModal(); });

    // Send
    sendBtn.addEventListener('click', async (e)=>{
      e.preventDefault();

      const cleanTo = String(to||'').replace(/^mailto:/i,'').trim();
      const subject = String(sIn.value||'').trim();
      const message = String(mIn.value||'').trim();

      if (!cleanTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanTo)){
        alert('Geçerli bir alıcı e‑posta bulunamadı.');
        return;
      }
      if (!subject || !message){
        alert('Konu ve mesaj gerekli');
        return;
      }

      sendBtn.disabled = true;
      try{
        // JWT’yi header’a ekle
        const { data: sess } = await sb().auth.getSession();
        const token = sess?.session?.access_token || '';
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const { data, error } = await sb().functions.invoke('admin_send_mail', {
          body: { to: cleanTo, subject, message },
          headers
        });

        if (error) {
          let msg = error?.message || 'Bilinmeyen hata';
          try {
            const resp = error?.context?.response || error?.context;
            if (resp && typeof resp.text === 'function') {
              const details = await resp.text();
              msg += ' • ' + details;
            }
          } catch {}
          throw new Error(msg);
        }
        if (data && data.ok === false){ throw new Error(data.error || 'Gönderim hatası'); }

        if (msgId) {
          try{
            const repliedBy = (currentAdmin && currentAdmin.email) ? String(currentAdmin.email) : '';
            await sb().from('messages').update({
              is_replied: true,
              replied_at: new Date().toISOString(),
              replied_by: repliedBy,
              reply_subject: subject,
              reply_body: message
            }).eq('id', msgId);
          }catch{
            try{ await sb().from('messages').update({ is_replied: true }).eq('id', msgId); }catch{}
          }
        }
        closeModal();
        try{ alert('Mesajınız cevaplanmıştır.'); }catch{}
        if (typeof afterSend === 'function') try{ await afterSend(); }catch{}
      }catch(err){
        alert('E‑posta gönderilemedi: ' + (err?.message||String(err)));
      } finally {
        sendBtn.disabled = false;
      }
    });

    try{ (typeof openModal === 'function' ? openModal() : (window.openModal && window.openModal())); }catch{}
  }
 
  // ========== NEWS ==========
  async function loadAdminNews(){
    const tbody = $newsTBody(); if (!tbody) return; tbody.innerHTML='';
    // Hard-set THEAD to ensure correct column order
    try{
      const table = tbody.closest('table');
      const headRow = table && table.tHead && table.tHead.rows && table.tHead.rows[0];
      if (headRow){
        headRow.innerHTML = `
          <th>Başlık</th>
          <th>Özet</th>
          <th>Yayınlanma Durumu</th>
          <th>Yayınlanma Tarihi</th>
          <th>Yayından Kaldırılma Tarihi</th>
          <th>İşlem</th>
        `;
      }
    }catch{}
    try{
      const { data, error } = await sb()
        .from('news')
        .select('id, title, summary, image_url, status, published_at, unpublish_at')
        .order('published_at', { ascending: false, nullsFirst: true });
      if (error) throw error;
      (data||[]).forEach(row => {
        const tr = document.createElement('tr');
        const thumb = row.image_url ? `<img src="${escapeHtml(bust(row.image_url))}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px;margin-right:8px;vertical-align:middle"/>` : '';
        const statusMap = { published:'Yayımlandı', draft:'Taslak', scheduled:'Planlı', archived:'Arşivli', unpublished:'Yayından Kaldırıldı', active:'Yayımlandı' };
        const statusTr = statusMap[String(row.status||'').toLowerCase()] || (row.status||'');
        tr.innerHTML = `
          <td>${thumb}<span style="vertical-align:middle">${escapeHtml(row.title||'')}</span></td>
          <td>${escapeHtml(row.summary||'')}</td>
          <td>${escapeHtml(statusTr)}</td>
          <td>${row.published_at ? new Date(row.published_at).toLocaleString('tr-TR') : '-'}</td>
          <td>${row.unpublish_at ? new Date(row.unpublish_at).toLocaleString('tr-TR') : '-'}</td>
          <td class="actions">
            <button class="btn btn-warning" data-edit-news="${row.id}">Düzenle</button>
            ${String(row.status||'').toLowerCase()==='published' ? `<button class="btn btn-danger" data-unpub-news="${row.id}">Yayından Kaldır</button>` : `<button class="btn btn-success" data-pub-news="${row.id}">Yayınla</button>`}
          </td>`;
        tbody.appendChild(tr);
      });
      const addBtn = qs('#newNewsBtn'); if (addBtn && !addBtn.dataset.wired){ addBtn.dataset.wired='1'; addBtn.onclick = ()=> openNewsModal({ id:null, title:'', summary:'', image_url:'', status:'draft' }); }
      wireNewsRowActions();
    }catch(e){ alert('Haberler yüklenemedi: ' + (e?.message||String(e))); }
  }

  // ========== ANNOUNCEMENTS ==========
  async function loadAdminAnnouncements(){
    const tbody = $annTBody(); if (!tbody) return; tbody.innerHTML='';
    // Hard-set THEAD to ensure correct column order
    try{
      const table = tbody.closest('table');
      const headRow = table && table.tHead && table.tHead.rows && table.tHead.rows[0];
      if (headRow){
        headRow.innerHTML = `
          <th>Başlık</th>
          <th>İçerik</th>
          <th>Yayınlanma Durumu</th>
          <th>Yayınlanma Tarihi</th>
          <th>Yayından Kaldırılma Tarihi</th>
          <th>İşlem</th>
        `;
      }
    }catch{}
    try{
      const { data, error } = await sb()
        .from('announcements')
        .select('id, title, body, image_url, status, published_at, unpublish_at')
        .order('published_at', { ascending: false, nullsFirst: true });
      if (error) throw error;
      (data||[]).forEach(row => {
        const tr = document.createElement('tr');
        const thumb = row.image_url ? `<img src="${escapeHtml(bust(row.image_url))}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px;margin-right:8px;vertical-align:middle"/>` : '';
        const statusMap = { published:'Yayımlandı', draft:'Taslak', scheduled:'Planlı', archived:'Arşivli', unpublished:'Yayından Kaldırıldı', active:'Yayımlandı' };
        const statusTr = statusMap[String(row.status||'').toLowerCase()] || (row.status||'');
        tr.innerHTML = `
          <td>${thumb}<span style="vertical-align:middle">${escapeHtml(row.title||'')}</span></td>
          <td>${escapeHtml(row.body||'')}</td>
          <td>${escapeHtml(statusTr)}</td>
          <td>${row.published_at ? new Date(row.published_at).toLocaleString('tr-TR') : '-'}</td>
          <td>${row.unpublish_at ? new Date(row.unpublish_at).toLocaleString('tr-TR') : '-'}</td>
          <td class="actions">
            <button class="btn btn-warning" data-edit-ann="${row.id}">Düzenle</button>
            ${String(row.status||'').toLowerCase()==='published' ? `<button class="btn btn-danger" data-unpub-ann="${row.id}">Yayından Kaldır</button>` : `<button class="btn btn-success" data-pub-ann="${row.id}">Yayınla</button>`}
          </td>`;
        tbody.appendChild(tr);
      });
      const addBtn = qs('#newAnnBtn'); if (addBtn && !addBtn.dataset.wired){ addBtn.dataset.wired='1'; addBtn.onclick = ()=> openAnnModal({ id:null, title:'', body:'', image_url:'', status:'draft' }); }
      wireAnnRowActions();
    }catch(e){ alert('Duyurular yüklenemedi: ' + (e?.message||String(e))); }
  }

  async function loadAdminMessages(){
    const tbody = $msgsTBody(); if (!tbody) return;
    tbody.innerHTML = '';
    messagesById = new Map();
    try{
      const refreshBtn = document.getElementById('refreshMsgsBtn');
      if (refreshBtn && !refreshBtn.dataset.wired){
        refreshBtn.dataset.wired = '1';
        refreshBtn.addEventListener('click', (e)=>{ e.preventDefault(); loadAdminMessages(); });
      }
    }catch{}

    try{
      const { data, error } = await sb()
        .from('messages')
        .select('id, name, email, subject, body, created_at, is_read, is_replied')
        .order('created_at', { ascending:false, nullsFirst:true });
      if (error) throw error;

      (data||[]).forEach(row => {
        try{ if (row && row.id) messagesById.set(row.id, row); }catch{}
        const tr = document.createElement('tr');
        const tags = [];
        if (row && row.is_read) tags.push('Okundu');
        if (row && row.is_replied) tags.push('Cevaplandı');
        const tagHtml = tags.length ? `<div class="muted" style="margin-top:4px">${escapeHtml(tags.join(' • '))}</div>` : '';
        const when = row && row.created_at ? new Date(row.created_at).toLocaleString('tr-TR') : '-';
        tr.innerHTML = `
          <td>${escapeHtml(row?.name || '')}</td>
          <td>${escapeHtml(row?.email || '')}</td>
          <td>${escapeHtml(row?.subject || '')}${tagHtml}</td>
          <td>${when}</td>
          <td class="actions">
            <button class="btn btn-warning" data-view-msg="${row.id}">Oku</button>
            <button class="btn btn-success" data-reply-msg="${row.id}">Cevapla</button>
            ${row && row.is_read ? '' : `<button class="btn btn-outline" data-read-msg="${row.id}">Okundu</button>`}
          </td>
        `;
        tbody.appendChild(tr);
      });
      wireMsgsRowActions();
    }catch(e){
      alert('Mesajlar yüklenemedi: ' + (e?.message||String(e)));
    }
  }

  function wireMsgsRowActions(){
    const tbody = $msgsTBody(); if (!tbody) return;
    try{
      tbody.querySelectorAll('button[data-view-msg]').forEach(btn=>{
        if (btn.dataset.wired) return; btn.dataset.wired='1';
        btn.addEventListener('click', async ()=>{
          const id = btn.getAttribute('data-view-msg');
          const row = messagesById.get(id);
          if (!row) return;
          try{
            if (!row.is_read){
              await sb().from('messages').update({ is_read: true }).eq('id', id);
              row.is_read = true;
            }
          }catch{}
          await openMessageModal(row);
          try{ await loadAdminMessages(); }catch{}
        });
      });
      tbody.querySelectorAll('button[data-read-msg]').forEach(btn=>{
        if (btn.dataset.wired) return; btn.dataset.wired='1';
        btn.addEventListener('click', async ()=>{
          const id = btn.getAttribute('data-read-msg');
          try{ await sb().from('messages').update({ is_read: true }).eq('id', id); }catch(e){ alert('Güncellenemedi: ' + (e?.message||String(e))); }
          try{ await loadAdminMessages(); }catch{}
        });
      });
      tbody.querySelectorAll('button[data-reply-msg]').forEach(btn=>{
        if (btn.dataset.wired) return; btn.dataset.wired='1';
        btn.addEventListener('click', async ()=>{
          const id = btn.getAttribute('data-reply-msg');
          const row = messagesById.get(id);
          if (!row) return;
          try{
            if (!row.is_read){
              await sb().from('messages').update({ is_read: true }).eq('id', id);
              row.is_read = true;
            }
          }catch{}
          openEmailCompose(row.email, row.subject, id, async ()=>{ try{ await loadAdminMessages(); }catch{} });
          try{ await loadAdminMessages(); }catch{}
        });
      });
    }catch{}
  }

  async function openMessageModal(row){
    try{
      let fullRow = row;
      try{
        if (row && row.id){
          const { data } = await sb().from('messages').select('*').eq('id', row.id).maybeSingle();
          if (data) fullRow = data;
        }
      }catch{}

      $modalTitle().textContent = 'Mesaj';
      const form = $modalForm();
      form.innerHTML = '';

      const wrap = document.createElement('div');
      wrap.style.display = 'grid';
      wrap.style.gap = '8px';
      form.appendChild(wrap);

      function roInput(label, val, type){
        const lbl = document.createElement('label');
        lbl.style.display='grid';
        lbl.style.gap='6px';
        lbl.innerHTML = `<span>${escapeHtml(label)}</span>`;
        const inp = document.createElement('input');
        inp.type = type || 'text';
        inp.value = String(val || '');
        inp.disabled = true;
        lbl.appendChild(inp);
        return lbl;
      }

      wrap.appendChild(roInput('Ad', fullRow?.name || '', 'text'));
      wrap.appendChild(roInput('E‑posta', fullRow?.email || '', 'email'));
      wrap.appendChild(roInput('Konu', fullRow?.subject || '', 'text'));
      wrap.appendChild(roInput('Tarih', fullRow?.created_at ? new Date(fullRow.created_at).toLocaleString('tr-TR') : '-', 'text'));

      const mLbl = document.createElement('label');
      mLbl.style.display='grid';
      mLbl.style.gap='6px';
      mLbl.innerHTML = '<span>Mesaj</span>';
      const ta = document.createElement('textarea');
      ta.rows = 12;
      ta.value = String(fullRow?.body || '');
      ta.disabled = true;
      mLbl.appendChild(ta);
      wrap.appendChild(mLbl);

      try{
        const replyBody = (fullRow && (fullRow.reply_body ?? fullRow.replyBody ?? fullRow.reply_message ?? fullRow.replyMessage)) || '';
        const replySubj = (fullRow && (fullRow.reply_subject ?? fullRow.replySubject)) || '';
        const repliedAt = (fullRow && (fullRow.replied_at ?? fullRow.repliedAt)) || null;
        const repliedBy = (fullRow && (fullRow.replied_by ?? fullRow.repliedBy)) || '';
        if (String(replyBody||'').trim() || String(replySubj||'').trim() || repliedAt || String(repliedBy||'').trim()){
          wrap.appendChild(roInput('Yanıtlayan', repliedBy || '-', 'text'));
          wrap.appendChild(roInput('Yanıt Tarihi', repliedAt ? new Date(repliedAt).toLocaleString('tr-TR') : '-', 'text'));
          wrap.appendChild(roInput('Yanıt Konusu', replySubj || '-', 'text'));
          const rLbl = document.createElement('label');
          rLbl.style.display='grid';
          rLbl.style.gap='6px';
          rLbl.innerHTML = '<span>Verilen Yanıt</span>';
          const rTa = document.createElement('textarea');
          rTa.rows = 10;
          rTa.value = String(replyBody || '');
          rTa.disabled = true;
          rLbl.appendChild(rTa);
          wrap.appendChild(rLbl);
        }
      }catch{}

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '8px';
      const replyBtn = document.createElement('button');
      replyBtn.className = 'btn btn-success';
      replyBtn.textContent = 'Cevapla';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn btn-danger';
      closeBtn.textContent = 'Kapat';
      actions.appendChild(replyBtn);
      actions.appendChild(closeBtn);
      wrap.appendChild(actions);

      closeBtn.addEventListener('click', (e)=>{ e.preventDefault(); closeModal(); });
      replyBtn.addEventListener('click', (e)=>{
        e.preventDefault();
        openEmailCompose(fullRow?.email, fullRow?.subject, fullRow?.id, async ()=>{ try{ await loadAdminMessages(); }catch{} });
      });

      (typeof openModal === 'function' ? openModal() : (window.openModal && window.openModal()));
    }catch(e){
      alert('Mesaj açılamadı: ' + (e?.message||String(e)));
    }
  }

  function wireNewsRowActions(){
    try{
      const tbody = $newsTBody(); if (!tbody) return;
      tbody.querySelectorAll('button[data-edit-news]').forEach(btn=>{
        if (btn.dataset.wired) return; btn.dataset.wired='1';
        btn.addEventListener('click', async ()=>{
          const id = btn.getAttribute('data-edit-news');
          try{ const { data } = await sb().from('news').select('*').eq('id', id).maybeSingle(); openNewsModal(data||{ id:null, title:'', summary:'', image_url:'', status:'draft' }); }catch(e){ alert('Haber yüklenemedi: ' + (e?.message||String(e))); }
        });
      });
      // Publish / Unpublish
      tbody.querySelectorAll('button[data-pub-news]').forEach(btn=>{
        if (btn.dataset.wired) return; btn.dataset.wired='1';
        btn.addEventListener('click', async ()=>{
          const id = btn.getAttribute('data-pub-news');
          try{ const { error } = await sb().from('news').update({ status:'published', published_at: new Date().toISOString(), unpublish_at: null }).eq('id', id); if (error) throw error; await loadAdminNews(); }catch(e){ alert('Yayınlanamadı: '+(e?.message||String(e))); }
        });
      });
      tbody.querySelectorAll('button[data-unpub-news]').forEach(btn=>{
        if (btn.dataset.wired) return; btn.dataset.wired='1';
        btn.addEventListener('click', async ()=>{
          const id = btn.getAttribute('data-unpub-news');
          try{ const { error } = await sb().from('news').update({ status:'unpublished', unpublish_at: new Date().toISOString() }).eq('id', id); if (error) throw error; await loadAdminNews(); }catch(e){ alert('Yayından kaldırılamadı: '+(e?.message||String(e))); }
        });
      });
    }catch{}
  }

  function wireAnnRowActions(){
    try{
      const tbody = $annTBody(); if (!tbody) return;
      tbody.querySelectorAll('button[data-edit-ann]').forEach(btn=>{
        if (btn.dataset.wired) return; btn.dataset.wired='1';
        btn.addEventListener('click', async ()=>{
          const id = btn.getAttribute('data-edit-ann');
          try{ const { data } = await sb().from('announcements').select('*').eq('id', id).maybeSingle(); openAnnModal(data||{ id:null, title:'', body:'', image_url:'', status:'draft' }); }catch(e){ alert('Duyuru yüklenemedi: ' + (e?.message||String(e))); }
        });
      });
      // Publish / Unpublish
      tbody.querySelectorAll('button[data-pub-ann]').forEach(btn=>{
        if (btn.dataset.wired) return; btn.dataset.wired='1';
        btn.addEventListener('click', async ()=>{
          const id = btn.getAttribute('data-pub-ann');
          try{ const { error } = await sb().from('announcements').update({ status:'published', published_at: new Date().toISOString(), unpublish_at: null }).eq('id', id); if (error) throw error; await loadAdminAnnouncements(); }catch(e){ alert('Yayınlanamadı: '+(e?.message||String(e))); }
        });
      });
      tbody.querySelectorAll('button[data-unpub-ann]').forEach(btn=>{
        if (btn.dataset.wired) return; btn.dataset.wired='1';
        btn.addEventListener('click', async ()=>{
          const id = btn.getAttribute('data-unpub-ann');
          try{ const { error } = await sb().from('announcements').update({ status:'unpublished', unpublish_at: new Date().toISOString() }).eq('id', id); if (error) throw error; await loadAdminAnnouncements(); }catch(e){ alert('Yayından kaldırılamadı: '+(e?.message||String(e))); }
        });
      });
    }catch{}
  }

  function openNewsModal(row){
    try{
      row = row || { id:null, title:'', summary:'', image_url:'', status:'draft', published_at:null, unpublish_at:null };
      $modalTitle().textContent = row.id ? 'Haberi Düzenle' : 'Yeni Haber';
      const form = $modalForm(); form.innerHTML='';

      // Title
      const tLbl=document.createElement('label'); tLbl.style.display='grid'; tLbl.style.gap='6px'; tLbl.innerHTML='<span>Başlık</span>'; const tIn=document.createElement('input'); tIn.value=row.title||''; tLbl.appendChild(tIn); form.appendChild(tLbl);
      // Summary
      const sLbl=document.createElement('label'); sLbl.style.display='grid'; sLbl.style.gap='6px'; sLbl.innerHTML='<span>Özet</span>'; const sIn=document.createElement('textarea'); sIn.rows=3; sIn.value=row.summary||''; sLbl.appendChild(sIn); form.appendChild(sLbl);
      // Body editor: Word-like toolbar + contentEditable area
      const bLbl=document.createElement('label'); bLbl.style.display='grid'; bLbl.style.gap='6px'; bLbl.innerHTML='<span>İçerik</span>';
      const tb=document.createElement('div'); tb.style.display='flex'; tb.style.flexWrap='wrap'; tb.style.gap='6px'; tb.style.margin='6px 0';
      const ed=document.createElement('div'); ed.contentEditable='true'; ed.className='card'; ed.style.minHeight='240px'; ed.style.padding='10px'; ed.style.overflow='auto'; ed.innerHTML = (row.body||'');
      function btn(label, title, on){ const b=document.createElement('button'); b.type='button'; b.className='btn btn-outline'; b.textContent=label; b.title=title; b.style.padding='6px 10px'; b.addEventListener('click', (e)=>{ e.preventDefault(); on(); ed.focus(); }); return b; }
      function applyInlineStyle(prop, val){
        const sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        if (range.collapsed){
          const span=document.createElement('span'); span.style[prop]=val; span.appendChild(document.createTextNode('\u200b'));
          range.insertNode(span); sel.removeAllRanges(); const r=document.createRange(); r.selectNodeContents(span); r.collapse(false); sel.addRange(r);
        } else {
          const span=document.createElement('span'); span.style[prop]=val; try{ range.surroundContents(span); }catch{ document.execCommand('foreColor'); }
        }
      }
      function applyBlock(cmd){ document.execCommand(cmd,false,null); }
      // Font family
      const ff=document.createElement('select'); ff.className='btn btn-outline'; ['Default','Arial','Georgia','Tahoma','Times New Roman','Verdana','Courier New'].forEach(f=>{ const o=document.createElement('option'); o.value=f==='Default'?'':f; o.textContent=f; ff.appendChild(o); }); ff.addEventListener('change',()=>{ if(ff.value) applyInlineStyle('fontFamily', ff.value); });
      // Font size (px)
      const fs=document.createElement('input'); fs.type='number'; fs.min='10'; fs.max='72'; fs.value='16'; fs.title='Yazı Boyutu (px)'; fs.className='btn btn-outline'; fs.style.width='84px'; fs.addEventListener('change',()=> applyInlineStyle('fontSize', fs.value+'px'));
      // Line height
      const lh=document.createElement('select'); lh.className='btn btn-outline'; ['1.0','1.2','1.4','1.6','1.8','2.0'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent='Satır: '+v; lh.appendChild(o); }); lh.addEventListener('change',()=> applyInlineStyle('lineHeight', lh.value));
      // Text color
      const col=document.createElement('input'); col.type='color'; col.className='btn btn-outline'; col.title='Yazı Rengi'; col.addEventListener('input',()=> applyInlineStyle('color', col.value));
      // Styles
      tb.appendChild(btn('B','Kalın', ()=> applyBlock('bold')));
      tb.appendChild(btn('I','İtalik', ()=> applyBlock('italic')));
      tb.appendChild(btn('U','Altı Çizili', ()=> applyBlock('underline')));
      // Alignment
      tb.appendChild(btn('Sol','Sola Hizala', ()=> applyBlock('justifyLeft')));
      tb.appendChild(btn('Ortala','Ortala', ()=> applyBlock('justifyCenter')));
      tb.appendChild(btn('Sağ','Sağa Hizala', ()=> applyBlock('justifyRight')));
      tb.appendChild(btn('İkiye','İki Yana Yasla', ()=> applyBlock('justifyFull')));
      // Lists
      tb.appendChild(btn('• Liste','Madde İşaretli', ()=> applyBlock('insertUnorderedList')));
      tb.appendChild(btn('1. Liste','Numaralı', ()=> applyBlock('insertOrderedList')));
      // Font family / size / line-height / color controls
      tb.appendChild(ff); tb.appendChild(fs); tb.appendChild(lh); tb.appendChild(col);
      bLbl.appendChild(tb); bLbl.appendChild(ed); form.appendChild(bLbl);
      // Yazı Boyutu (px)
      const fontSizeInput = document.createElement('input');
      fontSizeInput.type = 'number';
      fontSizeInput.min = '10';
      fontSizeInput.max = '72';
      fontSizeInput.value = '16';
      fontSizeInput.title = 'Yazı Boyutu (px)';
      fontSizeInput.className = 'btn btn-outline';
      fontSizeInput.style.width = '84px';
      fontSizeInput.addEventListener('change', () => {
        const v = Number(fontSizeInput.value || 16);
        applyInlineStyle('fontSize', Math.max(10, Math.min(72, v)) + 'px');
      });
      tb.appendChild(fontSizeInput);
      // Image
      const iLbl=document.createElement('label'); iLbl.style.display='grid'; iLbl.style.gap='6px'; iLbl.innerHTML='<span>Kapak Görseli</span>';
      const iIn=document.createElement('input'); iIn.placeholder='https://... (opsiyonel)'; iIn.value=row.image_url||'';
      const iFile=document.createElement('input'); iFile.type='file'; iFile.accept='image/*';
      const iWrap=document.createElement('div'); iWrap.style.display='grid'; iWrap.style.gap='6px'; iWrap.appendChild(iIn); iWrap.appendChild(iFile); iLbl.appendChild(iWrap); form.appendChild(iLbl);
      // Cover crop controls (for slider)
      const coverLbl = document.createElement('div'); coverLbl.className='card'; coverLbl.style.padding='10px'; coverLbl.style.display='grid'; coverLbl.style.gap='8px'; coverLbl.style.margin='8px 0';
      const coverTitle = document.createElement('div'); coverTitle.textContent = 'Kapak (Slider) Kadrajı'; coverTitle.style.fontWeight='600'; coverLbl.appendChild(coverTitle);
      const initCover = parsePhotoMeta(row.cover_image_url||'');
      const cZoomLbl = document.createElement('label'); cZoomLbl.style.display='grid'; cZoomLbl.style.gap='4px'; cZoomLbl.innerHTML='<span>Yakınlık</span>';
      const cZoom = document.createElement('input'); cZoom.type='range'; cZoom.min='1.00'; cZoom.max='3.00'; cZoom.step='0.01'; cZoom.value=Math.max(1, initCover.z || 1); cZoom.setAttribute('data-cover-zoom','1');
      cZoomLbl.appendChild(cZoom); coverLbl.appendChild(cZoomLbl);
      const cOyLbl = document.createElement('label'); cOyLbl.style.display='grid'; cOyLbl.style.gap='4px'; cOyLbl.innerHTML='<span>Dikey Ofset</span>';
      const cOy = document.createElement('input'); cOy.type='range'; cOy.min='-400'; cOy.max='400'; cOy.step='1'; cOy.value=String(initCover.oy||0); cOy.setAttribute('data-cover-oy','1');
      cOyLbl.appendChild(cOy); coverLbl.appendChild(cOyLbl);
      const cOxLbl = document.createElement('label'); cOxLbl.style.display='grid'; cOxLbl.style.gap='4px'; cOxLbl.innerHTML='<span>Yatay Ofset</span>';
      const cOx = document.createElement('input'); cOx.type='range'; cOx.min='-400'; cOx.max='400'; cOx.step='1'; cOx.value=String(initCover.ox||0); cOx.setAttribute('data-cover-ox','1');
      cOxLbl.appendChild(cOx); coverLbl.appendChild(cOxLbl);
      // Rectangular cover preview
      const coverPrev = document.createElement('div');
      coverPrev.style.width='100%';               // fill modal width
      coverPrev.style.maxWidth='100%';
      coverPrev.style.height='460px';             // same as site slider
      coverPrev.style.border='1px solid #e5e7eb';
      coverPrev.style.borderRadius='10px';
      coverPrev.style.overflow='hidden';
      coverPrev.style.position='relative';
      coverPrev.style.background='#fff';          // white underlay like site
      const coverBg = document.createElement('div');
      coverBg.style.position='absolute';
      coverBg.style.inset='0';
      coverBg.style.backgroundRepeat='no-repeat';
      coverBg.style.backgroundColor='#fff';
      coverPrev.appendChild(coverBg);
      coverLbl.appendChild(coverPrev);

      function currentCoverBase(){
        if (iFile.files && iFile.files[0]){ try{ return URL.createObjectURL(iFile.files[0]); }catch{} }
        return (String(iIn.value||'').trim() || stripPhotoKey(row.cover_image_url||row.image_url||''));
      }
      function updateCoverPreview(){
        const base = currentCoverBase();
        if (!base){ coverPrev.style.display='none'; return; }
        coverPrev.style.display='block';
        coverBg.style.backgroundImage = `url(${base})`;
        const z = Number(cZoom.value||1); const ox = Number(cOx.value||0); const oy = Number(cOy.value||0);
        coverBg.style.backgroundSize = `${Math.max(100, Math.round(100*z))}%`;
        const boxW = coverPrev && coverPrev.clientWidth ? coverPrev.clientWidth : 0;
        const boxH = coverPrev && coverPrev.clientHeight ? coverPrev.clientHeight : 0;
        if (boxW && boxH){
          const oxp = Math.round((ox / boxW) * 1000) / 10; // 0.1% precision
          const oyp = Math.round((oy / boxH) * 1000) / 10;
          coverBg.style.backgroundPosition = `calc(50% + ${oxp}%) calc(50% + ${oyp}%)`;
        } else {
          coverBg.style.backgroundPosition = `calc(50% + ${ox}px) calc(50% + ${oy}px)`;
        }
      }
      // === Slider kadraj aracı ===
(function(){
  function read(){ return { z:+cZoom.value||1, ox:+cOx.value||0, oy:+cOy.value||0 }; }
  function write(st){
    cZoom.value = Math.max(1, Math.min(3, st.z)).toFixed(2);
    cOx.value   = Math.round(st.ox);
    cOy.value   = Math.round(st.oy);
    updateCoverPreview();
  }

  const row = document.createElement('div');
  row.style.display='flex';
  row.style.gap='8px';
  row.style.marginTop='8px';

  const btnCrop   = document.createElement('button');
  btnCrop.type='button'; btnCrop.className='btn btn-outline'; btnCrop.textContent='Kadrajla (Slider)';
  const btnCenter = document.createElement('button');
  btnCenter.type='button'; btnCenter.className='btn btn-outline'; btnCenter.textContent='Ortala';
  const btnReset  = document.createElement('button');
  btnReset.type='button';  btnReset.className='btn btn-outline'; btnReset.textContent='Sıfırla';
  row.appendChild(btnCrop); row.appendChild(btnCenter); row.appendChild(btnReset);
  coverLbl.appendChild(row);
  form.appendChild(coverLbl);    

  /* — pan-zoom inline preview — */
  let drag=false, sx=0, sy=0, ox0=0, oy0=0;
  coverPrev.style.cursor='grab';
  coverPrev.addEventListener('pointerdown',e=>{
    drag=true; sx=e.clientX; sy=e.clientY;
    const st=read(); ox0=st.ox; oy0=st.oy;
    coverPrev.setPointerCapture(e.pointerId); coverPrev.style.cursor='grabbing';
  });
  coverPrev.addEventListener('pointermove',e=>{
    if(!drag) return; write({ z:read().z, ox:ox0+e.clientX-sx, oy:oy0+e.clientY-sy });
  });
  coverPrev.addEventListener('pointerup',()=>{ drag=false; coverPrev.releasePointerCapture; coverPrev.style.cursor='grab'; });
  coverPrev.addEventListener('wheel',e=>{
    e.preventDefault();
    const step=e.deltaY<0?0.08:-0.08;
    write({ z:read().z+step, ox:read().ox, oy:read().oy });
  },{passive:false});
  btnCenter.onclick = ()=> write({ z:read().z, ox:0, oy:0 });
  btnReset .onclick = ()=> write({ z:1, ox:0, oy:0 });

  /* — full-screen overlay — */
  btnCrop.onclick = ()=>{
    const base=currentCoverBase(); if(!base) return;
    const ov=document.createElement('div');
    ov.style.position='fixed'; ov.style.inset='0'; ov.style.background='rgba(0,0,0,.6)';
    ov.style.display='flex'; ov.style.alignItems='center'; ov.style.justifyContent='center'; ov.style.zIndex='9999';
    const box=document.createElement('div'); box.style.width='min(1100px,96vw)'; box.style.aspectRatio='1100/460';
    box.style.position='relative'; box.style.background='#fff'; box.style.borderRadius='14px'; box.style.overflow='hidden';
    const bg=document.createElement('div'); bg.style.position='absolute'; bg.style.inset='0'; bg.style.backgroundImage=`url(${base})`;
    bg.style.backgroundRepeat='no-repeat'; box.appendChild(bg);
    const bar=document.createElement('div'); bar.style.position='absolute'; bar.style.top='10px'; bar.style.right='10px'; bar.style.display='flex'; bar.style.gap='8px';
    const ok=document.createElement('button'); ok.className='btn btn-success'; ok.textContent='Uygula';
    const cancel=document.createElement('button'); cancel.className='btn btn-danger'; cancel.textContent='İptal';
    bar.appendChild(ok); bar.appendChild(cancel); box.appendChild(bar); ov.appendChild(box); document.body.appendChild(ov);

    let st=read();
    const apply=()=>{
      bg.style.backgroundSize=`${Math.round(st.z*100)}%`;
      bg.style.backgroundPosition=`calc(50% + ${st.ox}px) calc(50% + ${st.oy}px)`;
    }; apply();

    /* overlay pan/zoom */
    let drag2=false,sx2=0,sy2=0,ox2=0,oy2=0;
    box.addEventListener('pointerdown',e=>{drag2=true;sx2=e.clientX;sy2=e.clientY;ox2=st.ox;oy2=st.oy;box.setPointerCapture(e.pointerId);});
    box.addEventListener('pointermove',e=>{if(drag2){st.ox=ox2+e.clientX-sx2; st.oy=oy2+e.clientY-sy2; apply();}});
    box.addEventListener('pointerup',()=>{drag2=false;});
    box.addEventListener('wheel',e=>{e.preventDefault(); st.z=Math.max(1,Math.min(3,st.z+(e.deltaY<0?0.08:-0.08))); apply();},{passive:false});

    ok.onclick     = ()=>{ write(st); document.body.removeChild(ov); };
    cancel.onclick = ()=>{ document.body.removeChild(ov); };
    ov.onclick     = e=>{ if(e.target===ov) document.body.removeChild(ov); };
    window.addEventListener('keydown',function esc(ev){ if(ev.key==='Escape'){document.body.removeChild(ov); window.removeEventListener('keydown',esc);} });
  };
})();
      updateCoverPreview();
      [cZoom, cOx, cOy].forEach(el => el.addEventListener('input', updateCoverPreview));
      iFile.addEventListener('change', updateCoverPreview);
      // Status
      const stLbl=document.createElement('label'); stLbl.style.display='grid'; stLbl.style.gap='6px'; stLbl.innerHTML='<span>Durum</span>'; const stSel=document.createElement('select');
      const statusOptsNews = [
        { v:'draft', t:'Taslak' },
        { v:'scheduled', t:'Planlı' },
        { v:'published', t:'Yayımlandı' },
        { v:'archived', t:'Arşivli' },
        { v:'unpublished', t:'Yayından Kaldırıldı' },
      ];
      statusOptsNews.forEach(({v,t})=>{ const o=document.createElement('option'); o.value=v; o.textContent=t; if (v===(row.status||'draft')) o.selected=true; stSel.appendChild(o); });
      stLbl.appendChild(stSel); form.appendChild(stLbl);
      // Dates
      const pLbl=document.createElement('label'); pLbl.style.display='grid'; pLbl.style.gap='6px'; pLbl.innerHTML='<span>Yayın Tarihi</span>'; const pIn=document.createElement('input'); pIn.type='datetime-local'; pIn.value=row.published_at? new Date(row.published_at).toISOString().slice(0,16):''; pLbl.appendChild(pIn); form.appendChild(pLbl);
      const uLbl=document.createElement('label'); uLbl.style.display='grid'; uLbl.style.gap='6px'; uLbl.innerHTML='<span>Yayından Kaldırma</span>'; const uIn=document.createElement('input'); uIn.type='datetime-local'; uIn.value=row.unpublish_at? new Date(row.unpublish_at).toISOString().slice(0,16):''; uLbl.appendChild(uIn); form.appendChild(uLbl);
      // Gallery
      const gLbl=document.createElement('label'); gLbl.style.display='grid'; gLbl.style.gap='6px'; gLbl.innerHTML='<span>Galeri URL’leri (JSON dizi, eski görseli silmek için URL’yi çıkarın)</span>';
      const gIn=document.createElement('textarea'); gIn.rows=3;
      try{ const arr = Array.isArray(row.gallery_urls)? row.gallery_urls : JSON.parse(row.gallery_urls||'[]'); gIn.value = JSON.stringify(Array.isArray(arr)?arr:[], null, 0); }
      catch{ gIn.value='[]'; }
      gLbl.appendChild(gIn); form.appendChild(gLbl);
      // Actions
      const actions=document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';
      const saveBtn=document.createElement('button'); saveBtn.className='btn btn-success'; saveBtn.textContent='Kaydet';
      const cancelBtn=document.createElement('button'); cancelBtn.className='btn btn-danger'; cancelBtn.textContent='İptal';
      actions.appendChild(saveBtn); actions.appendChild(cancelBtn); form.appendChild(actions);

      cancelBtn.addEventListener('click',(e)=>{ e.preventDefault(); closeModal(); });
      saveBtn.addEventListener('click', async (e)=>{
        e.preventDefault();
        try{
          const payload = {
            id: row.id || undefined,
            title: String(tIn.value||'').trim(),
            summary: String(sIn.value||'').trim(),
            body: String(ed.innerHTML||'').trim(),
            image_url: String(iIn.value||'').trim() || null,
            cover_image_url: null,
            status: String(stSel.value||'draft'),
            published_at: pIn.value ? new Date(pIn.value).toISOString() : null,
            unpublish_at: uIn.value ? new Date(uIn.value).toISOString() : null,
          };
          // Validate status/date relations
          if (payload.status === 'scheduled' && !payload.published_at){ return alert('Planlı için Yayın Tarihi gerekli'); }
          if (payload.unpublish_at && payload.published_at && new Date(payload.unpublish_at) < new Date(payload.published_at)){
            return alert('Yayından kaldırma tarihi, yayın tarihinden önce olamaz');
          }
          if (payload.status === 'published' && !payload.published_at){ payload.published_at = new Date().toISOString(); }

          // Upload image file if provided
          if (iFile.files && iFile.files[0]){
            const f = iFile.files[0];
            const ext = (f.name.split('.').pop()||'jpg').toLowerCase();
            const path = `news/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            try{ payload.image_url = await uploadToBucketGeneric(f, 'images', path); }
            catch(err){ return alert(String(err?.message||err)); }
          }
          // Determine cover crop meta
          const coverMeta = { z:Number(cZoom.value||1), ox:Number(cOx.value||0), oy:Number(cOy.value||0) };
          // Compute percent-based offsets relative to the preview box for responsive parity
          try{
            const boxW = coverPrev && coverPrev.clientWidth ? coverPrev.clientWidth : 0;
            const boxH = coverPrev && coverPrev.clientHeight ? coverPrev.clientHeight : 0;
            if (boxW && boxH){
              coverMeta.oxp = Math.round((coverMeta.ox / boxW) * 1000) / 10; // 0.1% precision
              coverMeta.oyp = Math.round((coverMeta.oy / boxH) * 1000) / 10;
            }
          }catch{}
          // If no new file, still save crop meta referencing existing image_url (or keep previous cover if none)
          if (!payload.image_url){
            const base = String(payload.image_url||'').trim() || stripPhotoKey(row.cover_image_url||row.image_url||'');
            if (base){ payload.cover_image_url = buildPhotoValue(base, coverMeta); }
          } else {
            // Also set cover from uploaded
            if (payload.image_url){ payload.cover_image_url = buildPhotoValue(payload.image_url, coverMeta); }
          }
          try{
            const parsed = JSON.parse(String(gIn.value||'[]'));
            if (Array.isArray(parsed)) payload.gallery_urls = JSON.stringify(parsed);
          }catch{ /* ignore bad JSON */ }
          const q = row.id ? sb().from('news').update(payload).eq('id', row.id) : sb().from('news').insert(payload).select('id').single();
          const { error } = await q; if (error) throw error;
          closeModal(); if (typeof loadAdminNews==='function') await loadAdminNews();
        }catch(err){ alert('Kaydedilemedi: ' + (err?.message||String(err))); }
      });

      (typeof openModal === 'function' ? openModal() : (window.openModal && window.openModal()));
    }catch(e){ alert('Haber formu açılamadı: ' + (e?.message||String(e))); }
  }

  function openAnnModal(row){
    try{
      row = row || { id:null, title:'', body:'', image_url:'', status:'draft', published_at:null, unpublish_at:null };
      $modalTitle().textContent = row.id ? 'Duyuruyu Düzenle' : 'Yeni Duyuru';
      const form = $modalForm(); form.innerHTML='';

      // Title
      const tLbl=document.createElement('label'); tLbl.style.display='grid'; tLbl.style.gap='6px'; tLbl.innerHTML='<span>Başlık</span>'; const tIn=document.createElement('input'); tIn.value=row.title||''; tLbl.appendChild(tIn); form.appendChild(tLbl);
      // Body
      const bLbl=document.createElement('label'); bLbl.style.display='grid'; bLbl.style.gap='6px'; bLbl.innerHTML='<span>İçerik</span>'; const bIn=document.createElement('textarea'); bIn.rows=6; bIn.value=row.body||''; bIn.style.fontFamily='ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      const tb=document.createElement('div'); tb.style.display='flex'; tb.style.gap='6px'; tb.style.flexWrap='wrap'; tb.style.margin='6px 0';
      function mkBtn(txt, title, fn){ const btn=document.createElement('button'); btn.type='button'; btn.className='btn btn-outline'; btn.textContent=txt; btn.title=title; btn.style.padding='6px 10px'; btn.addEventListener('click', fn); return btn; }
      function selWrap(before, after=''){ const s=bIn.selectionStart||0, e=bIn.selectionEnd||0; const v=bIn.value; const picked=v.slice(s,e); const rep=before+picked+(after||before); bIn.setRangeText(rep, s, e, 'end'); bIn.focus(); renderPrev(); }
      function selLinePrefix(prefix){ const s=bIn.selectionStart||0, e=bIn.selectionEnd||0; const v=bIn.value; const start=v.lastIndexOf('\n', s-1)+1; const end=e; const lines=v.slice(start,end).split('\n').map(l=> prefix+ l); const rep=lines.join('\n'); bIn.setSelectionRange(start,end); bIn.setRangeText(rep, start, end, 'end'); bIn.focus(); renderPrev(); }
      tb.appendChild(mkBtn('B','Kalın', ()=> selWrap('**','**')));
      tb.appendChild(mkBtn('I','İtalik', ()=> selWrap('*','*')));
      tb.appendChild(mkBtn('H2','Başlık', ()=> selLinePrefix('## ')));
      tb.appendChild(mkBtn('•','Liste', ()=> selLinePrefix('- ')));
      tb.appendChild(mkBtn('🔗','Bağlantı', ()=>{ const s=bIn.selectionStart||0,e=bIn.selectionEnd||0; const picked=bIn.value.slice(s,e)||'metin'; const url=prompt('Bağlantı URL','https://'); if(!url) return; const rep=`[${picked}](${url})`; bIn.setRangeText(rep, s, e, 'end'); bIn.focus(); renderPrev(); }));
      const prev=document.createElement('div'); prev.className='card'; prev.style.padding='10px'; prev.style.maxHeight='220px'; prev.style.overflow='auto'; prev.style.marginTop='6px';
      function mdToHtml(md){ let html='\n'+String(md||'')+'\n'; html=html.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); html=html.replace(/^######\s+(.*)$/gm,'<h6>$1</h6>').replace(/^#####\s+(.*)$/gm,'<h5>$1</h5>').replace(/^####\s+(.*)$/gm,'<h4>$1</h4>').replace(/^###\s+(.*)$/gm,'<h3>$1</h3>').replace(/^##\s+(.*)$/gm,'<h2>$1</h2>').replace(/^#\s+(.*)$/gm,'<h1>$1</h1>'); html=html.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/`([^`]+)`/g,'<code>$1</code>'); html=html.replace(/\[([^\]]+)\]\((https?:[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1<\/a>'); html=html.replace(/^(?:\s*[-\*]\s+.+\n)+/gm,(block)=>{ const items=block.trim().split(/\n/).map(l=> l.replace(/^\s*[-\*]\s+/,'')).map(t=>`<li>${t}<\/li>`).join(''); return `<ul>${items}<\/ul>`; }); html=html.replace(/^(?!<h\d|<ul|<li|<p|<code|<blockquote|<img|<a)(.+)$/gm,'<p>$1<\/p>'); return html; }
      function renderPrev(){ prev.innerHTML = mdToHtml(bIn.value); }
      renderPrev(); bIn.addEventListener('input', renderPrev);
      bLbl.appendChild(tb); bLbl.appendChild(bIn); bLbl.appendChild(prev); form.appendChild(bLbl);

      // Image
      const iLbl=document.createElement('label'); iLbl.style.display='grid'; iLbl.style.gap='6px'; iLbl.innerHTML='<span>Kapak Görseli</span>';
      const iIn=document.createElement('input'); iIn.placeholder='https://...'; iIn.value=row.image_url||'';
      const iFile=document.createElement('input'); iFile.type='file'; iFile.accept='image/*';
      const iWrap=document.createElement('div'); iWrap.style.display='grid'; iWrap.style.gap='6px'; iWrap.appendChild(iIn); iWrap.appendChild(iFile); iLbl.appendChild(iWrap); form.appendChild(iLbl);
      // Status
      const stLbl=document.createElement('label'); stLbl.style.display='grid'; stLbl.style.gap='6px'; stLbl.innerHTML='<span>Durum</span>'; const stSel=document.createElement('select');
      const statusOptsAnn = [
        { v:'draft', t:'Taslak' },
        { v:'scheduled', t:'Planlı' },
        { v:'published', t:'Yayımlandı' },
        { v:'archived', t:'Arşivli' },
        { v:'unpublished', t:'Yayından Kaldırıldı' },
      ];
      statusOptsAnn.forEach(({v,t})=>{ const o=document.createElement('option'); o.value=v; o.textContent=t; if (v===(row.status||'draft')) o.selected=true; stSel.appendChild(o); });
      stLbl.appendChild(stSel); form.appendChild(stLbl);
      // Dates
      const pLbl=document.createElement('label'); pLbl.style.display='grid'; pLbl.style.gap='6px'; pLbl.innerHTML='<span>Yayın Tarihi</span>'; const pIn=document.createElement('input'); pIn.type='datetime-local'; pIn.value=row.published_at? new Date(row.published_at).toISOString().slice(0,16):''; pLbl.appendChild(pIn); form.appendChild(pLbl);
      const uLbl=document.createElement('label'); uLbl.style.display='grid'; uLbl.style.gap='6px'; uLbl.innerHTML='<span>Yayından Kaldırma</span>'; const uIn=document.createElement('input'); uIn.type='datetime-local'; uIn.value=row.unpublish_at? new Date(row.unpublish_at).toISOString().slice(0,16):''; uLbl.appendChild(uIn); form.appendChild(uLbl);
      // Actions
      const actions=document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';
      const saveBtn=document.createElement('button'); saveBtn.className='btn btn-success'; saveBtn.textContent='Kaydet';
      const cancelBtn=document.createElement('button'); cancelBtn.className='btn btn-danger'; cancelBtn.textContent='İptal';
      actions.appendChild(saveBtn); actions.appendChild(cancelBtn); form.appendChild(actions);

      cancelBtn.addEventListener('click',(e)=>{ e.preventDefault(); closeModal(); });
      saveBtn.addEventListener('click', async (e)=>{
        e.preventDefault();
        try{
          const payload = {
            id: row.id || undefined,
            title: String(tIn.value||'').trim(),
            body: String(bIn.value||'').trim(),
            image_url: String(iIn.value||'').trim() || null,
            status: String(stSel.value||'draft'),
            published_at: pIn.value ? new Date(pIn.value).toISOString() : null,
            unpublish_at: uIn.value ? new Date(uIn.value).toISOString() : null,
          };
          // Validate
          if (payload.status === 'scheduled' && !payload.published_at){ return alert('Planlı için Yayın Tarihi gerekli'); }
          if (payload.unpublish_at && payload.published_at && new Date(payload.unpublish_at) < new Date(payload.published_at)){
            return alert('Yayından kaldırma tarihi, yayın tarihinden önce olamaz');
          }
          if (payload.status === 'published' && !payload.published_at){ payload.published_at = new Date().toISOString(); }

          // Upload image file if provided
          if (iFile.files && iFile.files[0]){
            const f = iFile.files[0];
            const ext = (f.name.split('.').pop()||'jpg').toLowerCase();
            const path = `announcements/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            try{ payload.image_url = await uploadToBucketGeneric(f, 'images', path); }
            catch(err){ return alert(String(err?.message||err)); }
          }
          const q = row.id ? sb().from('announcements').update(payload).eq('id', row.id) : sb().from('announcements').insert(payload).select('id').single();
          const { error } = await q; if (error) throw error;
          closeModal(); if (typeof loadAdminAnnouncements==='function') await loadAdminAnnouncements();
        }catch(err){ alert('Kaydedilemedi: ' + (err?.message||String(err))); }
      });

      (typeof openModal === 'function' ? openModal() : (window.openModal && window.openModal()));
    }catch(e){ alert('Duyuru formu açılamadı: ' + (e?.message||String(e))); }
  }

  // Generic uploader for various buckets (returns public URL)
  async function uploadToBucketGeneric(file, bucket, filePath){
    try{
      const cleanPath = filePath.replace(/^\/+/, '');
      const { error } = await sb()
        .storage
        .from(bucket)
        .upload(cleanPath, file, {
          cacheControl:'3600',
          upsert:true
        });
      
      if (error) throw error;
      
      // Get the public URL for this object
      const { data: { publicUrl } } = sb()
        .storage
        .from(bucket)
        .getPublicUrl(cleanPath);
        
      return publicUrl;
    }catch(e){
      console.error('Upload generic error:', e);
      throw new Error('Görsel yüklenemedi: ' + (e?.message||'Bilinmeyen hata'));
    }
  }
// ========== AFİŞLER (POSTERS) ==========
async function loadAdminPosters(){
  const tbody = document.querySelector('#postersTableBody'); if (!tbody) return; tbody.innerHTML='';
  try{
    const table = tbody.closest('table');
    const headRow = table && table.tHead && table.tHead.rows && table.tHead.rows[0];
    if (headRow){
      headRow.innerHTML = '<th>Başlık</th><th>Durum</th><th>Yayınlanma Tarihi</th><th>İşlem</th>';
    }
  }catch{}
  try{
    const { data, error } = await sb().from('posters')
      .select('id, title, status, published_at')
      .order('published_at', { ascending:false, nullsFirst:true });
    if (error) throw error;
    (data||[]).forEach(row => {
      const tr=document.createElement('tr');
      const statusMap = { published:'Yayımlandı', draft:'Taslak', scheduled:'Planlı', archived:'Arşivli', unpublished:'Yayından Kaldırıldı' };
      const statusTr = statusMap[String(row.status||'').toLowerCase()] || (row.status||'');
      tr.innerHTML = `
        <td>${escapeHtml(row.title||'')}</td>
        <td>${escapeHtml(statusTr)}</td>
        <td>${row.published_at ? new Date(row.published_at).toLocaleString('tr-TR') : '-'}</td>
        <td class="actions">
          <button class="btn btn-warning" data-edit-poster="${row.id}">Düzenle</button>
          ${String(row.status||'').toLowerCase()==='published'
            ? `<button class="btn btn-danger" data-unpub-poster="${row.id}">Yayından Kaldır</button>` 
            : `<button class="btn btn-success" data-pub-poster="${row.id}">Yayınla</button>` 
          }
        </td>`;
      tbody.appendChild(tr);
    });
    const addBtn = document.querySelector('#newPosterBtn');
    if (addBtn && !addBtn.dataset.wired){
      addBtn.dataset.wired='1';
      addBtn.onclick = ()=> openPosterModal({ id:null, title:'', body:'', image_url:'', status:'draft', published_at:null });
    }
    wirePostersRowActions();
  }catch(e){ alert('Afişler yüklenemedi: ' + (e?.message || String(e))); }
}

function wirePostersRowActions(){
  try{
    const tbody = document.querySelector('#postersTableBody'); if (!tbody) return;
    tbody.querySelectorAll('button[data-edit-poster]').forEach(btn=>{
      if (btn.dataset.wired) return; btn.dataset.wired='1';
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-edit-poster');
        try{
          const { data } = await sb().from('posters').select('*').eq('id', id).maybeSingle();
          openPosterModal(data||{ id, title:'', body:'', image_url:'', status:'draft', published_at:null });
        }catch(err){ alert('Afiş yüklenemedi: ' + (err?.message||String(err))); }
      });
    });
    tbody.querySelectorAll('button[data-pub-poster]').forEach(btn=>{
      if (btn.dataset.wired) return; btn.dataset.wired='1';
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-pub-poster');
        try{ const { error } = await sb().from('posters').update({ status:'published', published_at: new Date().toISOString() }).eq('id', id); if (error) throw error; await loadAdminPosters(); }catch(e){ alert('Yayınlanamadı: '+(e?.message||String(e))); }
      });
    });
    tbody.querySelectorAll('button[data-unpub-poster]').forEach(btn=>{
      if (btn.dataset.wired) return; btn.dataset.wired='1';
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-unpub-poster');
        try{ const { error } = await sb().from('posters').update({ status:'unpublished' }).eq('id', id); if (error) throw error; await loadAdminPosters(); }catch(e){ alert('Yayından kaldırılamadı: '+(e?.message||String(e))); }
      });
    });
  }catch{}
}

function openPosterModal(row){
  try{
    row = row || { id:null, title:'', body:'', image_url:'', status:'draft', published_at:null };
    $modalTitle().textContent = row.id ? 'Afişi Düzenle' : 'Yeni Afiş';
    const form = $modalForm(); form.innerHTML='';

    // Başlık
    const tLbl=document.createElement('label'); tLbl.style.display='grid'; tLbl.style.gap='6px'; tLbl.innerHTML='<span>Başlık</span>';
    const tIn=document.createElement('input'); tIn.value=row.title||''; tLbl.appendChild(tIn); form.appendChild(tLbl);

    // İçerik (Word benzeri editör)
    const bLbl=document.createElement('label'); bLbl.style.display='grid'; bLbl.style.gap='6px'; bLbl.innerHTML='<span>İçerik</span>';
    const tb=document.createElement('div'); tb.style.display='flex'; tb.style.flexWrap='wrap'; tb.style.gap='6px'; tb.style.margin='6px 0';
    const ed=document.createElement('div'); ed.contentEditable='true'; ed.className='card'; ed.style.minHeight='160px'; ed.style.padding='10px'; ed.style.overflow='auto'; ed.innerHTML = (row.body||'');
    function btn(label, title, on){ const b=document.createElement('button'); b.type='button'; b.className='btn btn-outline'; b.textContent=label; b.title=title; b.style.padding='6px 10px'; b.addEventListener('click', (e)=>{ e.preventDefault(); on(); ed.focus(); }); return b; }
    function applyInlineStyle(prop, val){
      const sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed){
        const span=document.createElement('span'); span.style[prop]=val; span.appendChild(document.createTextNode('\u200b'));
        range.insertNode(span); sel.removeAllRanges(); const r=document.createRange(); r.selectNodeContents(span); r.collapse(false); sel.addRange(r);
      } else {
        const span=document.createElement('span'); span.style[prop]=val; try{ range.surroundContents(span); }catch{ document.execCommand('foreColor'); }
      }
    }
    function applyBlock(cmd){ document.execCommand(cmd,false,null); }
    const ff=document.createElement('select'); ff.className='btn btn-outline'; ['Default','Arial','Georgia','Tahoma','Times New Roman','Verdana','Courier New'].forEach(f=>{ const o=document.createElement('option'); o.value=f==='Default'?'':f; o.textContent=f; ff.appendChild(o); }); ff.addEventListener('change',()=>{ if(ff.value) applyInlineStyle('fontFamily', ff.value); });
    const fs=document.createElement('input'); fs.type='number'; fs.min='10'; fs.max='72'; fs.value='16'; fs.title='Yazı Boyutu (px)'; fs.className='btn btn-outline'; fs.style.width='84px'; fs.addEventListener('change',()=> applyInlineStyle('fontSize', fs.value+'px'));
    const lh=document.createElement('select'); lh.className='btn btn-outline'; ['1.0','1.2','1.4','1.6','1.8','2.0'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent='Satır: '+v; lh.appendChild(o); }); lh.addEventListener('change',()=> applyInlineStyle('lineHeight', lh.value));
    const col=document.createElement('input'); col.type='color'; col.className='btn btn-outline'; col.title='Yazı Rengi'; col.addEventListener('input',()=> applyInlineStyle('color', col.value));
    tb.appendChild(btn('B','Kalın', ()=> applyBlock('bold')));
    tb.appendChild(btn('I','İtalik', ()=> applyBlock('italic')));
    tb.appendChild(btn('U','Altı Çizili', ()=> applyBlock('underline')));
    tb.appendChild(btn('Sol','Sola Hizala', ()=> applyBlock('justifyLeft')));
    tb.appendChild(btn('Ortala','Ortala', ()=> applyBlock('justifyCenter')));
    tb.appendChild(btn('Sağ','Sağa Hizala', ()=> applyBlock('justifyRight')));
    tb.appendChild(btn('İkiye','İki Yana Yasla', ()=> applyBlock('justifyFull')));
    tb.appendChild(btn('• Liste','Madde İşaretli', ()=> applyBlock('insertUnorderedList')));
    tb.appendChild(btn('1. Liste','Numaralı', ()=> applyBlock('insertOrderedList')));
    tb.appendChild(ff); tb.appendChild(fs); tb.appendChild(lh); tb.appendChild(col);
    bLbl.appendChild(tb); bLbl.appendChild(ed); form.appendChild(bLbl);

    // Görsel
    const iLbl=document.createElement('label'); iLbl.style.display='grid'; iLbl.style.gap='6px'; iLbl.innerHTML='<span>Görsel</span>';
    const iIn=document.createElement('input'); iIn.placeholder='https://...'; iIn.value=row.image_url||'';
    const iFile=document.createElement('input'); iFile.type='file'; iFile.accept='image/*';
    const iWrap=document.createElement('div'); iWrap.style.display='grid'; iWrap.style.gap='6px'; iWrap.appendChild(iIn); iWrap.appendChild(iFile); iLbl.appendChild(iWrap); form.appendChild(iLbl);

    // Durum / Tarih
    const stLbl=document.createElement('label'); stLbl.style.display='grid'; stLbl.style.gap='6px'; stLbl.innerHTML='<span>Durum</span>';
    const stSel=document.createElement('select');
    const statusOptsPoster = [
      { v:'draft', t:'Taslak' },
      { v:'published', t:'Yayımlandı' },
      { v:'unpublished', t:'Yayından Kaldırıldı' },
    ];
    statusOptsPoster.forEach(({v,t})=>{ const o=document.createElement('option'); o.value=v; o.textContent=t; if ((row.status||'draft')===v) o.selected=true; stSel.appendChild(o); });
    stLbl.appendChild(stSel); form.appendChild(stLbl);
    const pLbl=document.createElement('label'); pLbl.style.display='grid'; pLbl.style.gap='6px'; pLbl.innerHTML='<span>Yayın Tarihi</span>';
    const pIn=document.createElement('input'); pIn.type='datetime-local'; pIn.value=row.published_at? new Date(row.published_at).toISOString().slice(0,16):''; pLbl.appendChild(pIn); form.appendChild(pLbl);

    // Actions
    const actions=document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';
    const saveBtn=document.createElement('button'); saveBtn.className='btn btn-success'; saveBtn.textContent='Kaydet';
    const cancelBtn=document.createElement('button'); cancelBtn.className='btn btn-danger'; cancelBtn.textContent='İptal';
    actions.appendChild(saveBtn); actions.appendChild(cancelBtn); form.appendChild(actions);
    cancelBtn.addEventListener('click',(e)=>{ e.preventDefault(); closeModal(); });

    saveBtn.addEventListener('click', async (e)=>{
      e.preventDefault();
      try{
        const payload = {
          id: row.id || undefined,
          title: String(tIn.value||'').trim(),
          body: String(ed.innerHTML||'').trim(),
          image_url: String(iIn.value||'').trim() || null,
          status: String(stSel.value||'draft'),
          published_at: pIn.value ? new Date(pIn.value).toISOString() : null,
        };
        // Upload image file if provided
        if (iFile.files && iFile.files[0]){
          const f = iFile.files[0];
          const ext = (f.name.split('.').pop()||'jpg').toLowerCase();
          const path = `posters/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          try{ payload.image_url = await uploadToBucketGeneric(f, 'images', path); }
          catch(err){ return alert(String(err?.message||err)); }
        }
        const q = row.id
          ? sb().from('posters').update(payload).eq('id', row.id)
          : sb().from('posters').insert(payload).select('id').single();
        const { error } = await q; if (error) throw error;
        closeModal(); await loadAdminPosters();
      }catch(err){ alert('Kaydedilemedi: ' + (err?.message||String(err))); }
    });

    (typeof openModal === 'function' ? openModal() : (window.openModal && window.openModal()));
  }catch(e){ alert('Afiş formu açılamadı: ' + (e?.message||String(e))); }
}
// ========== RAPORLAR (REPORTS) ==========
async function loadAdminReports(){
  const tbody = document.querySelector('#reportsTableBody'); if (!tbody) return; tbody.innerHTML='';
  try{
    const table = tbody.closest('table');
    const headRow = table && table.tHead && table.tHead.rows && table.tHead.rows[0];
    if (headRow){
      headRow.innerHTML = '<th>Başlık</th><th>Durum</th><th>Yayınlanma Tarihi</th><th>İşlem</th>';
    }
  }catch{}
  try{
    const { data, error } = await sb().from('reports')
      .select('id, title, status, published_at')
      .order('published_at', { ascending:false, nullsFirst:true });
    if (error) throw error;
    (data||[]).forEach(row => {
      const tr=document.createElement('tr');
      const statusMap = { published:'Yayımlandı', draft:'Taslak', scheduled:'Planlı', archived:'Arşivli', unpublished:'Yayından Kaldırıldı' };
      const statusTr = statusMap[String(row.status||'').toLowerCase()] || (row.status||'');
      tr.innerHTML = `
        <td>${escapeHtml(row.title||'')}</td>
        <td>${escapeHtml(statusTr)}</td>
        <td>${row.published_at ? new Date(row.published_at).toLocaleString('tr-TR') : '-'}</td>
        <td class="actions">
          <button class="btn btn-warning" data-edit-report="${row.id}">Düzenle</button>
          ${String(row.status||'').toLowerCase()==='published'
            ? `<button class="btn btn-danger" data-unpub-report="${row.id}">Yayından Kaldır</button>` 
            : `<button class="btn btn-success" data-pub-report="${row.id}">Yayınla</button>` 
          }
        </td>`;
      tbody.appendChild(tr);
    });
    const addBtn = document.querySelector('#newReportBtn');
    if (addBtn && !addBtn.dataset.wired){
      addBtn.dataset.wired='1';
      addBtn.onclick = ()=> openReportModal({ id:null, title:'', file_url:'', status:'draft', published_at:null });
    }
    wireReportsRowActions();
  }catch(e){ alert('Raporlar yüklenemedi: ' + (e?.message || String(e))); }
}

function wireReportsRowActions(){
  try{
    const tbody = document.querySelector('#reportsTableBody'); if (!tbody) return;
    tbody.querySelectorAll('button[data-edit-report]').forEach(btn=>{
      if (btn.dataset.wired) return; btn.dataset.wired='1';
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-edit-report');
        try{
          const { data } = await sb().from('reports').select('*').eq('id', id).maybeSingle();
          openReportModal(data||{ id, title:'', file_url:'', status:'draft', published_at:null });
        }catch(err){ alert('Rapor yüklenemedi: ' + (err?.message||String(err))); }
      });
    });
    tbody.querySelectorAll('button[data-pub-report]').forEach(btn=>{
      if (btn.dataset.wired) return; btn.dataset.wired='1';
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-pub-report');
        try{ const { error } = await sb().from('reports').update({ status:'published', published_at: new Date().toISOString() }).eq('id', id); if (error) throw error; await loadAdminReports(); }catch(e){ alert('Yayınlanamadı: '+(e?.message||String(e))); }
      });
    });
    tbody.querySelectorAll('button[data-unpub-report]').forEach(btn=>{
      if (btn.dataset.wired) return; btn.dataset.wired='1';
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-unpub-report');
        try{ const { error } = await sb().from('reports').update({ status:'unpublished' }).eq('id', id); if (error) throw error; await loadAdminReports(); }catch(e){ alert('Yayından kaldırılamadı: '+(e?.message||String(e))); }
      });
    });
  }catch{}
}

function openReportModal(row){
  try{
    row = row || { id:null, title:'', file_url:'', status:'draft', published_at:null };
    $modalTitle().textContent = row.id ? 'Raporu Düzenle' : 'Yeni Rapor';
    const form = $modalForm(); form.innerHTML='';

    // Başlık
    const tLbl=document.createElement('label'); tLbl.style.display='grid'; tLbl.style.gap='6px'; tLbl.innerHTML='<span>Başlık</span>';
    const tIn=document.createElement('input'); tIn.value=row.title||''; tLbl.appendChild(tIn); form.appendChild(tLbl);

    // Dosya
    const fLbl=document.createElement('label'); fLbl.style.display='grid'; fLbl.style.gap='6px'; fLbl.innerHTML='<span>Dosya (PDF/Word)</span>';
    const fIn=document.createElement('input'); fIn.placeholder='https://...'; fIn.value=row.file_url||'';
    const fFile=document.createElement('input'); fFile.type='file'; fFile.accept='.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const fWrap=document.createElement('div'); fWrap.style.display='grid'; fWrap.style.gap='6px'; fWrap.appendChild(fIn); fWrap.appendChild(fFile); fLbl.appendChild(fWrap); form.appendChild(fLbl);

    // Durum / Tarih
    const stLbl=document.createElement('label'); stLbl.style.display='grid'; stLbl.style.gap='6px'; stLbl.innerHTML='<span>Durum</span>';
    const stSel=document.createElement('select');
    const statusOptsReport = [
      { v:'draft', t:'Taslak' },
      { v:'published', t:'Yayımlandı' },
      { v:'unpublished', t:'Yayından Kaldırıldı' },
    ];
    statusOptsReport.forEach(({v,t})=>{ const o=document.createElement('option'); o.value=v; o.textContent=t; if ((row.status||'draft')===v) o.selected=true; stSel.appendChild(o); });
    stLbl.appendChild(stSel); form.appendChild(stLbl);
    const pLbl=document.createElement('label'); pLbl.style.display='grid'; pLbl.style.gap='6px'; pLbl.innerHTML='<span>Yayın Tarihi</span>';
    const pIn=document.createElement('input'); pIn.type='datetime-local'; pIn.value=row.published_at? new Date(row.published_at).toISOString().slice(0,16):''; pLbl.appendChild(pIn); form.appendChild(pLbl);

    // Actions
    const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-success';
    saveBtn.textContent = 'Kaydet';
    actions.appendChild(saveBtn);
    form.appendChild(actions);
    const cancelBtn = document.createElement('button'); cancelBtn.className='btn btn-danger'; cancelBtn.textContent='İptal';
    actions.appendChild(cancelBtn);
    cancelBtn.addEventListener('click', (e)=>{ e.preventDefault(); closeModal(); });

    saveBtn.addEventListener('click', async (e)=>{
      e.preventDefault();
      const title = String(tIn.value||'').trim(); if (!title) return alert('Başlık gerekli');
      let file_url = String(fIn.value||'').trim();
      const status = stSel.value || 'draft';
      const published_at = pIn.value ? new Date(pIn.value).toISOString() : null;
      try {
        // Dosya seçilmişse yükle
        const f = fFile.files && fFile.files[0];
        if (f){
          const ext = (f.name.split('.').pop()||'pdf').toLowerCase();
          const key = `reports/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          try{
            file_url = await uploadToBucketGeneric(f, 'docs', key);
          }catch(err){
            return alert('Dosya yüklenemedi: ' + (err?.message || String(err)));
          }
        }

        // UPDATE vs INSERT
        const q = row.id
          ? sb().from('reports').update({ title, file_url, status, published_at }).eq('id', row.id)
          : sb().from('reports').insert({ title, file_url, status, published_at }).select('id').single();
        const { error } = await q;
        if (error) throw error;

        closeModal();
        await loadAdminReports();
      } catch (err) {
        alert('Kaydedilemedi: ' + (err?.message || String(err)));
      }
    });

    (typeof openModal === 'function' ? openModal() : (window.openModal && window.openModal()));
  }catch(e){ alert('Rapor formu açılamadı: ' + (e?.message||String(e))); }
}
  // Cache-bust helper (used by multiple modules)
  const bust = (u)=>{ try{ const x=new URL(u, location.origin); x.searchParams.set('v', Date.now()); return x.toString(); }catch{ return u; } };

  // ======= BOOT HELPERS (reintroduced minimal versions) =======
  function setupTabs(){
    try{
      qsa('.tabs button').forEach(btn => {
        if (btn.dataset.tabWired) return; btn.dataset.tabWired='1';
        btn.addEventListener('click', () => {
          qsa('.tabs button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const tab = btn.dataset.tab || 'news';
          enforceTabsVisibility(tab);
          refreshTab();
        });
      });
    }catch{}
  }

  function enforceTabsVisibility(active){
    try{
      const panels = qsa('.tab-panel');
      panels.forEach(el => el.classList.remove('active'));
      const target = qs(`#tab-${active}`);
      if (target){ target.classList.add('active'); target.style.display=''; }
      // set tab button active class
      qsa('.tabs button').forEach(b => b.classList.remove('active'));
      const btn = qs(`.tabs button[data-tab="${active}"]`);
      if (btn) btn.classList.add('active');
      currentTab = active;
    }catch{}
  }

  async function refreshTab(){
    try{
      if (currentTab === 'news' && typeof loadAdminNews === 'function') await loadAdminNews();
      else if (currentTab === 'ann' && typeof loadAdminAnnouncements === 'function') await loadAdminAnnouncements();
      else if (currentTab === 'msgs' && typeof loadAdminMessages === 'function') await loadAdminMessages();
      else if (currentTab === 'pages' && typeof loadAdminPages === 'function') await loadAdminPages();
      else if (currentTab === 'posters' && typeof loadAdminPosters === 'function') await loadAdminPosters();
      else if (currentTab === 'reports' && typeof loadAdminReports === 'function') await loadAdminReports();
      else if (currentTab === 'founders' && typeof loadAdminFounders === 'function') await loadAdminFounders();
      else if (currentTab === 'chairman' && typeof loadAdminChairman === 'function') await loadAdminChairman();
      else if (currentTab === 'members' && typeof loadAdminMembers === 'function') await loadAdminMembers();
      else if (currentTab === 'users' && typeof loadAdminUsers === 'function') await loadAdminUsers();
      else if (currentTab === 'settings' && typeof loadSettingsForm === 'function') await loadSettingsForm();
      else if (typeof loadAdminMembers === 'function') await loadAdminMembers(); // fallback
    }catch{}
  }

  async function loadAdminPermissions(email){
    try{
      if (!email) return { roles:[], allowed_tabs:[] };
      const { data } = await sb().from('admin_users').select('email, roles, allowed_tabs').eq('email', email).maybeSingle();
      return { email: data?.email||email, roles: (data?.roles)||[], allowed_tabs: (data?.allowed_tabs)||[] };
    }catch(e){ return { email, roles:[], allowed_tabs:[] }; }
  }

  function applyTabPermissions(){
    try{
      const defaultTabs = ['news','ann','msgs','pages','posters','reports','founders','chairman', 'members','users','settings'];
      const allowed = new Set((currentAdmin.allowed_tabs||[]).length ? currentAdmin.allowed_tabs : defaultTabs);
      defaultTabs.forEach(tab => {
        const btn = qs(`.tabs button[data-tab="${tab}"]`);
        const panel = qs(`#tab-${tab}`);
        const ok = allowed.has(tab) || (currentAdmin.roles||[]).includes('superadmin');
        if (btn) btn.style.display = ok ? '' : 'none';
        if (panel){
          if (!ok){ panel.classList.remove('active'); panel.style.display = 'none'; }
          else { panel.style.display = ''; }
        }
      });
      if (!allowed.has(currentTab) && !(currentAdmin.roles||[]).includes('superadmin')){
        enforceTabsVisibility('news');
      }
    }catch{}
  }

  async function checkSession(){
    try{
      const { data } = await sb().auth.getSession();
      if (data?.session?.user){
        $loginSection().hidden = true;
        $adminSection().hidden = false;
        $authStatus().textContent = data.session.user.email || 'Oturum açık';
        currentAdmin = await loadAdminPermissions(data.session.user.email);
        applyTabPermissions();
        // ensure initial tab
        enforceTabsVisibility(currentTab || 'news');
        await refreshTab();
      } else {
        showLogin();
      }
    }catch{ showLogin(); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!sb()) {
      alert('Supabase yapılandırması bulunamadı.');
      return;
    }
    try{ if (location.search) history.replaceState(null, '', location.pathname + location.hash); }catch{}
    setupAuth();
    setupTabs();
    try{ const btn = document.getElementById('logoutBtn'); if (btn && !btn.dataset.wired){ btn.dataset.wired='1'; btn.type='button'; btn.addEventListener('click', async (e)=>{ e.preventDefault(); try{ await sb().auth.signOut(); }catch{} try{ sessionStorage.clear(); }catch{} location.reload(); }); } }catch{}
    checkSession();
  });

  function setupAuth(){
    const form = qs('#loginForm');
    if (!form) return;
    try{ form.setAttribute('autocomplete','off'); }catch{}
    try{
      const emailIn = form.querySelector('input[name="email"]');
      const passIn = form.querySelector('input[name="password"]');
      if (emailIn) { emailIn.autocomplete='off'; emailIn.setAttribute('autocapitalize','none'); emailIn.setAttribute('spellcheck','false'); }
      if (passIn) { passIn.autocomplete='new-password'; passIn.setAttribute('inputmode','tel'); }
    }catch{}
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const email = String(fd.get('email')||'').trim();
      const password = String(fd.get('password')||'').trim();
      if (!email || !password) return;
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try{
        // wait for supabase client to be ready
        let tries = 0;
        while ((!sb() || !sb().auth) && tries < 10){ await new Promise(r=>setTimeout(r,100)); tries++; }

        const attempt = async () => {
          const { error } = await sb().auth.signInWithPassword({ email, password });
          if (error) throw error;
        };
        try{
          await attempt();
        }catch(err1){
          // transient NetworkError retry once
          const msg = (err1?.message||'').toLowerCase();
          if (msg.includes('network') || msg.includes('failed to fetch')){
            await new Promise(r=>setTimeout(r,300));
            await attempt();
          } else {
            throw err1;
          }
        }
        form.reset();
        await checkSession();
      } catch (err) {
        alert('Giriş başarısız: ' + (err?.message||String(err)));
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
// ========== CHAIRMAN (GENEL BAŞKAN) ==========
async function loadAdminChairman(){
  try{
    const panel = document.getElementById('chairmanPanel'); if (!panel) return; panel.innerHTML = '';
    const reloadBtn = document.getElementById('reloadChairmanBtn');
    if (reloadBtn && !reloadBtn.dataset.wired){
      reloadBtn.dataset.wired='1';
      reloadBtn.addEventListener('click', (e)=>{ e.preventDefault(); loadAdminChairman(); });
    }

    // Fetch latest single record
    let row = { id:null, photo_url:'', message_html:'', status:'draft' };
    try{
      const { data } = await sb()
        .from('chairman')
        .select('id, photo_url, message_html, status, updated_at')
        .order('updated_at', { ascending:false, nullsFirst:true })
        .limit(1);
      if (data && data.length) row = data[0] || row;
    }catch{}

    // Layout: left photo+crop, right message
    const wrap = document.createElement('div');
    wrap.style.display='grid';
    wrap.style.gridTemplateColumns='minmax(280px, 380px) 1fr';
    wrap.style.gap='16px'; wrap.style.alignItems='start';

    // Left: Photo + crop
    const left = document.createElement('div');
    left.className='card'; left.style.padding='10px'; left.style.display='grid'; left.style.gap='8px'; left.style.marginTop='8px';

    const lTitle = document.createElement('div'); lTitle.textContent='Fotoğraf ve Kadraj'; lTitle.style.fontWeight='600'; left.appendChild(lTitle);

    const prev = document.createElement('div');
    prev.style.width='100%'; prev.style.aspectRatio='3/4';
    prev.style.border='1px solid #e5e7eb'; prev.style.borderRadius='10px'; prev.style.overflow='hidden'; prev.style.backgroundRepeat='no-repeat'; prev.style.backgroundPosition='center center'; prev.style.backgroundSize='cover';
    left.appendChild(prev);

    const iUrl = document.createElement('input'); iUrl.type='url'; iUrl.placeholder='https://... (opsiyonel)'; iUrl.value = stripPhotoKey(row.photo_url||''); left.appendChild(iUrl);
    const iFile = document.createElement('input'); iFile.type='file'; iFile.accept='image/*'; left.appendChild(iFile);

    const meta0 = parsePhotoMeta(row.photo_url||'');
    const zLbl = document.createElement('label'); zLbl.style.display='grid'; zLbl.style.gap='4px'; zLbl.innerHTML='<span>Yakınlık</span>';
    const zRange = document.createElement('input'); zRange.type='range'; zRange.min='0.30'; zRange.max='2.00'; zRange.step='0.01'; zRange.value=String(meta0.z||1); zLbl.appendChild(zRange); left.appendChild(zLbl);

    const oyLbl = document.createElement('label'); oyLbl.style.display='grid'; oyLbl.style.gap='4px'; oyLbl.innerHTML='<span>Dikey Ofset</span>';
    const oyRange = document.createElement('input'); oyRange.type='range'; oyRange.min='-200'; oyRange.max='200'; oyRange.step='1'; oyRange.value=String(meta0.oy||0); oyLbl.appendChild(oyRange); left.appendChild(oyLbl);

    const oxLbl = document.createElement('label'); oxLbl.style.display='grid'; oxLbl.style.gap='4px'; oxLbl.innerHTML='<span>Yatay Ofset</span>';
    const oxRange = document.createElement('input'); oxRange.type='range'; oxRange.min='-200'; oxRange.max='200'; oxRange.step='1'; oxRange.value=String(meta0.ox||0); oxLbl.appendChild(oxRange); left.appendChild(oxLbl);

   // Önizleme
   const prevCanvas = document.createElement('canvas');
   prevCanvas.width = 200;
   prevCanvas.height = 200;
   prevCanvas.style.border = '1px solid #e5e7eb';
   prevCanvas.style.borderRadius = '10px';
   left.appendChild(prevCanvas);

   let prevImg = null;
   async function ensurePrevImg(){
     if (prevImg) return prevImg;
     try{
       if (iFile.files && iFile.files[0]){
         prevImg = await new Promise((res)=>{ const i=new Image(); i.onload=()=>res(i); try{i.src=URL.createObjectURL(iFile.files[0]);}catch{res(null);} });
         return prevImg;
       } else if (iUrl.value || row.photo_url){
         const u = stripPhotoKey(iUrl.value || row.photo_url || '');
         if (!u) return null;
         prevImg = await new Promise((res)=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=u; });
         return prevImg;
       }
     }catch{}
     return null;
   }

   async function drawPrev(){
     const ctx = prevCanvas.getContext('2d');
     ctx.clearRect(0,0,prevCanvas.width,prevCanvas.height);
     const img = await ensurePrevImg();
     if (!img){ ctx.fillStyle='#e5e7eb'; ctx.fillRect(0,0,prevCanvas.width,prevCanvas.height); ctx.restore(); return; }
     const R = 78; const baseScale = Math.max((R*2)/img.width, (R*2)/img.height);
     let scale = baseScale * Number(zRange.value||1);
     if (img.width*scale < R*2 || img.height*scale < R*2) scale = baseScale;
     const w = img.width*scale, h = img.height*scale;
     const x = 80 - w/2 + Number(oxRange.value||0);
     const y = 80 - h/2 + Number(oyRange.value||0);
     try{ ctx.drawImage(img, x, y, w, h); }catch{}
     ctx.restore();
     ctx.beginPath(); ctx.arc(80,80,78,0,Math.PI*2); ctx.closePath(); ctx.strokeStyle='#0ea5b1'; ctx.lineWidth=3; ctx.stroke();
     ctx.beginPath(); ctx.arc(80,80,72,0,Math.PI*2); ctx.closePath(); ctx.strokeStyle='#fb923c'; ctx.lineWidth=2; ctx.stroke();
   }

   drawPrev();

   zRange.addEventListener('input', drawPrev);
   oxRange.addEventListener('input', drawPrev);
   oyRange.addEventListener('input', drawPrev);
   iFile.addEventListener('change', ()=>{ prevImg = null; drawPrev(); });
   iUrl.addEventListener('change', ()=>{ prevImg = null; drawPrev(); });

   // Right: Message editor + status + actions
   const right = document.createElement('div'); right.className='card'; right.style.padding='10px'; right.style.display='grid'; right.style.gap='8px'; right.style.marginTop='8px';
   const rTitle = document.createElement('div'); rTitle.textContent='Mesaj Metni'; rTitle.style.fontWeight='600'; right.appendChild(rTitle);

   const tb=document.createElement('div'); tb.style.display='flex'; tb.style.flexWrap='wrap'; tb.style.gap='6px'; tb.style.margin='6px 0';
   const ed=document.createElement('div'); ed.contentEditable='true'; ed.className='card'; ed.style.minHeight='260px'; ed.style.padding='10px'; ed.style.overflow='auto'; ed.innerHTML = (row.message_html||'');
   function btn(label, title, on){ const b=document.createElement('button'); b.type='button'; b.className='btn btn-outline'; b.textContent=label; b.title=title; b.style.padding='6px 10px'; b.addEventListener('click', (e)=>{ e.preventDefault(); on(); ed.focus(); }); return b; }
   function applyBlock(cmd){ document.execCommand(cmd,false,null); }
   tb.appendChild(btn('B','Kalın', ()=> applyBlock('bold')));
   tb.appendChild(btn('I','İtalik', ()=> applyBlock('italic')));
   tb.appendChild(btn('U','Altı Çizili', ()=> applyBlock('underline')));
   tb.appendChild(btn('Sol','Sola Hizala', ()=> applyBlock('justifyLeft')));
   tb.appendChild(btn('Ortala','Ortala', ()=> applyBlock('justifyCenter')));
   tb.appendChild(btn('Sağ','Sağa Hizala', ()=> applyBlock('justifyRight')));
   tb.appendChild(btn('İkiye','İki Yana Yasla', ()=> applyBlock('justifyFull')));
   tb.appendChild(btn('• Liste','Madde İşaretli', ()=> applyBlock('insertUnorderedList')));
   tb.appendChild(btn('1. Liste','Numaralı', ()=> applyBlock('insertOrderedList')));
   right.appendChild(tb);
   right.appendChild(ed);

   const stLbl=document.createElement('label'); stLbl.style.display='grid'; stLbl.style.gap='6px'; stLbl.innerHTML='<span>Durum</span>';
   const stSel=document.createElement('select'); ['draft','published','unpublished'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=({draft:'Taslak', published:'Yayımlandı', unpublished:'Yayından Kaldırıldı'}[v]||v); if ((row.status||'draft')===v) o.selected=true; stSel.appendChild(o); }); stLbl.appendChild(stSel); right.appendChild(stLbl);

   const actions=document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';
   const saveBtn=document.createElement('button'); saveBtn.className='btn btn-success'; saveBtn.textContent='Kaydet';
   const cancelBtn=document.createElement('button'); cancelBtn.className='btn btn-danger'; cancelBtn.textContent='İptal';
   actions.appendChild(saveBtn); actions.appendChild(cancelBtn); right.appendChild(actions);

   cancelBtn.addEventListener('click', (e)=>{ e.preventDefault(); /* stay in tab */ });

   saveBtn.addEventListener('click', async (e)=>{
     e.preventDefault();
     try{
       let photoUrl = String(iUrl.value||'').trim() || stripPhotoKey(row.photo_url||'');
       const f = iFile.files && iFile.files[0];
       if (f){
         const ext = (f.name.split('.').pop()||'jpg').toLowerCase();
         const key = `chairman/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
         photoUrl = await uploadToBucketGeneric(f, 'images', key);
       }
       const meta = { z: Number(zRange.value||1), ox: Number(oxRange.value||0), oy: Number(oyRange.value||0) };
       const finalPhoto = photoUrl ? buildPhotoValue(photoUrl, meta) : '';
       const payload = { photo_url: finalPhoto, message_html: String(ed.innerHTML||'').trim(), status: stSel.value||'draft', updated_at: new Date().toISOString() };
       const q = row.id
         ? sb().from('chairman').update(payload).eq('id', row.id)
         : sb().from('chairman').insert(payload).select('id').single();
       const { error } = await q; if (error) throw error;
       alert('Kaydedildi');
       await loadAdminChairman();
     }catch(err){ alert('Kaydedilemedi: ' + (err?.message||String(err))); }
   });

   wrap.appendChild(left); wrap.appendChild(right);
   panel.appendChild(wrap);
  }catch(e){ alert('Genel Başkan formu açılamadı: ' + (e?.message||String(e))); }
}
// ========== KURUCULAR (FOUNDERS) ==========
async function loadAdminFounders(){
  const tbody = $foundersTBody(); if (!tbody) return;
  tbody.innerHTML = '';

  try{
    const table = tbody.closest('table');
    const headRow = table && table.tHead && table.tHead.rows && table.tHead.rows[0];
    if (headRow){
      headRow.innerHTML = '<th>Görsel</th><th>Ad Soyad</th><th>Sıra</th><th>Durum</th><th class="col-actions">İşlem</th>';
    }
  }catch{}

  try{
    const { data, error } = await sb()
      .from('founders')
      .select('id, name, image_url, sort, status')
      .order('sort', { ascending: true, nullsFirst: true })
      .order('name');
    if (error) throw error;
    (data||[]).forEach(row => {
      const tr=document.createElement('tr');
      const img = row.image_url ? `<img src="${escapeHtml(stripPhotoKey(row.image_url))}" alt="${escapeHtml(row.name||'Kurucu')}" />`  : '';
      tr.innerHTML = `
        <td>${img}</td>
        <td>${escapeHtml(row.name || '')}</td>
        <td>${Number(row.sort || '') || ''}</td>
        <td>${escapeHtml(({published:'Yayımlandı',draft:'Taslak',scheduled:'Planlı',archived:'Arşivli',unpublished:'Yayından Kaldırıldı'}[String(row.status||'').toLowerCase()]||row.status||'draft'))}</td>
        <td class="actions">
          <button class="btn btn-warning" data-edit-founder="${row.id}">Düzenle</button>
          <button class="btn btn-danger" data-del-founder="${row.id}">Sil</button>
          ${String(row.status||'').toLowerCase()==='published'
            ? `<button class="btn btn-danger" data-unpub-founder="${row.id}">Yayından Kaldır</button>` 
            : `<button class="btn btn-success" data-pub-founder="${row.id}">Yayınla</button>` 
          }
        </td>`;
      tbody.appendChild(tr);
    });

    // “Yeni Kurucu” butonunu bağla
    const addBtn = qs('#newFounderBtn');
    if (addBtn && !addBtn.dataset.wired){
      addBtn.dataset.wired = '1';
      addBtn.onclick = () =>
        openFounderModal({ id: null, name: '', image_url: '', sort: (Date.now() % 1000), status: 'draft' });
    }

    wireFoundersRowActions();
  }catch(e){
    alert('Kurucular yüklenemedi: ' + (e?.message || String(e)));
  }
}

function wireFoundersRowActions(){
  try{
    const tbody = $foundersTBody(); if (!tbody) return;

    tbody.querySelectorAll('button[data-edit-founder]').forEach(btn => {
      if (btn.dataset.wired) return; btn.dataset.wired = '1';
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-edit-founder');
        try{
          const { data } = await sb().from('founders').select('*').eq('id', id).maybeSingle();
          openFounderModal(data || { id, name:'', image_url:'', sort:1, status:'draft' });
        }catch(e){
          alert('Açılamadı: ' + (e?.message || String(e)));
        }
      });
    });

    tbody.querySelectorAll('button[data-del-founder]').forEach(btn => {
      if (btn.dataset.wired) return; btn.dataset.wired = '1';
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-founder');
        if (!confirm('Silinsin mi?')) return;
        try{
          const { error } = await sb().from('founders').delete().eq('id', id);
          if (error) throw error;
          await loadAdminFounders();
        }catch(e){
          alert('Silinemedi: ' + (e?.message || String(e)));
        }
      });
    });

    tbody.querySelectorAll('button[data-pub-founder]').forEach(btn => {
      if (btn.dataset.wired) return; btn.dataset.wired = '1';
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-pub-founder');
        try{
          const { error } = await sb().from('founders').update({ status:'published' }).eq('id', id);
          if (error) throw error;
          await loadAdminFounders();
        }catch(e){
          alert('Yayınlanamadı: ' + (e?.message || String(e)));
        }
      });
    });

    tbody.querySelectorAll('button[data-unpub-founder]').forEach(btn => {
      if (btn.dataset.wired) return; btn.dataset.wired = '1';
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-unpub-founder');
        try{
          const { error } = await sb().from('founders').update({ status:'unpublished' }).eq('id', id);
          if (error) throw error;
          await loadAdminFounders();
        }catch(e){
          alert('Yayından kaldırılamadı: ' + (e?.message || String(e)));
        }
      });
    });
  }catch{}
}

function openFounderModal(row){
  try{
    row = row || { id: null, name: '', image_url: '', sort: 1, status: 'draft' };
    $modalTitle().textContent = row.id ? 'Kurucuyu Düzenle' : 'Yeni Kurucu';
    const form = $modalForm(); form.innerHTML='';

    // Ad Soyad
    const nLbl = document.createElement('label'); nLbl.style.display='grid'; nLbl.style.gap='6px'; nLbl.innerHTML='<span>Ad Soyad</span>';
    const nIn = document.createElement('input'); nIn.value=row.name||''; nLbl.appendChild(nIn); form.appendChild(nLbl);

    // Görsel (URL + Dosya Yükleme)
    const iLbl = document.createElement('label'); iLbl.style.display='grid'; iLbl.style.gap='6px'; iLbl.innerHTML='<span>Görsel URL</span>';
    const iIn = document.createElement('input'); iIn.placeholder='https://...'; iIn.value=row.image_url||'';
    const iFile = document.createElement('input'); iFile.type='file'; iFile.accept='image/*';
    const iWrap = document.createElement('div'); iWrap.style.display='grid'; iWrap.style.gap='6px'; iWrap.appendChild(iIn); iWrap.appendChild(iFile); iLbl.appendChild(iWrap); form.appendChild(iLbl);

    // Fotoğraf Kadrajı (kurucular için)
    const cropWrap = document.createElement('div');
    cropWrap.className = 'card';
    cropWrap.style.padding = '10px';
    cropWrap.style.display = 'grid';
    cropWrap.style.gap = '8px';
    cropWrap.style.marginTop = '8px';

    const cropTitle = document.createElement('div');
    cropTitle.textContent = 'Fotoğraf Kadrajı';
    cropTitle.style.fontWeight = '600';
    cropWrap.appendChild(cropTitle);

    const initMeta = parsePhotoMeta(row.image_url || '');

    // Zoom
    const zoomLbl = document.createElement('label');
    zoomLbl.style.display = 'grid';
    zoomLbl.style.gap = '4px';
    zoomLbl.innerHTML = '<span>Yakınlık</span>';
    const zRange = document.createElement('input');
    zRange.type = 'range';
    zRange.min = '0.30';
    zRange.max = '2.00';
    zRange.step = '0.01';
    zRange.value = String(initMeta.z || 1);
    zoomLbl.appendChild(zRange);
    cropWrap.appendChild(zoomLbl);

    // Dikey Ofset
    const oyLbl = document.createElement('label');
    oyLbl.style.display = 'grid';
    oyLbl.style.gap = '4px';
    oyLbl.innerHTML = '<span>Dikey Ofset</span>';
    const oyRange = document.createElement('input');
    oyRange.type = 'range';
    oyRange.min = '-160';
    oyRange.max = '160';
    oyRange.step = '1';
    oyRange.value = String(initMeta.oy || 0);
    oyLbl.appendChild(oyRange);
    cropWrap.appendChild(oyLbl);

    // Yatay Ofset
    const oxLbl = document.createElement('label');
    oxLbl.style.display = 'grid';
    oxLbl.style.gap = '4px';
    oxLbl.innerHTML = '<span>Yatay Ofset</span>';
    const oxRange = document.createElement('input');
    oxRange.type = 'range';
    oxRange.min = '-160';
    oxRange.max = '160';
    oxRange.step = '1';
    oxRange.value = String(initMeta.ox || 0);
    oxLbl.appendChild(oxRange);
    cropWrap.appendChild(oxLbl);

   // Önizleme
   const prevCanvas = document.createElement('canvas');
   prevCanvas.width = 200;
   prevCanvas.height = 200;
   prevCanvas.style.border = '1px solid #e5e7eb';
   prevCanvas.style.borderRadius = '10px';
   cropWrap.appendChild(prevCanvas);

   let prevImg = null;
   async function ensurePrevImg(){
     if (prevImg) return prevImg;
     try{
       if (iFile.files && iFile.files[0]){
         prevImg = await new Promise((res)=>{ const i=new Image(); i.onload=()=>res(i); try{i.src=URL.createObjectURL(iFile.files[0]);}catch{res(null);} });
         return prevImg;
       } else if (iIn.value || row.image_url){
         const u = stripPhotoKey(iIn.value || row.image_url || '');
         if (!u) return null;
         prevImg = await new Promise((res)=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=u; });
         return prevImg;
       }
     }catch{}
     return null;
   }

   async function drawPrev(){
     const ctx = prevCanvas.getContext('2d');
     ctx.clearRect(0,0,prevCanvas.width,prevCanvas.height);
     const img = await ensurePrevImg();
     if (!img){ ctx.fillStyle='#e5e7eb'; ctx.fillRect(0,0,prevCanvas.width,prevCanvas.height); ctx.restore(); return; }
     const R = 78; const baseScale = Math.max((R*2)/img.width, (R*2)/img.height);
     let scale = baseScale * Number(zRange.value||1);
     if (img.width*scale < R*2 || img.height*scale < R*2) scale = baseScale;
     const w = img.width*scale, h = img.height*scale;
     const x = 80 - w/2 + Number(oxRange.value||0);
     const y = 80 - h/2 + Number(oyRange.value||0);
     try{ ctx.drawImage(img, x, y, w, h); }catch{}
     ctx.restore();
     ctx.beginPath(); ctx.arc(80,80,78,0,Math.PI*2); ctx.closePath(); ctx.strokeStyle='#0ea5b1'; ctx.lineWidth=3; ctx.stroke();
     ctx.beginPath(); ctx.arc(80,80,72,0,Math.PI*2); ctx.closePath(); ctx.strokeStyle='#fb923c'; ctx.lineWidth=2; ctx.stroke();
   }

   drawPrev();

   zRange.addEventListener('input', drawPrev);
   oxRange.addEventListener('input', drawPrev);
   oyRange.addEventListener('input', drawPrev);
   iFile.addEventListener('change', ()=>{ prevImg = null; drawPrev(); });
   iIn.addEventListener('change', ()=>{ prevImg = null; drawPrev(); });

   drawPrev();

   // Sıra
   const sLbl = document.createElement('label'); sLbl.style.display='grid'; sLbl.style.gap='6px'; sLbl.innerHTML='<span>Sıra</span>';
   const sIn = document.createElement('input'); sIn.type='number'; sIn.step='1'; sIn.value = String(row.sort || 1); sLbl.appendChild(sIn); form.appendChild(sLbl);

   // Durum
   const stLbl = document.createElement('label'); stLbl.style.display='grid'; stLbl.style.gap='6px'; stLbl.innerHTML='<span>Durum</span>';
   const stSel = document.createElement('select');
   ['draft', 'published', 'unpublished'].forEach(v => {
     const o = document.createElement('option'); o.value = v; o.textContent = ({draft:'Taslak', published:'Yayımlandı', unpublished:'Yayından Kaldırıldı'}[v]||v);
     if ((row.status || 'draft') === v) o.selected = true;
     stSel.appendChild(o);
   });
   stLbl.appendChild(stSel); form.appendChild(stLbl);

   // Actions
   const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';
   const saveBtn = document.createElement('button');
   saveBtn.type = 'button';
   saveBtn.className = 'btn btn-success';
   saveBtn.textContent = 'Kaydet';
   actions.appendChild(saveBtn);
   form.appendChild(actions);
   const cancelBtn = document.createElement('button'); cancelBtn.className='btn btn-danger'; cancelBtn.textContent='İptal';
   actions.appendChild(cancelBtn);
   cancelBtn.addEventListener('click', (e)=>{ e.preventDefault(); closeModal(); });

   saveBtn.addEventListener('click', async (e)=>{
     e.preventDefault();
     const name = String(nIn.value || '').trim(); if (!name) return alert('Ad Soyad gerekli');
     let image_url = String(iIn.value || '').trim();
     const sort = Number(sIn.value || 1) || 1;
     const status = stSel.value || 'draft';
     try{
       // Dosya seçilmişse yükle
       const f = iFile.files && iFile.files[0];
       if (f){
         const ext = (f.name.split('.').pop()||'jpg').toLowerCase();
         const key = `founders/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
         try{
           image_url = await uploadToBucketGeneric(f, 'founders', key);
         }catch(err){
           return alert('Görsel yüklenemedi: ' + (err?.message || String(err)));
         }
       }

       // Kadraj bilgisini URL'e ekle
       const cropMeta = {
        z: Number((zRange && zRange.value) || 1),
        ox: Number((oxRange && oxRange.value) || 0),
        oy: Number((oyRange && oyRange.value) || 0),
      };
      if (image_url) image_url = buildPhotoValue(image_url, cropMeta);

       const payload = { name, image_url, sort, status };
       const q = row.id
         ? sb().from('founders').update(payload).eq('id', row.id)
         : sb().from('founders').insert(payload).select('id').single();
       const { error } = await q;
       if (error) throw error;

       closeModal();
       await loadAdminFounders();
     }catch(err){
       alert('Kaydedilemedi: ' + (err?.message || String(err)));
     }
   });

   (typeof openModal === 'function' ? openModal() : (window.openModal && window.openModal()));
 }catch(e){
   alert('Kurucu formu açılamadı: ' + (e?.message || String(e)));
 }
}
})();



