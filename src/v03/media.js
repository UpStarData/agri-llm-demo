/* Remote image references and source credits. No image files are bundled or downloaded. */
window.V03Media = (() => {
  const catalog = window.__AGRI_PKG2__?.media || { topics:{}, articles:{} };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safe = url => { try { const u=new URL(url);return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } };
  function topic(item) {
    const text=[item?.title,item?.name,item?.summary,item?.card?.commodityName,...(item?.commodityTags || [])].join(' ');
    const key=/榴莲|durian/i.test(text)?'durian':/车厘子|樱桃|cherr/i.test(text)?'cherry':/辣椒|chili|pepper/i.test(text)?'chili':
      /气象|天气|降水|风速|weather|nature|wild/i.test(text)?'weather':/水稻|大米|稻田|rice/i.test(text)?'rice':
      /香蕉|banana/i.test(text)?'banana':/机场|airport|air cargo/i.test(text)?'airport':/市场|农批|红星|冷链|物流/.test(text)?'market':'vegetables';
    const image=catalog.topics[key]?.url ? catalog.topics[key] : catalog.topics.weather;
    return key==='vegetables' && item?.domain==='commodity' ? {...image,caption:'农产品主题资料图（非该品种实拍）'} : image;
  }
  function photo(item,kind='fact') {
    if(!item)return topic(item);
    if(item.image?.url && safe(item.image.url))return item.image;
    if(catalog.objects?.[item.id]?.url)return catalog.objects[item.id];
    const article=catalog.articles?.[item.sourceUrl];
    if(article?.url)return article;
    if(kind==='fact' && item.prov==='real' && safe(item.card?.imageUrl))return {url:item.card.imageUrl,sourceUrl:item.sourceUrl,caption:'来源原文配图'};
    if(kind==='fact')for(const id of item.objects||[]){const o=window.V03Data.objById(id);if(o?.image?.url)return o.image;}
    if(kind==='object') {
      for(const id of item.factIds || []) { const f=window.V03Data.factById(id), a=catalog.articles?.[f?.sourceUrl];if(a?.url)return a; }
    }
    return topic(item);
  }
  let cardPhotos = new Set();
  function beginCards(){cardPhotos = new Set();}
  function figure(item,kind='fact',detail=false) {
    const image=photo(item,kind), fallback=topic(item);
    if(!image?.url || !safe(image.url))return '';
    const hash=[...String(item.id)].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,0);
    if(!detail && kind==='fact' && item.cardType==='video')return '';
    const explicit=!!(catalog.articles?.[item.sourceUrl]?.url || item.image?.url || catalog.objects?.[item.id]?.url);
    // Cards use a photo once per panel, never a repeated generic weather thumbnail.
    if(!detail && (!explicit && kind==='fact' || cardPhotos.has(image.url)))return '';
    if(!detail && !explicit && item.domain!=='commodity' && hash%4!==0)return '';
    if(!detail)cardPhotos.add(image.url);
    const caption=image.caption || '主题资料图';
    const credit=[image.credit,image.license].filter(Boolean).join(' · ');
    return '<figure class="media-figure '+(detail?'detail':'card')+'"><img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="'+esc(safe(image.url))+'" data-fallback="'+esc(safe(fallback?.url))+'" alt="'+esc(image.alt || item.title || item.name)+'">'+
      '<figcaption>'+(detail && safe(image.sourceUrl)?'<a target="_blank" rel="noopener noreferrer" href="'+esc(safe(image.sourceUrl))+'">'+esc(caption)+'</a>':esc(caption))+
      (detail && credit?' · '+esc(credit):'')+'</figcaption></figure>';
  }
  function mount(scope) {
    scope.querySelectorAll('.media-figure img').forEach(img => {
      if(img.dataset.bound)return;img.dataset.bound='1';
      img.addEventListener('error',()=>{
        if(img.closest('figure').classList.contains('card')){img.closest('figure').hidden=true;}
        else if(img.dataset.fallback && img.src!==img.dataset.fallback){img.src=img.dataset.fallback;img.dataset.fallback='';const cap=img.closest('figure').querySelector('figcaption');cap.textContent='主题资料图 · Wikimedia Commons';}
        else {img.hidden=true;img.closest('figure').classList.add('unavailable');}
      });
    });
  }
  return { photo, figure, mount, beginCards };
})();
