/* MapLibre GL JS 5.6.1 + OpenFreeMap. Самостоятельный компонент, версия 2. */
(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  const asset = name => new URL(name, base).href;
  const number = n => String(n).padStart(2, '0');
  const instances = new WeakMap();
  const reducedMotion = () => matchMedia('(prefers-reduced-motion:reduce)').matches;

  window.BespokoistvoMap = Object.freeze({
    create(container, options = {}) {
      if (!(container instanceof HTMLElement)) throw new TypeError('Нужен DOM-контейнер карты.');
      if (!window.maplibregl) throw new Error('Сначала подключите vendor/maplibre-gl.js версии 5.6.1.');
      const stops = (options.stops || window.BespokoistvoStops || []).map(s => ({...s, coordinates: [...s.coordinates]}));
      if (!stops.length || new Set(stops.map(s => s.id)).size !== stops.length || stops.some(s => !s.id || !s.title || s.coordinates.length !== 2 || !s.coordinates.every(Number.isFinite) || Math.abs(s.coordinates[0]) > 180 || Math.abs(s.coordinates[1]) > 85)) {
        throw new TypeError('Проверьте уникальные id и coordinates [долгота, широта].');
      }
      instances.get(container)?.destroy();
      const bounds = stops.reduce((b, s) => b.extend(s.coordinates), new maplibregl.LngLatBounds());
      const host = document.createElement('div');
      host.className = 'bspm-host';
      host.style.cssText = 'width:100%;height:100%;min-width:0;display:block';
      const shadow = host.attachShadow({mode: 'open'});
      for (const href of [asset('vendor/maplibre-gl.css'), asset('map.css')]) {
        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = href; shadow.append(link);
      }
      const root = document.createElement('section');
      root.className = 'bspm-root bspm-pending';
      root.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden';
      root.setAttribute('aria-label', 'Карта остановок прогулки');
      root.innerHTML = '<div class="bspm-canvas" style="position:absolute;inset:0"></div><div class="bspm-tools"><button class="bspm-fit" type="button" aria-label="Показать весь маршрут"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4V9M15 4H20V9M4 15V20H9M20 15V20H15"/></svg>Весь маршрут</button><button class="bspm-locate" type="button" aria-label="Показать моё местоположение" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2V6M12 18V22M2 12H6M18 12H22"/></svg>Где я</button></div><div class="bspm-location-status" hidden><span role="status" aria-live="polite" aria-atomic="true"></span><button type="button" aria-label="Выключить геолокацию">×</button></div><div class="bspm-route-note">Пешая линия пока не добавлена</div><div class="bspm-state" role="status"><strong>Загружаем карту Москвы</strong><p>Улицы и здания — OpenFreeMap / OpenStreetMap.</p><button type="button" hidden>Повторить</button></div>';
      const journey = document.createElement('section');
      journey.className = 'bspm-journey'; journey.hidden = true;
      journey.setAttribute('aria-label', 'Следующая остановка прогулки');
      journey.innerHTML = '<button class="bspm-journey-prev" type="button" aria-label="Предыдущая остановка">←</button><div class="bspm-journey-copy"><span class="bspm-journey-label" role="status"></span><button class="bspm-journey-target" type="button"></button><span class="bspm-journey-metrics"></span><span class="bspm-journey-note"></span></div><button class="bspm-journey-next" type="button" aria-label="Следующая остановка">→</button>';
      root.append(journey);
      shadow.append(root); container.append(host);
      const canvas = root.querySelector('.bspm-canvas');
      const stateBox = root.querySelector('.bspm-state');
      const fitButton = root.querySelector('.bspm-fit');
      const retryButton = stateBox.querySelector('button');
      const routeNote = root.querySelector('.bspm-route-note');
      const locateButton = root.querySelector('.bspm-locate');
      const locationStatus = root.querySelector('.bspm-location-status');
      const locationMessage = locationStatus.querySelector('span');
      const locationStop = locationStatus.querySelector('button');
      const journeyPrev = journey.querySelector('.bspm-journey-prev'), journeyNext = journey.querySelector('.bspm-journey-next');
      const journeyLabel = journey.querySelector('.bspm-journey-label'), journeyTarget = journey.querySelector('.bspm-journey-target');
      const journeyMetrics = journey.querySelector('.bspm-journey-metrics'), journeyNote = journey.querySelector('.bspm-journey-note');
      let navigation = null, nextStopIndex = 0;
      let destroyed = false, selected = null, popup = null, loaded = false, overview = true;
      let locationWatch = null, locationSession = 0, locationTimer = 0, locationPosition = null;
      let locationState = 'idle', locationFollow = false;
      const routeAbort = new AbortController();
      let routeState = 'loading', routeGeometry = null;
      let status = 'loading', settled = false, layoutFrame = 0, resizeFrame = 0, visibilityFrame = 0, loadTimer = 0;
      let resolveReady, rejectReady;
      const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
      ready.catch(() => {});

      const initialSize = container.getBoundingClientRect();
      const defaultStyle = asset(options.liveBasemap ? 'style-live.json' : 'style.json');
      let styleController = new AbortController();
      const sidePadding = width => width < 600 ? 34 : 44;
      const map = new maplibregl.Map({
        container: canvas,
        transformRequest: url => ({url: new URL(url, base).href}),
        maxBounds: options.liveBasemap ? undefined : [[37.55, 55.72], [37.65, 55.80]],
        bounds: bounds.toArray(),
        fitBoundsOptions: {padding: {top: 82, right: sidePadding(initialSize.width), bottom: 82, left: sidePadding(initialSize.width)}, maxZoom: 20},
        attributionControl: false, renderWorldCopies: false, dragRotate: false, touchPitch: false,
        cooperativeGestures: options.cooperativeGestures ?? false, scrollZoom: options.scrollZoom ?? true, minZoom: options.liveBasemap ? 2 : 12, maxZoom: 20
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibregl.NavigationControl({showCompass: false}), 'top-right');
      map.addControl(new maplibregl.AttributionControl({
        compact: false,
        customAttribution: '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · <a href="https://github.com/maputnik/osm-liberty" target="_blank" rel="noopener">Liberty</a>'
      }), 'bottom-right');
      const markers = stops.map(s => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'bspm-marker';
        const disc = document.createElement('span'); disc.className = 'bspm-marker-disc'; disc.textContent = number(s.order); button.append(disc);
        button.setAttribute('aria-label', `${number(s.order)}. ${s.title}`);
        button.setAttribute('aria-pressed', 'false');
        let down = null, moved = false;
        button.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; moved = false; });
        button.addEventListener('pointermove', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) moved = true; });
        button.addEventListener('pointercancel', () => { moved = true; down = null; });
        button.addEventListener('click', e => {
          if (moved && e.detail !== 0) { moved = false; return; }
          e.stopPropagation(); selectStop(s.id);
        });
        const marker = new maplibregl.Marker({element: button, anchor: 'center'}).setLngLat(s.coordinates).addTo(map);
        return {s, button, marker, offset: [0, 0]};
      });
      const illustrations = stops.filter(s => s.illustration).map(s => {
        const image = document.createElement('img');
        image.src = s.illustration; image.className = 'bspm-illustration'; image.alt = ''; image.setAttribute('aria-hidden', 'true');
        if (s.illustrationCredit) image.title = s.illustrationCredit;
        const marker = new maplibregl.Marker({element: image, anchor: 'bottom', offset: [45, -32]}).setLngLat(s.coordinates).addTo(map);
        return {marker, image};
      });

      function measureFooter() {
        const attribution = root.querySelector('.maplibregl-ctrl-attrib');
        const height = Math.ceil(attribution?.getBoundingClientRect().height || 32);
        root.style.setProperty('--bspm-attribution-height', `${height}px`);
        const noteHeight = routeNote.hidden ? 0 : Math.ceil(routeNote.getBoundingClientRect().height || 22);
        const bottom = height + noteHeight + 24;
        root.style.setProperty('--bspm-card-bottom', `${bottom}px`);
        const top = locationStatus.hidden ? 70 : Math.max(70, Math.ceil(locationStatus.getBoundingClientRect().bottom - root.getBoundingClientRect().top) + 12);
        root.style.setProperty('--bspm-top-space', `${top}px`);
        const journeyHeight = journey.hidden ? 0 : Math.ceil(journey.getBoundingClientRect().height) + 20;
        return {height, bottom: Math.max(bottom, height + journeyHeight), top};
      }
      function hideCard() {
        if (!popup) return;
        overlayObserver.unobserve(popup); popup.remove(); popup = null;
        renderJourney();
      }
      function navigationStatus() { return navigation?.measure(nextStopIndex, locationPosition) || null; }
      function renderJourney() {
        if (destroyed) return;
        const progress = navigationStatus();
        journey.hidden = !progress || Boolean(popup);
        routeNote.hidden = Boolean(navigation);
        markers.forEach(({s, button}) => button.toggleAttribute('data-next', s.id === progress?.targetStopId));
        if (!progress) return;
        const s = stops[nextStopIndex];
        journeyLabel.textContent = progress.completed ? `${stops.length} из ${stops.length} остановок` : `${nextStopIndex === 0 ? 'Начало' : 'Следующая остановка'} · ${number(s.order)} из ${number(stops.length)}`;
        journeyTarget.textContent = s ? s.shortTitle || s.title : 'Прогулка завершена';
        journeyTarget.disabled = progress.completed;
        journeyTarget.setAttribute('aria-label', s ? `Открыть карточку: ${s.title}` : 'Прогулка завершена');
        journeyPrev.disabled = nextStopIndex === 0;
        journeyNext.textContent = progress.completed ? '↻' : nextStopIndex === stops.length - 1 ? '✓' : '→';
        journeyNext.setAttribute('aria-label', progress.completed ? 'Начать прогулку сначала' : nextStopIndex === stops.length - 1 ? 'Завершить прогулку' : `К остановке ${number(stops[nextStopIndex + 1].order)}: ${stops[nextStopIndex + 1].title}`);
        if (progress.completed) {
          journeyMetrics.textContent = 'Спасибо за прогулку'; journeyNote.textContent = '↻ — начать сначала';
        } else if (nextStopIndex === 0) {
          journeyMetrics.textContent = progress.mode === 'at-start' ? 'Вы у начала маршрута' : 'Начните у первой остановки';
          journeyNote.textContent = progress.mode === 'imprecise' ? 'GPS неточный · этапы можно листать вручную' : 'Нажмите →, когда будете готовы идти дальше';
        } else {
          const metres = progress.remainingMeters ?? progress.distanceMeters;
          const formatted = metres >= 1000 ? `${(metres / 1000).toLocaleString('ru-RU', {maximumFractionDigits: 1})} км` : `${Math.max(5, Math.round(metres / (metres < 100 ? 5 : 10)) * (metres < 100 ? 5 : 10))} м`;
          const minutes = progress.estimatedMinutes < 1 ? '< 1 мин' : `≈ ${Math.ceil(progress.estimatedMinutes)} мин`;
          journeyMetrics.textContent = progress.mode === 'at-approach' ? 'Подход к остановке рядом' : `≈ ${formatted} · ${minutes}`;
          journeyNote.textContent = ({remaining: 'Осталось по линии до подхода · пешком', 'at-approach': 'Переключите этап, когда будете готовы', imprecise: 'Весь участок · GPS неточный', 'off-route': 'Весь участок · вы вне выбранного участка', ambiguous: 'Весь участок · положение неоднозначно'})[progress.mode] || `От остановки ${number(stops[nextStopIndex - 1].order)} · пешком`;
        }
        measureFooter();
      }
      function fitNextStop() {
        const s = stops[nextStopIndex];
        if (!s) { fitRoute(); return; }
        const leg = navigation.geometryFor(nextStopIndex);
        const points = leg ? leg.geometry.coordinates : [s.approachCoordinates || s.coordinates];
        const activeBounds = points.reduce((b, point) => b.extend(point), new maplibregl.LngLatBounds());
        activeBounds.extend(s.coordinates);
        if (nextStopIndex) activeBounds.extend(stops[nextStopIndex - 1].coordinates);
        const r = canvas.getBoundingClientRect(), footer = measureFooter();
        if (r.width < 100 || r.height < 160) return;
        const top = Math.min(footer.top + 12, r.height - 100);
        map.fitBounds(activeBounds, {padding: {top, left: sidePadding(r.width), right: sidePadding(r.width), bottom: Math.max(0, Math.min(footer.bottom + 16, r.height - top - 80))}, maxZoom: 17.5, duration: reducedMotion() ? 0 : 350});
      }
      function setNextStop(id) {
        if (destroyed || !navigation) return false;
        const index = stops.findIndex(s => s.id === id);
        if (index < 0) return false;
        nextStopIndex = index; locationFollow = false; overview = false;
        hideCard(); renderJourney(); renderNextLeg(); fitNextStop();
        return true;
      }
      function stepJourney(direction) {
        if (destroyed || !navigation) return;
        nextStopIndex = nextStopIndex === stops.length && direction > 0 ? 0 : Math.max(0, Math.min(stops.length, nextStopIndex + direction));
        locationFollow = false; overview = false;
        hideCard(); renderJourney(); renderNextLeg(); fitNextStop();
      }
      function renderNextLeg() {
        if (!map.getStyle()?.layers || !map.getSource('bspm-route')) return;
        const feature = navigation?.geometryFor(nextStopIndex);
        const data = {type: 'FeatureCollection', features: feature ? [feature] : []};
        if (map.getSource('bspm-next-leg')) map.getSource('bspm-next-leg').setData(data);
        else {
          map.addSource('bspm-next-leg', {type: 'geojson', data});
          map.addLayer({id: 'bspm-next-leg-line', type: 'line', source: 'bspm-next-leg', layout: {'line-join': 'round', 'line-cap': 'round'}, paint: {'line-color': '#39412C', 'line-width': 3}}, 'bspm-leaders');
        }
      }
      function fitRoute({animate = true, keepCard = false} = {}) {
        if (destroyed) return;
        locationFollow = false;
        if (!keepCard) hideCard();
        overview = true;
        const footer = measureFooter(), r = canvas.getBoundingClientRect();
        if (r.width < 100 || r.height < 160) return;
        const bottom = popup ? r.bottom - popup.getBoundingClientRect().top + 30 : footer.bottom + 24;
        const top = Math.min(footer.top + 12, r.height - 100);
        map.fitBounds(bounds, {
          padding: {top, right: sidePadding(r.width), bottom: Math.max(0, Math.min(bottom, r.height - top - 80)), left: sidePadding(r.width)},
          maxZoom: 20, linear: true, duration: animate && !reducedMotion() ? 350 : 0
        });
        scheduleLayout();
      }
      // Координаты участника существуют только в памяти этой вкладки. Никаких fetch/postMessage с ними нет.
      function locationData() {
        if (!locationPosition || locationState !== 'active') return {type: 'FeatureCollection', features: []};
        const {coordinates, accuracy} = locationPosition;
        const features = [{type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates}}];
        // Окружность на сфере: accuracy в метрах, а не постоянное число экранных пикселей.
        if (accuracy > 0 && accuracy < Math.PI * 6371008.8) {
          const latitude = coordinates[1] * Math.PI / 180, longitude = coordinates[0] * Math.PI / 180;
          const distance = accuracy / 6371008.8, ring = [];
          for (let i = 0; i <= 64; i++) {
            const bearing = i * 2 * Math.PI / 64;
            const lat = Math.asin(Math.sin(latitude) * Math.cos(distance) + Math.cos(latitude) * Math.sin(distance) * Math.cos(bearing));
            const lon = longitude + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(latitude), Math.cos(distance) - Math.sin(latitude) * Math.sin(lat));
            ring.push([lon * 180 / Math.PI, lat * 180 / Math.PI]);
          }
          ring[64] = [...ring[0]];
          features.unshift({type: 'Feature', properties: {}, geometry: {type: 'Polygon', coordinates: [ring]}});
        }
        return {type: 'FeatureCollection', features};
      }
      function renderLocation() {
        if (map.getStyle()?.layers) map.getSource('bspm-location')?.setData(locationData());
      }
      function installLocation() {
        if (map.getSource('bspm-location')) return;
        map.addSource('bspm-location', {type: 'geojson', data: locationData()});
        const before = map.getLayer('bspm-route-outline') ? 'bspm-route-outline' : 'bspm-leaders';
        map.addLayer({id: 'bspm-location-accuracy', type: 'fill', source: 'bspm-location', filter: ['==', ['geometry-type'], 'Polygon'], paint: {'fill-color': '#CCD5AE', 'fill-opacity': .35}}, before);
        map.addLayer({id: 'bspm-location-accuracy-edge', type: 'line', source: 'bspm-location', filter: ['==', ['geometry-type'], 'Polygon'], paint: {'line-color': '#39412C', 'line-width': 1, 'line-opacity': .4}}, before);
        map.addLayer({id: 'bspm-location-halo', type: 'circle', source: 'bspm-location', filter: ['==', ['geometry-type'], 'Point'], paint: {'circle-radius': 13, 'circle-color': '#E8B4C7', 'circle-opacity': .6}});
        map.addLayer({id: 'bspm-location-dot', type: 'circle', source: 'bspm-location', filter: ['==', ['geometry-type'], 'Point'], paint: {'circle-radius': 7, 'circle-color': '#39412C', 'circle-stroke-width': 3, 'circle-stroke-color': '#FFF8EE'}});
      }
      function setLocationState(next, message = '') {
        locationState = next;
        locationStatus.hidden = !message;
        if (locationMessage.textContent !== message) locationMessage.textContent = message;
        locateButton.setAttribute('aria-pressed', String(locationWatch !== null));
        locateButton.setAttribute('aria-busy', String(next === 'requesting'));
        locateButton.title = locationWatch === null ? 'Показать моё местоположение' : 'Вернуться к моему местоположению';
        locationStop.setAttribute('aria-label', locationWatch === null ? 'Закрыть сообщение' : 'Выключить геолокацию');
        renderJourney();
        measureFooter();
        if (popup) scheduleVisibility();
      }
      function stopLocation() {
        locationSession++;
        if (locationWatch !== null) navigator.geolocation.clearWatch(locationWatch);
        locationWatch = null; locationPosition = null; locationFollow = false;
        clearTimeout(locationTimer); renderLocation(); setLocationState('idle');
      }
      function centerLocation(initial = false) {
        if (!locationPosition || locationState !== 'active' || !locationFollow) return;
        overview = false;
        map.easeTo({center: locationPosition.coordinates, zoom: initial ? Math.max(map.getZoom(), 16.5) : map.getZoom(), duration: reducedMotion() ? 0 : 300});
      }
      function locationFailure(error) {
        clearTimeout(locationTimer); locationPosition = null; renderLocation();
        if (error.code === 1) {
          stopLocation();
          setLocationState('error', 'Доступ к местоположению закрыт. Разрешите его в настройках браузера и нажмите «Где я».');
        } else {
          setLocationState('error', error.code === 3
            ? 'Положение пока не определено. Ждём сигнал; нажмите «Где я», чтобы повторить.'
            : 'Не удалось определить положение. Проверьте геолокацию устройства и нажмите «Где я».');
        }
      }
      function receiveLocation(position) {
        const {longitude, latitude, accuracy} = position.coords || {};
        if (![longitude, latitude, accuracy, position.timestamp].every(Number.isFinite) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || accuracy < 0) {
          locationFailure({code: 2}); return;
        }
        const age = Date.now() - position.timestamp;
        if (age > 45000) { locationFailure({code: 3}); return; }
        clearTimeout(locationTimer);
        const first = !locationPosition || locationState !== 'active';
        locationPosition = {coordinates: [longitude, latitude], accuracy};
        const outside = Math.abs(latitude) > 85 || (!options.liveBasemap && !map.getMaxBounds().contains(locationPosition.coordinates));
        const precision = accuracy >= 1000 ? `${(accuracy / 1000).toLocaleString('ru-RU', {maximumFractionDigits: 1})} км` : `${Math.ceil(accuracy)} м`;
        setLocationState(outside ? 'outside' : 'active', outside
          ? `Вы вне района карты прогулки. Точность ±${precision}.`
          : `${accuracy > 100 ? 'Положение приблизительное' : 'Вы на карте'} · точность ±${precision}.`);
        renderLocation(); centerLocation(first);
        const session = locationSession;
        locationTimer = setTimeout(() => {
          if (destroyed || session !== locationSession) return;
          locationPosition = null; renderLocation();
          setLocationState('error', 'Положение не обновлялось. Ожидаем новый сигнал; «Где я» повторит поиск.');
        }, Math.max(0, 45000 - Math.max(0, age)));
      }
      function locate() {
        if (destroyed) return;
        if (!window.isSecureContext) {
          setLocationState('error', 'Для геолокации откройте карту по HTTPS.'); return;
        }
        if (!navigator.geolocation) {
          setLocationState('unsupported', 'Этот браузер не поддерживает геолокацию. Откройте карту в браузере телефона.'); return;
        }
        const policy = document.permissionsPolicy || document.featurePolicy;
        if (policy?.allowsFeature && !policy.allowsFeature('geolocation')) {
          setLocationState('error', 'Встроенная страница блокирует геолокацию. Откройте карту отдельно или разрешите геолокацию в настройках встраивания.'); return;
        }
        hideCard(); overview = false; locationFollow = true;
        if (locationWatch !== null && locationPosition) { centerLocation(true); return; }
        if (locationWatch !== null && locationState === 'requesting') return;
        stopLocation(); locationFollow = true;
        const session = locationSession;
        setLocationState('requesting', 'Разрешите доступ в браузере. Ищем положение; × выключит геолокацию.');
        try {
          const watch = navigator.geolocation.watchPosition(
            position => { if (!destroyed && session === locationSession) receiveLocation(position); },
            error => { if (!destroyed && session === locationSession) locationFailure(error); },
            {enableHighAccuracy: true, maximumAge: 5000, timeout: 20000}
          );
          if (destroyed || session !== locationSession) navigator.geolocation.clearWatch(watch);
          else { locationWatch = watch; setLocationState(locationState, locationMessage.textContent); }
        } catch (error) {
          stopLocation();
          setLocationState('error', 'Геолокация недоступна. Проверьте разрешение браузера и нажмите «Где я».');
        }
      }
      function setState(next, title = '', text = '') {
        status = next; stateBox.hidden = next === 'ready';
        root.classList.toggle('bspm-pending', next === 'loading'); root.classList.toggle('bspm-failed', next === 'error');
        stateBox.querySelector('strong').textContent = title; stateBox.querySelector('p').textContent = text;
        retryButton.hidden = next !== 'error';
      }
      function fail(message) {
        if (destroyed || loaded) return;
        setState('error', 'Карта не загрузилась', message);
        if (!settled) { settled = true; rejectReady(new Error(message)); }
      }
      function startLoadTimer() {
        clearTimeout(loadTimer);
        loadTimer = setTimeout(() => fail('Не получены улицы и здания. Проверьте доступ к tiles.openfreemap.org и попробуйте ещё раз.'), 25000);
      }
      function confirmMap() {
        if (destroyed || loaded || !map.isStyleLoaded()) return;
        const realFeatures = map.getSource('openmaptiles')?.type === 'vector' && map.queryRenderedFeatures().some(f => f.source === 'openmaptiles' && ['building', 'transportation', 'transportation_name'].includes(f.sourceLayer));
        if (!realFeatures) return;
        loaded = true; clearTimeout(loadTimer); setState('ready'); layoutMarkers();
        if (!settled) { settled = true; resolveReady(); }
        container.dispatchEvent(new CustomEvent('bespokoistvo:mapready', {detail: {provider: 'OpenFreeMap', route: routeState}}));
      }
      function layoutMarkers() {
        if (destroyed) return;
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (w < 80 || h < 80) return;
        const anchors = markers.map(m => map.project(m.s.coordinates));
        const positions = anchors.map(p => ({x: p.x, y: p.y}));
        const i5 = markers.findIndex(m => m.s.order === 5), i6 = markers.findIndex(m => m.s.order === 6);
        // Разводятся только экранные номера. Для 05/06 сохраняется направление юго-восток.
        for (let pass = 0; pass < 48; pass++) {
          let changed = false;
          for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) {
            const a = positions[i], b = positions[j];
            const visible = [anchors[i], anchors[j]].every(p => p.x >= -50 && p.x < w + 50 && p.y >= -50 && p.y < h + 50);
            if (!visible) continue;
            let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
            if (d >= 50) continue;
            if (d < .1) { dx = j % 2 ? 1 : -1; dy = 1; d = Math.SQRT2; }
            const push = (50 - d) / 2 + .1;
            a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push; changed = true;
          }
          if (i5 >= 0 && i6 >= 0) {
            const a = positions[i5], b = positions[i6], dx = anchors[i6].x - anchors[i5].x, dy = anchors[i6].y - anchors[i5].y;
            const d = Math.hypot(dx, dy), current = Math.hypot(b.x - a.x, b.y - a.y);
            if (d < 70 && d > .01 && (b.x <= a.x || b.y <= a.y || current < 50)) {
              const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, distance = Math.max(50, current);
              a.x = cx - dx / d * distance / 2; a.y = cy - dy / d * distance / 2;
              b.x = cx + dx / d * distance / 2; b.y = cy + dy / d * distance / 2; changed = true;
            }
          }
          if (!changed) break;
        }
        const features = [];
        markers.forEach((item, i) => {
          const p = positions[i], a = anchors[i]; item.offset = [p.x - a.x, p.y - a.y]; item.marker.setOffset(item.offset);
          if (Math.hypot(...item.offset) > 2) {
            features.push({type: 'Feature', properties: {}, geometry: {type: 'LineString', coordinates: [item.s.coordinates, map.unproject([p.x, p.y]).toArray()]}});
            features.push({type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: item.s.coordinates}});
          }
        });
        if (map.getStyle()?.layers) map.getSource('bspm-anchors')?.setData({type: 'FeatureCollection', features});
        const labels = w >= 760 ? markers.map((m, i) => ({type: 'Feature', properties: {title: m.s.shortTitle || m.s.title, order: m.s.order}, geometry: {type: 'Point', coordinates: map.unproject([positions[i].x, positions[i].y]).toArray()}})) : [];
        if (map.getStyle()?.layers) map.getSource('bspm-stop-labels')?.setData({type: 'FeatureCollection', features: labels});
        illustrations.forEach(({image}) => { image.hidden = w < 600 || map.getZoom() < 16; });
      }
      function scheduleLayout() {
        if (destroyed) return;
        cancelAnimationFrame(layoutFrame); layoutFrame = requestAnimationFrame(layoutMarkers);
      }
      function ensureSelectedVisible() {
        if (destroyed || !selected || !popup) return;
        measureFooter();
        const item = markers.find(m => m.s.id === selected), p = map.project(item.s.coordinates);
        const r = canvas.getBoundingClientRect(), card = popup.getBoundingClientRect();
        const q = {x: p.x + item.offset[0], y: p.y + item.offset[1]};
        const approach = map.project(item.s.approachCoordinates || item.s.coordinates);
        const left = Math.min(p.x, q.x, approach.x) - 25, right = Math.max(p.x, q.x, approach.x) + 25;
        const top = Math.min(p.y, q.y, approach.y) - 25, bottom = Math.max(p.y, q.y, approach.y) + 25;
        let dx = left < 8 ? left - 8 : right > r.width - 8 ? right - r.width + 8 : 0;
        const cardLeft = card.left - r.left, cardRight = card.right - r.left, cardTop = card.top - r.top;
        const overlapsCard = right - dx > cardLeft - 10 && left - dx < cardRight + 10 && bottom > cardTop - 10;
        const safeBottom = overlapsCard ? cardTop - 12 : r.height - measureFooter().bottom;
        let dy = bottom > safeBottom ? bottom - safeBottom : 0;
        const safeTop = measureFooter().top;
        if (top - dy < safeTop) dy = top - safeTop;
        if (Math.abs(dx) > .5 || Math.abs(dy) > .5) map.panBy([dx, dy], {duration: reducedMotion() ? 0 : 260});
      }
      function scheduleVisibility() {
        cancelAnimationFrame(visibilityFrame);
        visibilityFrame = requestAnimationFrame(() => { layoutMarkers(); ensureSelectedVisible(); });
      }
      function selectStop(id, {notify = true} = {}) {
        if (destroyed) return false;
        const s = stops.find(s => s.id === id); if (!s) return false;
        const changed = selected !== id; selected = id; overview = false; locationFollow = false;
        markers.forEach(item => item.button.setAttribute('aria-pressed', String(item.s.id === id)));
        hideCard();
        const card = document.createElement('div'); card.className = 'bspm-tooltip'; card.setAttribute('role', 'status');
        const index = document.createElement('span'); index.className = 'bspm-popup-number'; index.textContent = `Остановка ${number(s.order)} из ${number(stops.length)}`;
        const title = document.createElement('strong'); title.className = 'bspm-popup-title'; title.textContent = s.title;
        const address = document.createElement('p'); address.className = 'bspm-popup-address'; address.textContent = s.address || '';
        card.append(index, title, address);
        if (s.approachNote || s.id === 'psychology') {
          const note = document.createElement('p'); note.className = 'bspm-popup-note'; note.textContent = s.approachNote || s.note; card.append(note);
        }
        if (navigation) {
          const go = document.createElement('button'); go.type = 'button'; go.className = 'bspm-popup-go';
          go.textContent = 'Идти к этой остановке'; go.onclick = () => setNextStop(id); card.append(go);
        }
        const close = document.createElement('button'); close.type = 'button'; close.className = 'bspm-popup-close'; close.textContent = '×'; close.setAttribute('aria-label', 'Закрыть карточку'); close.onclick = hideCard; card.append(close);
        root.append(card); popup = card; renderJourney(); overlayObserver.observe(card); measureFooter(); scheduleVisibility();
        if (notify && changed) {
          options.onStopSelect?.(id);
          container.dispatchEvent(new CustomEvent('bespokoistvo:stopselect', {bubbles: true, detail: {id, order: s.order, coordinates: [...s.coordinates]}}));
        }
        return true;
      }
      async function loadConfiguredStyle() {
        styleController.abort(); styleController = new AbortController();
        const controller = styleController;
        try {
          const configured = options.style || defaultStyle;
          const styleBase = typeof configured === 'string' ? new URL(configured, base) : base;
          let specification;
          if (typeof configured === 'string') {
            const response = await fetch(styleBase, {signal: controller.signal});
            if (!response.ok) throw new Error('Не получен JSON стиля.');
            specification = await response.json();
          } else specification = JSON.parse(JSON.stringify(configured));
          const absolute = url => new URL(url, styleBase).href.replace(/%7B/gi, '{').replace(/%7D/gi, '}');
          if (specification.glyphs) specification.glyphs = absolute(specification.glyphs);
          if (typeof specification.sprite === 'string') specification.sprite = absolute(specification.sprite);
          else if (Array.isArray(specification.sprite)) specification.sprite = specification.sprite.map(item => ({...item, url: absolute(item.url)}));
          Object.values(specification.sources || {}).forEach(source => {
            if (source.url) source.url = absolute(source.url);
            if (source.tiles) source.tiles = source.tiles.map(absolute);
            if (typeof source.data === 'string') source.data = absolute(source.data);
          });
          if (!destroyed && !controller.signal.aborted) map.setStyle(specification);
        } catch (error) {
          if (!destroyed && error.name !== 'AbortError') fail('Не удалось загрузить стиль карты. Проверьте файлы компонента.');
        }
      }
      function installRoute() {
        if (!routeGeometry || !map.getStyle()?.layers || !map.getSource('bspm-anchors') || map.getSource('bspm-route')) return;
        map.addSource('bspm-route', {type: 'geojson', data: routeGeometry});
        map.addLayer({id: 'bspm-route-outline', type: 'line', source: 'bspm-route', layout: {'line-join': 'round', 'line-cap': 'round'}, paint: {'line-color': '#39412C', 'line-width': 6, 'line-opacity': .7}}, 'bspm-leaders');
        map.addLayer({id: 'bspm-route-line', type: 'line', source: 'bspm-route', layout: {'line-join': 'round', 'line-cap': 'round'}, paint: {'line-color': '#E8B4C7', 'line-width': 4.5}}, 'bspm-leaders');
        map.addSource('bspm-route-approaches', {type: 'geojson', data: {type: 'FeatureCollection', features: stops.filter(s => s.approachCoordinates).map(s => ({type: 'Feature', properties: {id: s.id}, geometry: {type: 'Point', coordinates: s.approachCoordinates}}))}});
        map.addLayer({id: 'bspm-route-approach-dots', type: 'circle', source: 'bspm-route-approaches', paint: {'circle-radius': 3.5, 'circle-color': '#FFF8EE', 'circle-stroke-width': 1.2, 'circle-stroke-color': '#39412C'}}, 'bspm-leaders');
        renderNextLeg();
      }
      function installStopLabels() {
        // Прозрачная область 48×48 резервирует место для DOM-номера в механизме коллизий SDK.
        if (!map.hasImage('bspm-stop-hitbox')) map.addImage('bspm-stop-hitbox', {width: 48, height: 48, data: new Uint8Array(48 * 48 * 4)});
        map.addSource('bspm-stop-labels', {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
        map.addLayer({id: 'bspm-stop-names', type: 'symbol', source: 'bspm-stop-labels', layout: {
          'icon-image': 'bspm-stop-hitbox', 'icon-allow-overlap': false, 'icon-ignore-placement': false,
          'text-field': ['get', 'title'], 'text-font': ['Noto Sans Regular'], 'text-size': 11.5,
          'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': 2.4,
          'text-justify': 'auto', 'text-max-width': 13, 'text-padding': 7,
          'text-allow-overlap': false, 'text-ignore-placement': false, 'symbol-sort-key': ['get', 'order']
        }, paint: {'text-color': '#39412C', 'text-halo-color': '#FFF8EE', 'text-halo-width': 2}});
      }
      function onStyleLoad() {
        if (destroyed) return;
        map.addSource('bspm-anchors', {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
        map.addLayer({id: 'bspm-leaders', type: 'line', source: 'bspm-anchors', filter: ['==', ['geometry-type'], 'LineString'], paint: {'line-color': '#626653', 'line-width': 1, 'line-opacity': .65}});
        map.addLayer({id: 'bspm-anchor-dots', type: 'circle', source: 'bspm-anchors', filter: ['==', ['geometry-type'], 'Point'], paint: {'circle-radius': 2.2, 'circle-color': '#39412C', 'circle-stroke-width': 1, 'circle-stroke-color': '#FFF8EE'}});
        installRoute(); installStopLabels(); installLocation();
        if (overview) fitRoute({animate: false}); else scheduleVisibility();
        scheduleLayout();
      }
      const overlayObserver = new ResizeObserver(() => {
        measureFooter();
        if (overview) fitRoute({animate: false, keepCard: Boolean(popup)}); else scheduleVisibility();
      });
      overlayObserver.observe(root.querySelector('.maplibregl-ctrl-attrib')); overlayObserver.observe(routeNote); overlayObserver.observe(locationStatus); overlayObserver.observe(journey);
      const resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          if (destroyed) return;
          map.resize(); measureFooter();
          if (overview) fitRoute({animate: false, keepCard: Boolean(popup)}); else scheduleVisibility();
        });
      });
      resizeObserver.observe(container); resizeObserver.observe(canvas);
      map.on('style.load', onStyleLoad); map.on('idle', confirmMap); map.on('move', scheduleLayout);
      map.on('dragstart', () => { overview = false; locationFollow = false; });
      map.on('wheel', () => { overview = false; locationFollow = false; });
      map.on('zoomstart', e => { if (e.originalEvent) { overview = false; locationFollow = false; } });
      map.on('error', e => {
        if (loaded) return;
        if (e.sourceId === 'openmaptiles' || /style\.json|planet\/latest|Failed to fetch|AJAXError/.test(String(e.error?.message || ''))) {
          fail('Не удалось получить настоящую подложку OpenFreeMap. Проверьте доступ к tiles.openfreemap.org.');
        }
      });
      fitButton.onclick = () => fitRoute();
      locateButton.onclick = locate;
      locationStop.onclick = stopLocation;
      journeyPrev.onclick = () => stepJourney(-1);
      journeyNext.onclick = () => stepJourney(1);
      journeyTarget.onclick = () => { if (stops[nextStopIndex]) selectStop(stops[nextStopIndex].id); };
      retryButton.onclick = () => {
        if (destroyed) return;
        loaded = false; setState('loading', 'Загружаем карту Москвы', 'Повторно запрашиваем улицы и здания.');
        loadConfiguredStyle(); startLoadTimer();
      };
      loadConfiguredStyle(); startLoadTimer(); fitRoute({animate: false});
      const routePromise = window.BespokoistvoRoute
        ? window.BespokoistvoRoute.load(base, stops, routeAbort.signal)
        : Promise.resolve({status: 'blocked', geometry: null});
      routePromise.then(bundle => {
        if (destroyed) return;
        routeState = bundle.status; routeGeometry = bundle.geometry;
        if (routeGeometry) {
          routeGeometry.features.forEach(f => f.geometry.coordinates.forEach(p => bounds.extend(p)));
          navigation = window.BespokoistvoRoute.createNavigation(routeGeometry, stops);
          routeNote.textContent = 'Пешеходный маршрут · 8 остановок'; renderJourney(); installRoute(); renderNextLeg();
          if (overview) fitRoute({animate: false, keepCard: Boolean(popup)});
        } else routeNote.textContent = 'Пешая линия пока не добавлена';
      }).catch(error => {
        if (destroyed || error.name === 'AbortError') return;
        routeState = 'error'; routeNote.textContent = 'Не удалось загрузить сохранённый маршрут';
      });
      const api = Object.freeze({
        ready, selectStop, fitRoute, setNextStop,
        getStatus: () => ({basemap: status, selectedStop: selected, route: routeState, overview, navigation: navigationStatus(), geolocation: {state: locationState, watching: locationWatch !== null, following: locationFollow}, zoom: map.getZoom(), center: map.getCenter().toArray(), destroyed}),
        destroy() {
          if (destroyed) return;
          stopLocation(); destroyed = true;
          styleController.abort(); routeAbort.abort(); if (instances.get(container) === api) instances.delete(container);
          clearTimeout(loadTimer); cancelAnimationFrame(layoutFrame); cancelAnimationFrame(resizeFrame); cancelAnimationFrame(visibilityFrame);
          resizeObserver.disconnect(); overlayObserver.disconnect(); popup?.remove();
          markers.forEach(m => m.marker.remove()); illustrations.forEach(m => m.marker.remove());
          fitButton.onclick = null; retryButton.onclick = null; locateButton.onclick = null; locationStop.onclick = null;
          journeyPrev.onclick = null; journeyNext.onclick = null; journeyTarget.onclick = null; map.remove(); host.remove();
          if (!settled) { settled = true; rejectReady(new Error('Компонент удалён до загрузки карты.')); }
        }
      });
      instances.set(container, api);
      return api;
    }
  });
})();
