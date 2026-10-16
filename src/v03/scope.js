/* Shared geographic scope for facts, business ontologies, cards and counts. */
window.V03Scope=(()=>{
 const areas=window.__AGRI_PKG2__?.hunanAreas?.areas||[],byCode=new Map(areas.map(a=>[a.code,a])),cache=new Map();
 const short=n=>String(n||'').replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g,'');
 function ring(pt,r){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>pt[1])!==(b[1]>pt[1])&&pt[0]<(b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
 function contains(area,x,y){const key=area.code+'|'+x+'|'+y;if(cache.has(key))return cache.get(key);const g=area.geometry,polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;const ok=polys.some(p=>ring([x,y],p[0])&&!p.slice(1).some(h=>ring([x,y],h)));cache.set(key,ok);return ok;}
 function includes(item,geo={}){
  const {lng:x,lat:y}=item;if(!Number.isFinite(x)||!Number.isFinite(y))return false;
  const level=geo.level||'L1';if(level==='L1')return true;
  const path=item.regionPath||[],country=path.find(p=>p.level==='country');
  if(country&&!['CHN','CN','中国'].includes(country.code)&&country.name!=='中国')return false;
  if(x<73||x>136||y<17.5||y>54.5)return false;
  if(level==='L2')return !window.V03Mass||V03Mass.insideMap('L2',x,y);
  const province=item.province||path.find(p=>p.level==='province')?.name;
  if(province&&short(province)!==short(geo.focus||'湖南'))return false;
  if(short(geo.focus||'湖南')==='湖南'&&!V03Mass.insideMap('L3',x,y))return false;
  if(short(geo.focus||'湖南')!=='湖南'&&!province){const c=V03Data.PROV_CENTER[short(geo.focus)];if(!c||Math.abs(x-c[0])>2.8||Math.abs(y-c[1])>2.4)return false;}
  const area=byCode.get(geo.county||geo.city);return !area||contains(area,x,y);
 }
 const hongxingId=id=>['e:ent-hongxing-group','e:mkt-hongxing','e:fac:cold-hn-hongxing'].includes(id)||String(id).startsWith('e:v23:hongxing-')||String(id).startsWith('e:v25:');
 const priority=o=>hongxingId(o.id)||/榴莲|车厘子|辣椒/.test(o.name||'')||String(o.id).startsWith('v25-hongxing')||String(o.id).startsWith('v23-hongxing')||(o.objects||[]).some(hongxingId);
 function mount(host,geo,onChange){
  let el=host.querySelector('.area-scope');
  if(geo.level!=='L3'||short(geo.focus||'湖南')!=='湖南'){if(el)el.remove();return;}
  if(!el){el=document.createElement('div');el.className='area-scope';host.appendChild(el);}
  const key=[geo.city,geo.county].join('|');if(el.dataset.scope===key)return;el.dataset.scope=key;
  const option=(list,value,label)=>'<option value="">'+label+'</option>'+list.map(a=>'<option value="'+a.code+'"'+(a.code===value?' selected':'')+'>'+a.name+'</option>').join('');
  el.innerHTML='<label>市 <select aria-label="市级范围">'+option(areas.filter(a=>a.level==='city'),geo.city,'全省')+'</select></label><label>县区 <select aria-label="县区范围" '+(!geo.city?'disabled':'')+'>'+option(areas.filter(a=>a.level==='county'&&a.city===geo.city),geo.county,'全市')+'</select></label>';
  const [city,county]=el.querySelectorAll('select');city.onchange=()=>onChange({city:city.value||null,county:null});county.onchange=()=>onChange({county:county.value||null});
 }
 return {includes,priority,areas,mount};
})();
