/* 关联层正交地球：与二维地图共用真实本体经纬度和关系，不依赖在线底图。 */
window.V03RelGlobe = (function () {
  let canvas, ctx, visible = false, raf = 0, last = 0, rotation = 105, tilt = .22, radiusScale = .38;
  let nodes = [], routes = [], hits = [], onSelect = () => {}, pointer = null, pauseUntil = 0;
  const rad = Math.PI / 180;
  const polygons = window.V03Fact.worldGeoJSON(false).features.flatMap(f =>
    (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
      .map(rings => ({ name: f.properties.name, ring: rings[0] })));
  const colors = () => {
    const css = getComputedStyle(document.documentElement);
    return { ocean: css.getPropertyValue('--ocean').trim(), line: css.getPropertyValue('--map-line').trim(),
      accent: css.getPropertyValue('--accent').trim(), land: css.getPropertyValue('--land').trim() };
  };
  function mount(el, select) {
    canvas = el; ctx = canvas.getContext('2d'); onSelect = select;
    canvas.addEventListener('pointerdown', e => { pointer = { x: e.clientX, y: e.clientY, moved: false }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!pointer) return;
      const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
      pointer.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
      rotation = (rotation - dx * .38 + 360) % 360;
      tilt = Math.max(-.55, Math.min(.55, tilt + dy * .003));
      pointer.x = e.clientX; pointer.y = e.clientY; pauseUntil = performance.now() + 2200;
    });
    canvas.addEventListener('pointerup', e => {
      if (!pointer) return;
      if (!pointer.moved) {
        const rect = canvas.getBoundingClientRect();
        const hit = hits.find(h => Math.hypot(h.x - (e.clientX - rect.left), h.y - (e.clientY - rect.top)) < 9);
        if (hit) onSelect(hit.id);
      }
      pointer = null;
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      radiusScale = Math.max(.27, Math.min(.47, radiusScale * (e.deltaY < 0 ? 1.1 : .9)));
      pauseUntil = performance.now() + 1800;
    }, { passive: false });
    window.addEventListener('resize', resize);
  }
  function resize() {
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function project(lng, lat, cx, cy, R, altitude = 1) {
    const lambda = (lng - rotation) * rad, phi = lat * rad;
    const x = Math.cos(phi) * Math.sin(lambda), y = Math.sin(phi), z = Math.cos(phi) * Math.cos(lambda);
    return { x: cx + R * altitude * x, y: cy - R * altitude * (y * Math.cos(tilt) - z * Math.sin(tilt)),
      z: y * Math.sin(tilt) + z * Math.cos(tilt) };
  }
  function arc(a, b) {
    const xyz = p => [Math.cos(p.lat * rad) * Math.cos(p.lng * rad), Math.cos(p.lat * rad) * Math.sin(p.lng * rad), Math.sin(p.lat * rad)];
    const u = xyz(a), v = xyz(b), angle = Math.acos(Math.max(-1, Math.min(1, u.reduce((sum, x, i) => sum + x * v[i], 0))));
    const sine = Math.sin(angle);
    return Array.from({ length: 33 }, (_, i) => {
      const t = i / 32, m = sine > .0001 ? Math.sin((1-t)*angle)/sine : 1-t, n = sine > .0001 ? Math.sin(t*angle)/sine : t;
      const p = u.map((x,j) => x*m + v[j]*n);
      return { lng: Math.atan2(p[1], p[0])/rad, lat: Math.atan2(p[2], Math.hypot(p[0],p[1]))/rad,
        altitude: 1 + .16*Math.sin(Math.PI*t) };
    });
  }
  function update(objects, relations) {
    const geo = new Map(objects.filter(o => o.geo !== false && Number.isFinite(o.lng) && Number.isFinite(o.lat)).map(o => [o.id,o]));
    const degree = new Map();
    relations.forEach(r => { degree.set(r.from,(degree.get(r.from)||0)+1); degree.set(r.to,(degree.get(r.to)||0)+1); });
    nodes = [...geo.values()].sort((a,b) => (degree.get(b.id)||0)-(degree.get(a.id)||0)).slice(0,140);
    routes = relations.map(r => ({ r, a: geo.get(r.from), b: geo.get(r.to) })).filter(x => x.a && x.b &&
      Math.hypot(x.a.lng-x.b.lng, x.a.lat-x.b.lat)>10).sort((a,b) =>
        (Math.min(120,Math.hypot(b.a.lng-b.b.lng,b.a.lat-b.b.lat))+(b.r.confidence||0)*24) -
        (Math.min(120,Math.hypot(a.a.lng-a.b.lng,a.a.lat-a.b.lat))+(a.r.confidence||0)*24))
      .slice(0,28).map((x,i) => ({ points:arc(x.a,x.b), hue:i%3, id:x.r.id }));
    resize();
  }
  function draw(now) {
    const w=canvas.clientWidth,h=canvas.clientHeight,cx=w*.5,cy=h*.5,R=Math.min(w,h)*radiusScale,scheme=colors();
    ctx.clearRect(0,0,w,h);ctx.fillStyle=scheme.ocean;ctx.fillRect(0,0,w,h);
    const sphere=ctx.createRadialGradient(cx-R*.32,cy-R*.4,R*.12,cx,cy,R*1.08);
    sphere.addColorStop(0,'#5693a5');sphere.addColorStop(.68,'#276076');sphere.addColorStop(1,'#153c55');
    ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fillStyle=sphere;ctx.fill();ctx.save();ctx.clip();
    ctx.fillStyle=scheme.land;ctx.strokeStyle=scheme.line;ctx.lineWidth=.65;
    for(const feature of polygons){
      let run=[];
      const flush=()=>{if(run.length<3){run=[];return;}ctx.beginPath();run.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.stroke();run=[];};
      for(const [lng,lat] of feature.ring){const p=project(lng,lat,cx,cy,R);if(p.z>0)run.push(p);else flush();}flush();
    }
    hits=[];
    routes.forEach((route,i)=>{
      const color=[scheme.accent,'#f8d082','#8fe1df'][route.hue];
      const points=route.points.map(p=>project(p.lng,p.lat,cx,cy,R,p.altitude));
      ctx.beginPath();points.forEach((p,j)=>{if(p.z<=0)return;if(!j||points[j-1].z<=0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});
      ctx.strokeStyle=color;ctx.globalAlpha=.56;ctx.lineWidth=1.45;ctx.stroke();ctx.globalAlpha=1;
      const head=Math.floor(((now*.00018*(1+i%3*.2)+i*.17)%1)*32), bead=points[head];
      if(bead?.z>0){
        ctx.beginPath();for(let j=Math.max(0,head-5);j<=head;j++){const p=points[j];if(p.z<=0)continue;if(j===Math.max(0,head-5)||points[j-1].z<=0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}
        ctx.strokeStyle=color;ctx.lineWidth=3.2;ctx.shadowColor=color;ctx.shadowBlur=11;ctx.stroke();ctx.shadowBlur=0;
        ctx.beginPath();ctx.arc(bead.x,bead.y,2.1,0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();
      }
    });
    nodes.forEach(o=>{
      const p=project(o.lng,o.lat,cx,cy,R);if(p.z<=0)return;
      ctx.beginPath();ctx.arc(p.x,p.y,2.7,0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();
      ctx.strokeStyle=scheme.accent;ctx.lineWidth=1.4;ctx.stroke();hits.push({x:p.x,y:p.y,id:o.id});
    });
    ctx.restore();ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=1;ctx.stroke();
  }
  function loop(now) {
    if(!visible){raf=0;return;}
    raf=requestAnimationFrame(loop);
    if(now-last<35)return;
    last=now;
    if(!pointer&&now>pauseUntil)rotation=(rotation+.11)%360;
    resize();draw(now);
  }
  function setVisible(next) {
    visible=next;
    if(!next){if(raf)cancelAnimationFrame(raf);raf=0;return;}
    resize();if(!raf)raf=requestAnimationFrame(loop);
  }
  function zoomBy(dir){radiusScale=Math.max(.27,Math.min(.47,radiusScale*(dir>0?1.12:.89)));pauseUntil=performance.now()+1800;}
  function zoomState(){return {canIn:radiusScale<.469,canOut:radiusScale>.271,zoom:radiusScale/.38};}
  function debug(){return {visible,raf,rotation,radiusScale,nodes:nodes.length,routes:routes.length,hits:hits.length};}
  return {mount,update,setVisible,zoomBy,zoomState,debug};
})();
