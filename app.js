(() => {
'use strict';
const $ = id => document.getElementById('bsp-'+id);
const {stops,sourceNote} = window.BespData;
const route = window.BespRoute;
const app=$('app'), svg=$('map'), audio=$('audio');
const num=n=>String(n).padStart(2,'0');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selected=stops[0], audioStop=stops[0], visited=new Set(), storageOK=true;
try { const saved=JSON.parse(localStorage.getItem('bespokoistvo.moscow.visited.v1')||'[]'); if(Array.isArray(saved)) visited=new Set(saved.filter(id=>stops.some(s=>s.id===id))); localStorage.setItem('bespokoistvo.storage-test','1');localStorage.removeItem('bespokoistvo.storage-test'); } catch {storageOK=false;}
const mobile=()=>matchMedia('(max-width:700px)').matches;
let collapsed=mobile(), cardOpen=true, zoom=1, pan={x:0,y:0}, toastTimer;
const mercator=(lon,lat)=>[lon*Math.PI/180,Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];
const min=mercator(Math.min(...stops.map(s=>s.lon))-.0024,Math.min(...stops.map(s=>s.lat))-.001),max=mercator(Math.max(...stops.map(s=>s.lon))+.0022,Math.max(...stops.map(s=>s.lat))+.001);
const k=Math.min(930/(max[0]-min[0]),690/(max[1]-min[1]));
const project=(lon,lat)=>{const p=mercator(lon,lat);return [85+(p[0]-min[0])*k,45+(max[1]-p[1])*k];};
const points=Object.fromEntries(stops.map(s=>[s.id,project(s.lon,s.lat)]));
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
function navigation(s){ const [lon,lat]=s.approachCoordinates||[s.lon,s.lat];return `https://yandex.ru/maps/?mode=routes&rtext=~${lat}%2C${lon}&rtt=pd`; }
function updateProgress(){
 $('progress-count').textContent=`${visited.size} / 8`;$('progress-bar').style.width=visited.size/8*100+'%';
 $('storage-note').textContent=storageOK?'Ваш прогресс сохраняется на этом устройстве':'Хранилище недоступно — прогресс сохранится только до закрытия страницы';
}
function renderList(){
 $('stop-list').innerHTML=stops.map(s=>`<li><button class="bsp-stop-row ${visited.has(s.id)?'bsp-done':''}" data-id="${s.id}" aria-current="${selected.id===s.id}" aria-label="${num(s.order)}. ${escape(s.title)}${visited.has(s.id)?'. Пройдено':''}"><span class="bsp-stop-number">${visited.has(s.id)?'✓':num(s.order)}</span><span class="bsp-stop-name">${escape(s.shortTitle)}</span><span class="bsp-stop-chevron" aria-hidden="true">${selected.id===s.id?'→':''}</span></button></li>`).join('');updateProgress();
}
function renderCard(){
 $('card').hidden=!cardOpen;$('show-card').hidden=cardOpen;
 $('card').classList.toggle('bsp-collapsed',collapsed);
 $('card-collapse').setAttribute('aria-expanded',String(!collapsed));$('card-collapse').setAttribute('aria-label',collapsed?'Развернуть карточку':'Свернуть карточку');$('card-collapse').textContent=collapsed?'⌃':'⌄';
 $('card-index').textContent=`ОСТАНОВКА ${num(selected.order)} / 08`;
 $('card-title').textContent=selected.title;$('card-address').textContent=selected.address;
 $('card-caution').hidden=selected.id!=='psychology';$('card-caution').textContent='Объект во дворе. Проход не подтверждён; ориентир — Моховая улица.';
 $('navigate').href=navigation(selected);$('navigate').title=selected.approachCoordinates?'Пешеходный маршрут до проверенного подхода':'Яндекс Карты: маршрут к координате объекта. Вход не проверен.';
 $('visited').setAttribute('aria-pressed',String(visited.has(selected.id)));$('visited').textContent=visited.has(selected.id)?'✓ Пройдено':'Пройдено';
 $('next-stop').textContent=selected.order===8?'К началу →':'Следующая →';
}
function renderMap(){
 const unit=1/(svg.getScreenCTM()?.a || Math.max(1,svg.getBoundingClientRect().width)/1100)/zoom;
 let content=`<defs><pattern id="bsp-paper-grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" class="bsp-grid"/></pattern></defs><rect width="1100" height="850" fill="url(#bsp-paper-grid)"/><text x="30" y="29" class="bsp-grid-label">55°45′ С. Ш.</text><text x="30" y="823" class="bsp-grid-label">WGS84 / WEB MERCATOR</text><g id="bsp-world" transform="translate(${pan.x} ${pan.y}) scale(${zoom})">`;
 for(const [i,seg] of route.segments.entries()){
  let path;
  if(seg.status==='verified' && Array.isArray(seg.coordinates) && seg.coordinates.length>1){ path=seg.coordinates.map((p,j)=>`${j?'L':'M'}${project(...p).join(' ')}`).join(' '); }
  else {
   const a=points[seg.from],b=points[seg.to];const dx=b[0]-a[0],dy=b[1]-a[1];const bend=i===2?-65:i===0?18:12;
   path=`M${a} C${a[0]+dx*.25+bend} ${a[1]+dy*.25},${a[0]+dx*.75+bend} ${a[1]+dy*.75},${b}`;
  }
  content+=`<path d="${path}" class="bsp-route-underlay"/><path d="${path}" class="bsp-route-line"><title>${num(i+1)}–${num(i+2)}: ${seg.status==='verified'?'проверенный путь':'условная связь, пешеходный путь не проверен'}</title></path>`;
 }
 // Подписи — ориентиры из адресов автора, не геометрия улиц.
 const labels=[['МАЛАЯ НИКИТСКАЯ',37.5958,55.75895,-7],['НИКИТСКИЙ БУЛЬВАР',37.5971,55.7554,-76],['ГОГОЛЕВСКИЙ БУЛЬВАР',37.5982,55.7513,-83],['ВОЗДВИЖЕНКА',37.6061,55.7524,0],['МОХОВАЯ',37.6123,55.7544,-67]];
 for(const [text,lon,lat,rotation] of labels){const [x,y]=project(lon,lat);content+=`<text x="${x}" y="${y}" transform="rotate(${rotation} ${x} ${y})" class="bsp-map-label">${text}</text>`;}
 for(const s of stops){
  const [x,y]=points[s.id];let ox=0,oy=0;
  if(mobile()){const offsets={2:[-15,-5],4:[45,-30],5:[-60,20],6:[45,38]};if(offsets[s.order]){ox=offsets[s.order][0]*unit;oy=offsets[s.order][1]*unit;}}else{if(s.order===5){ox=5*unit;oy=5*unit;}if(s.order===6){ox=40*unit;oy=40*unit;}}
  if(ox)content+=`<circle cx="${x}" cy="${y}" r="${2*unit}" class="bsp-object-dot"/><path d="M${x} ${y}L${x+ox} ${y+oy}" class="bsp-leader"/>`;
  const words=s.shortTitle.split(' '), label=[''];
  for(const word of words){const last=label.length-1;if(label[last] && (label[last]+' '+word).length>21)label.push(word);else label[last]+=(label[last]?' ':'')+word;}
  if(label&&!mobile()){
   const left=s.order===8||s.order===7;const lx=x+(left?-31:31)*unit;
   content+=`<text x="${lx}" y="${y-4*unit}" text-anchor="${left?'end':'start'}" class="bsp-point-label" font-size="${14*unit}">${label.map((v,i)=>`<tspan x="${lx}" dy="${i?17*unit:0}">${v}</tspan>`).join('')}</text>`;
  }
  content+=`<g class="bsp-marker ${visited.has(s.id)?'bsp-done':''}" data-id="${s.id}" role="button" tabindex="0" aria-label="${num(s.order)}. ${escape(s.title)}${visited.has(s.id)?'. Пройдено':''}" aria-pressed="${s.id===selected.id}" transform="translate(${x+ox} ${y+oy}) scale(${unit})"><title>${escape(s.title)}</title><circle r="29" class="bsp-marker-halo"/><circle r="22" class="bsp-marker-disc"/><text>${visited.has(s.id)?'✓':num(s.order)}</text></g>`;
 }
 content+='</g>';svg.innerHTML=content;
 $('zoom-in').disabled=zoom>=3.5;$('zoom-out').disabled=zoom<=1;
}
function keepVisible(s){
 const [x,y]=points[s.id];const px=x*zoom+pan.x,py=y*zoom+pan.y;
 const mobileBottom=mobile()?620:680;
 if(px<100||px>950||py<80||py>mobileBottom){pan={x:550-x*zoom,y:350-y*zoom};}
}
function select(id,{showMap=true}={}){
 selected=stops.find(s=>s.id===id)||selected;cardOpen=true;
 if(showMap){app.classList.remove('bsp-list-view');$('tab-map').setAttribute('aria-pressed','true');$('tab-list').setAttribute('aria-pressed','false');}
 keepVisible(selected);renderList();renderCard();renderMap();
}
$('stop-list').addEventListener('click',e=>{const row=e.target.closest('[data-id]');if(row)select(row.dataset.id);});
svg.addEventListener('click',e=>{if(e.detail===0){const m=e.target.closest('[data-id]');if(m)select(m.dataset.id);}});
svg.addEventListener('keydown',e=>{const m=e.target.closest('[data-id]');if(m&&(e.key==='Enter'||e.key===' ')){e.preventDefault();select(m.dataset.id);svg.querySelector(`[data-id="${m.dataset.id}"]`).focus();}});
let pointer=null,dragged=false;
svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,pan:{...pan},target:e.target.closest('[data-id]')?.dataset.id};dragged=false;svg.setPointerCapture(e.pointerId);});
svg.addEventListener('pointermove',e=>{if(!pointer)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.hypot(dx,dy)>6)dragged=true;if(dragged){const factor=1/(svg.getScreenCTM()?.a || svg.getBoundingClientRect().width/1100);pan={x:Math.max(-3000,Math.min(2000,pointer.pan.x+dx*factor)),y:Math.max(-2600,Math.min(1800,pointer.pan.y+dy*factor))};svg.classList.add('bsp-dragging');renderMap();}});
svg.addEventListener('pointerup',()=>{if(pointer&&!dragged&&pointer.target)select(pointer.target);pointer=null;svg.classList.remove('bsp-dragging');});
svg.addEventListener('pointercancel',()=>{pointer=null;svg.classList.remove('bsp-dragging');});
function setZoom(value){const next=Math.max(1,Math.min(3.5,value));const r=next/zoom;pan={x:550-(550-pan.x)*r,y:370-(370-pan.y)*r};zoom=next;if(zoom===1)pan={x:0,y:0};renderMap();}
$('zoom-in').onclick=()=>setZoom(zoom+.5);$('zoom-out').onclick=()=>setZoom(zoom-.5);
$('fit').onclick=()=>{zoom=1;pan={x:0,y:0};collapsed=true;renderCard();renderMap();toast('Весь маршрут · север сверху');};
$('card-collapse').onclick=()=>{collapsed=!collapsed;renderCard();};$('card-close').onclick=()=>{cardOpen=false;renderCard();};$('show-card').onclick=()=>{cardOpen=true;renderCard();};
$('next-stop').onclick=()=>select(stops[selected.order%8].id);
$('visited').onclick=()=>{if(visited.has(selected.id))visited.delete(selected.id);else visited.add(selected.id);try{localStorage.setItem('bespokoistvo.moscow.visited.v1',JSON.stringify([...visited]));}catch{storageOK=false;}renderList();renderCard();renderMap();toast(visited.has(selected.id)?'Остановка отмечена как пройденная':'Отметка снята');};
$('tab-map').onclick=()=>{app.classList.remove('bsp-list-view');$('tab-map').setAttribute('aria-pressed','true');$('tab-list').setAttribute('aria-pressed','false');renderMap();};
$('tab-list').onclick=()=>{app.classList.add('bsp-list-view');$('tab-map').setAttribute('aria-pressed','false');$('tab-list').setAttribute('aria-pressed','true');};
const dialog=$('dialog');let returnFocus;
function openDialog(html){returnFocus=document.activeElement;$('dialog-content').innerHTML=html;if(!dialog.open)dialog.showModal();document.body.classList.add('bsp-modal-open');}
function closeDialog(){dialog.close();}
$('dialog-close').onclick=closeDialog;dialog.addEventListener('close',()=>{document.body.classList.remove('bsp-modal-open');returnFocus?.focus();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
function detail(s){
 openDialog(`<span class="bsp-eyebrow">МОСКВА ПСИХОЛОГИЧЕСКАЯ / ${num(s.order)}</span>${s.image?`<img class="bsp-detail-photo" src="${escape(s.image)}" alt="${escape(s.title)}">${s.imageCredit?`<small>${escape(s.imageCredit)}</small>`:''}`:`<div class="bsp-detail-number" aria-hidden="true">${num(s.order)}</div>`}<h2>${escape(s.title)}</h2><p>${escape(s.address)}</p>${s.note?`<p>${escape(s.note)}</p>`:''}<p>Остановитесь там, где удобно и безопасно. История этого места — в аудиодорожке.</p><button class="bsp-primary" id="bsp-detail-listen">Слушать историю ${num(s.order)} <span>▷</span></button><p><a href="${navigation(s)}" target="_blank" rel="noopener noreferrer">Идти сюда в Яндекс Картах <span class="bsp-external-icon" aria-hidden="true"></span></a></p><small>Координата объекта: ${s.lat}, ${s.lon}. ${s.approachCoordinates?'Подход указан отдельно.':'Вход и место остановки не проверены.'}</small>`);
 $('detail-listen').onclick=()=>{setAudio(s);closeDialog();playAudio();};
 window.dispatchEvent(new CustomEvent('bespokoistvo:open-stop',{detail:{id:s.id,order:s.order}}));
}
$('open-stop').onclick=()=>detail(selected);$('player-open').onclick=()=>detail(audioStop);
$('about').onclick=()=>openDialog(`<span class="bsp-eyebrow">БЕСПОКОЙСТВО / АВТОРСКИЙ АУДИОГИД</span><h2>Город снаружи.<br><em>Истории внутри.</em></h2><p>«Москва психологическая» — восемь остановок на пересечении истории города и психологии. Идите в своём темпе, выбирайте места на карте и слушайте истории.</p><p>Клик по точке открывает карточку. Аудио начнётся только после нажатия на воспроизведение или «Слушать историю». Просмотр карты не меняет текущую дорожку.</p><p>Кнопкой «Пройдено» можно отметить посещённое место. Если хранилище браузера доступно, отметки останутся на этом устройстве.</p><p>Это первая версия: география объектов сохранена, все переходы пока условные. Свободный проход во дворы не подтверждён.</p><small>${escape(sourceNote)}</small>`);
$('route-info').onclick=()=>openDialog(`<span class="bsp-eyebrow">О ГЕОГРАФИИ И ИСТОЧНИКАХ</span><h2>Схема, с которой<br>можно начать.</h2><p>Все восемь объектов расположены по исходным координатам. Север сверху, проекция Web Mercator. Линии и подписи улиц схематические: картографической подложки здесь нет.</p><p>Пунктирные дуги показывают <strong>только порядок посещения</strong>. Они не обозначают траекторию по улицам, проходы через здания или дворы. Геометрия пешеходного маршрута не подтверждена; расстояние и время не рассчитаны.</p><ul>${route.segments.map((s,i)=>`<li>${num(i+1)} → ${num(i+2)}: проверить тротуары, переходы и доступный подход.</li>`).join('')}</ul><p>Особое внимание: доступ во двор Психологического института (07), два отдельных особняка (05–06), подходы к двум разным памятникам Гоголю (02–03). Проверенных координат входов нет.</p><p>«Идти сюда» передаёт координату объекта в пешеходный режим Яндекс Карт; актуальный путь строит внешний сервис.</p><small>${escape(sourceNote)} Аудио: annrezus-star/bespokoistvo-audio. Яндекс, Тильда и Overpass при проверке из среды разработки вернули 403; исходная короткая ссылка на восемь точек не проверена.</small>`);
app.querySelector('.bsp-brand').onclick=e=>{e.preventDefault();$('fit').click();};
const formatTime=t=>Number.isFinite(t)?`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`:'—:—';
function audioUI(){
 $('play').setAttribute('aria-label',audio.paused?'Воспроизвести':'Пауза');
 $('play').innerHTML=audio.paused?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5L20 12 9 19Z" fill="currentColor"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5H10V19H7ZM14 5H17V19H14Z" fill="currentColor"/></svg>';
 $('audio-prev').disabled=audioStop.order===1;$('audio-next').disabled=audioStop.order===8;
}
function setAudio(s){
 if(s.id===audioStop.id)return;
 audio.pause();audioStop=s;audio.src=s.audioUrl;audio.load();
 $('player-open').textContent=num(s.order);$('audio-eyebrow').textContent=`АУДИОИСТОРИЯ / ${num(s.order)}`;$('audio-title').textContent=s.shortTitle;
 $('audio-status').textContent='Нажмите воспроизведение, когда будете готовы';$('seek').value=0;$('seek').disabled=true;$('current-time').textContent='0:00';$('duration').textContent='—:—';audioUI();
}
async function playAudio(){
 try{if(audio.error)audio.load();await audio.play();}catch(e){if(e.name==='AbortError')return;$('audio-status').textContent='Не удалось включить аудио. Нажмите ▶, чтобы повторить.';audioUI();}
}
$('play').onclick=()=>audio.paused?playAudio():audio.pause();
$('audio-prev').onclick=()=>{if(audioStop.order>1)setAudio(stops[audioStop.order-2]);};
$('audio-next').onclick=()=>{if(audioStop.order<8)setAudio(stops[audioStop.order]);};
$('seek').disabled=true;
audio.addEventListener('loadedmetadata',()=>{$('duration').textContent=formatTime(audio.duration);$('seek').disabled=!Number.isFinite(audio.duration);});
audio.addEventListener('durationchange',()=>{$('duration').textContent=formatTime(audio.duration);});
audio.addEventListener('timeupdate',()=>{$('current-time').textContent=formatTime(audio.currentTime);if(Number.isFinite(audio.duration))$('seek').value=audio.currentTime/audio.duration*100;});
$('seek').oninput=()=>{if(Number.isFinite(audio.duration))audio.currentTime=audio.duration*Number($('seek').value)/100;};
audio.addEventListener('play',()=>{audioUI();$('audio-status').textContent='Сейчас играет';});
audio.addEventListener('pause',()=>{audioUI();if(!audio.error)$('audio-status').textContent='На паузе';});
audio.addEventListener('waiting',()=>{$('audio-status').textContent='Загружаем аудио…';});
audio.addEventListener('playing',()=>{$('audio-status').textContent='Сейчас играет';});
audio.addEventListener('error',()=>{$('audio-status').textContent='Аудио недоступно. Проверьте подключение и нажмите ▶.';audioUI();});
audio.addEventListener('ended',()=>{audioUI();$('audio-status').textContent=audioStop.order<8?'История закончилась. Следующая дорожка — кнопкой ↦.':'Последняя история закончилась. Спасибо за прогулку.';});
$('mute').onclick=()=>{audio.muted=!audio.muted;$('mute').setAttribute('aria-pressed',String(audio.muted));$('mute').setAttribute('aria-label',audio.muted?'Включить звук':'Выключить звук');$('mute').style.opacity=audio.muted?'.4':'1';};
let resizeFrame;new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(renderMap);}).observe($('map-canvas'));
renderList();renderCard();renderMap();audioUI();
})();
