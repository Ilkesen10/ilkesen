'use strict';

(async function(){
  const sb = () => window.ilkeSupabase;
  const $ = (s, r=document) => r.querySelector(s);

  async function importMap(map){
    const status = (msg, el) => el && (el.textContent = msg);
    const el = $('#statusProject') || $('#statusFile');
    try{
      if (!sb()) throw new Error('Supabase yapılandırması bulunamadı');
      // Call SQL function import_districts_map(jsonb)
      const { error } = await sb().rpc('import_districts_map', { districts_map: map });
      if (error) throw error;
      status('Tamamlandı ✔️', el);
    }catch(e){
      status('Hata: ' + (e?.message||String(e)), el);
    }
  }

  $('#btnLoadFromProject')?.addEventListener('click', async ()=>{
    const s = $('#statusProject'); s.textContent = 'Yükleniyor...';
    try{
      const resp = await fetch('../data/districts_tr.json');
      const json = await resp.json();
      await importMap(json);
    }catch(e){ s.textContent = 'Hata: ' + (e?.message||String(e)); }
  });

  $('#btnLoadFromFile')?.addEventListener('click', async ()=>{
    const s = $('#statusFile'); s.textContent = 'Yükleniyor...';
    try{
      const file = $('#fileInput').files?.[0];
      if (!file) throw new Error('JSON dosyası seçiniz');
      const text = await file.text();
      const json = JSON.parse(text);
      await importMap(json);
    }catch(e){ s.textContent = 'Hata: ' + (e?.message||String(e)); }
  });
})();
