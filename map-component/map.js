/* MapLibre GL JS 5.6.1. Компонент без аудио, геолокации и зависимости от Тильды. */
(() => {
'use strict';
const scriptBase = new URL('.', document.currentScript.src);
const asset = name => new URL(name, scriptBase).href;
const number = n => String(n).padStart(2,'0');
window.BespokoistvoMap = Object.freeze({
 create(container, options = {}) {
  if (!(container instanceof HTMLElement)) throw new TypeError('Нужен DOM-контейнер карты.');
  if (!window.maplibregl) throw new Error('Сначала подключите vendor/maplibre-gl.js версии 5.6.1.');
  const stops = (options.stops || window.BespokoistvoStops || []).map(s=>({...s,coordinates:[...s.coordinates]}));
  if (!stops.length || new Set(stops.map(s=>s.id)).size!==stops.length || stops.some(s=>!s.id||!s.title||s.coordinates.length!==2||!s.coordinates.every(Number.isFinite)||Math.abs(s.coordinates[0])>180||Math.abs(s.coordinates[1])>85)) throw new TypeError('Проверьте данные остановок: уникальные id и coordinates [lon,lat].');
  const host = document.createElement('div'); host.className='bspm-host';host.style.cssText='width:100%;height:100%;min-width:0;display:block';
  const shadow=host.attachShadow({mode:'open'});
  for(const href of [asset('vendor/maplibre-gl.css'),asset('map.css')]){const link=document.createElement('link');link.rel='stylesheet';link.href=href;shadow.append(link);}
  const root=document.createElement('section');root.className='bspm-root bspm-pending';root.setAttribute('aria-label','Карта остановок прогулки');
  root.innerHTML='<div class="bspm-canvas"></div><button class="bspm-fit" type="button" aria-label="Показать весь маршрут"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4V9M15 4H20V9M4 15V20H9M20 15V20H15"/></svg>Весь маршрут</button><div class="bspm-route-note">Пешая линия пока не добавлена</div><div class="bspm-state" role="status"><strong>Загружаем карту Москвы</strong><p>Улицы и здания — OpenFreeMap / OpenStreetMap.</p><button type="button" hidden>Повторить</button></div>';
  shadow.append(root);container.append(host);
  const canvas=root.querySelector('.bspm-canvas'),stateBox=root.querySelector('.bspm-state'),fitButton=root.querySelector('.bspm-fit'),retry=stateBox.querySelector('button');
  let destroyed=false,selected=null,popup=null,scheduled=0,retryTimer=0,loaded=false,status='loading',settled=false;
  let resolveReady,rejectReady;const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  // Готовность означает отрисованные векторные объекты, а не существование canvas.
  ready.catch(()=>{});
  const map=new maplibregl.Map({container:canvas,style:options.style || asset('style.json'),center:[37.604,55.754],zoom:15,attributionControl:false,renderWorldCopies:false,dragRotate:false,touchPitch:false,cooperativeGestures:options.cooperativeGestures??false,maxZoom:20,minZoom:2});
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  map.addControl(new maplibregl.AttributionControl({compact:false,customAttribution:'<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · <a href="https://github.com/maputnik/osm-liberty" target="_blank" rel="noopener">Liberty</a>'}),'bottom-right');
  const markers=stops.map(s=>{
   const button=document.createElement('button');button.type='button';button.className='bspm-marker';button.textContent=number(s.order);button.setAttribute('aria-label',`${number(s.order)}. ${s.title}`);button.setAttribute('aria-pressed','false');
   let down=null,moved=false;
   button.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];moved=false;});
   button.addEventListener('pointermove',e=>{if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)moved=true;});
   button.addEventListener('pointercancel',()=>{moved=true;down=null;});
   button.addEventListener('click',e=>{if(moved&&e.detail!==0){moved=false;return;}e.stopPropagation();selectStop(s.id);});
   const marker=new maplibregl.Marker({element:button,anchor:'center'}).setLngLat(s.coordinates).addTo(map);
   return {s,button,marker,offset:[0,0]};
  });
  const illustrations=[];
  for(const s of stops){if(!s.illustration)continue;const image=document.createElement('img');image.src=s.illustration;image.className='bspm-illustration';image.alt='';image.setAttribute('aria-hidden','true');if(s.illustrationCredit)image.title=s.illustrationCredit;const marker=new maplibregl.Marker({element:image,anchor:'bottom',offset:[45,-32]}).setLngLat(s.coordinates).addTo(map);illustrations.push(marker);}
  const bounds=stops.reduce((b,s)=>b.extend(s.coordinates),new maplibregl.LngLatBounds());
  function fitRoute({animate=true}={}){
   if(destroyed)return;
   const r=canvas.getBoundingClientRect();
   const side=Math.max(40,Math.min(72,r.width*.16));
   map.fitBounds(bounds,{padding:{top:76,right:side,bottom:90,left:side},maxZoom:17,duration:animate&&!matchMedia('(prefers-reduced-motion:reduce)').matches?400:0,essential:false});
  }
  function setState(next,title,text){status=next;stateBox.hidden=next==='ready';root.classList.toggle('bspm-pending',next==='loading');root.classList.toggle('bspm-failed',next==='error');stateBox.querySelector('strong').textContent=title||'';stateBox.querySelector('p').textContent=text||'';retry.hidden=next!=='error';}
  function fail(message){if(destroyed||loaded)return;setState('error','Карта не загрузилась',message);if(!settled){settled=true;rejectReady(new Error(message));}}
  const timer=setTimeout(()=>fail('Не получены улицы и здания. Проверьте доступ к tiles.openfreemap.org и попробуйте ещё раз.'),25000);
  function confirmMap(){
   if(destroyed||!map.isStyleLoaded())return;
   const realFeatures=map.getSource('openmaptiles')?.type==='vector' && map.queryRenderedFeatures().some(f=>f.source==='openmaptiles' && ['building','transportation','transportation_name'].includes(f.sourceLayer));
   if(realFeatures&&!loaded){loaded=true;clearTimeout(timer);clearTimeout(retryTimer);setState('ready');layoutMarkers();if(!settled){settled=true;resolveReady();}container.dispatchEvent(new CustomEvent('bespokoistvo:mapready',{detail:{provider:'OpenFreeMap',route:'not-added'}}));}
  }
  function layoutMarkers(){
   if(destroyed||!map.isStyleLoaded())return;
   const w=canvas.clientWidth,h=canvas.clientHeight;
   if(w<80||h<80)return;
   const anchors=markers.map(m=>map.project(m.s.coordinates));
   const positions=anchors.map(p=>({x:p.x,y:p.y}));
   // Только номера разводятся в пикселях; истинные WGS84 координаты остаются прежними.
   // Непрерывные тонкие выноски связывают вынесенные номера с объектами.
   for(let pass=0;pass<32;pass++){
    let changed=false;
    for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
     const a=positions[i],b=positions[j];let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);const bothVisible=anchors[i].x>=-50&&anchors[i].x<w+50&&anchors[j].x>=-50&&anchors[j].x<w+50&&anchors[i].y>=-50&&anchors[i].y<h+50&&anchors[j].y>=-50&&anchors[j].y<h+50;
     if(d<51&&bothVisible){if(d<.1){dx=(j%2?1:-1);dy=1;d=Math.SQRT2;}const push=(51-d)/2+.2;a.x-=dx/d*push;a.y-=dy/d*push;b.x+=dx/d*push;b.y+=dy/d*push;changed=true;}
    }
    if(!changed)break;
   }
   const features=[];
   markers.forEach((item,i)=>{
    const a=anchors[i],p=positions[i];item.offset=[p.x-a.x,p.y-a.y];item.marker.setOffset(item.offset);
    if(Math.hypot(...item.offset)>2){features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[item.s.coordinates,map.unproject([p.x,p.y]).toArray()]}});features.push({type:'Feature',properties:{},geometry:{type:'Point',coordinates:item.s.coordinates}});}
   });
   const source=map.getSource('bspm-anchors');if(source)source.setData({type:'FeatureCollection',features});
  }
  function scheduleLayout(){if(destroyed)return;cancelAnimationFrame(scheduled);scheduled=requestAnimationFrame(layoutMarkers);}
  function selectStop(id,{notify=true}={}){
   if(destroyed)return false;
   const s=stops.find(s=>s.id===id);if(!s)return false;
   const changed=selected!==id;selected=id;
   markers.forEach(item=>item.button.setAttribute('aria-pressed',String(item.s.id===id)));
   if(popup){popup.remove();popup=null;}
   const body=document.createElement('div'),index=document.createElement('span'),title=document.createElement('strong');index.className='bspm-popup-number';index.textContent=`ОСТАНОВКА ${number(s.order)}`;title.className='bspm-popup-title';title.textContent=s.title;body.append(index,title);
   if(s.id==='psychology'){const note=document.createElement('p');note.className='bspm-popup-note';note.textContent=s.note;body.append(note);}
   const item=markers.find(m=>m.s.id===id);if(Math.hypot(...item.offset)>2){const note=document.createElement('p');note.className='bspm-popup-note';note.textContent='Точное положение объекта — у конца тонкой выноски.';body.append(note);}
   body.className='bspm-tooltip';body.setAttribute('role','status');
   const close=document.createElement('button');close.type='button';close.className='bspm-popup-close';close.textContent='×';close.setAttribute('aria-label','Закрыть подсказку');close.onclick=()=>{body.remove();if(popup===body)popup=null;};body.append(close);root.append(body);popup=body;
   const p=map.project(s.coordinates);if(p.x<36||p.x>canvas.clientWidth-36||p.y<60||p.y>canvas.clientHeight-75)map.easeTo({center:s.coordinates,duration:300});
   if(notify&&changed){options.onStopSelect?.(id);container.dispatchEvent(new CustomEvent('bespokoistvo:stopselect',{bubbles:true,detail:{id,order:s.order,coordinates:[...s.coordinates]}}));}
   return true;
  }
  map.on('style.load',()=>{
   if(destroyed)return;
   map.addSource('bspm-anchors',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
   map.addLayer({id:'bspm-leaders',type:'line',source:'bspm-anchors',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':'#626653','line-width':1,'line-opacity':.75}});
   map.addLayer({id:'bspm-anchor-dots',type:'circle',source:'bspm-anchors',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':2.5,'circle-color':'#39412C','circle-stroke-width':1,'circle-stroke-color':'#FFF8EE'}});
   fitRoute({animate:false});scheduleLayout();
  });
  map.on('idle',confirmMap);map.on('move',scheduleLayout);map.on('resize',scheduleLayout);
  map.on('error',e=>{if(loaded)return;const text=String(e.error?.message||'');if(e.sourceId==='openmaptiles'||/style\.json|planet\/latest|Failed to fetch|AJAXError/.test(text))fail('Не удалось получить настоящую подложку OpenFreeMap. Проверьте подключение и доступ к tiles.openfreemap.org.');});
  fitButton.addEventListener('click',()=>fitRoute());
  retry.addEventListener('click',()=>{if(destroyed)return;loaded=false;setState('loading','Загружаем карту Москвы','Повторно запрашиваем улицы и здания.');map.setStyle(options.style || asset('style.json'));clearTimeout(retryTimer);retryTimer=setTimeout(()=>{if(!destroyed&&!loaded)fail('Карта по-прежнему недоступна. Проверьте доступ к tiles.openfreemap.org.');},25000);});
  let resizeFrame=0;const observer=new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(destroyed)return;map.resize();fitRoute({animate:false});scheduleLayout();});});observer.observe(container);observer.observe(canvas);
  return Object.freeze({ready,selectStop,fitRoute,getStatus:()=>({basemap:status,selectedStop:selected,route:'not-added',zoom:map.getZoom(),center:map.getCenter().toArray(),destroyed}),destroy(){if(destroyed)return;destroyed=true;clearTimeout(timer);clearTimeout(retryTimer);cancelAnimationFrame(scheduled);cancelAnimationFrame(resizeFrame);observer.disconnect();popup?.remove();markers.forEach(m=>m.marker.remove());illustrations.forEach(m=>m.remove());map.remove();host.remove();if(!settled){settled=true;rejectReady(new Error('Компонент удалён до загрузки карты.'));}}});
 }
});
})();
