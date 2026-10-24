/* Загрузка только СОХРАНЁННОГО маршрута. Посетитель не обращается к маршрутизатору. */
(() => {
  'use strict';
  const radians = degrees => degrees * Math.PI / 180;
  const earthRadius = 6371008.8;
  const longitudeDelta = degrees => ((degrees + 540) % 360) - 180;
  function distance(a, b) {
    const lat = radians(b[1] - a[1]), lon = radians(longitudeDelta(b[0] - a[0]));
    const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(lon / 2) ** 2;
    return 2 * earthRadius * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  function createNavigation(geometry, stops) {
    const legs = geometry.features.map(feature => {
      let length = 0;
      const coordinates = feature.geometry.coordinates;
      const segments = coordinates.slice(1).map((b, i) => {
        const a = coordinates[i], metres = distance(a, b), start = length;
        length += metres;
        return {a, b, length: metres, start};
      });
      return {feature, segments, length};
    });
    return Object.freeze({
      geometryFor(target) { return legs[target - 1]?.feature || null; },
      measure(target, position) {
        if (!Number.isInteger(target) || target < 0 || target > stops.length) throw new RangeError('Некорректная следующая остановка.');
        const result = {targetStopId: stops[target]?.id || null, fromStopId: stops[target - 1]?.id || null, completed: target === stops.length, mode: target === 0 ? 'start' : 'leg', distanceMeters: null, remainingMeters: null, estimatedMinutes: null};
        if (result.completed) return {...result, mode: 'complete'};
        const leg = legs[target - 1];
        if (leg) { result.distanceMeters = leg.length; result.estimatedMinutes = leg.length / (4000 / 60); }
        if (!position) return result;
        const {coordinates, accuracy} = position;
        if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite) || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 50) return {...result, mode: 'imprecise'};
        if (!leg) {
          const approach = stops[0].approachCoordinates || stops[0].coordinates;
          return {...result, mode: accuracy <= 25 && distance(coordinates, approach) <= 20 ? 'at-start' : 'start'};
        }
        // Проецируем только на выбранный участок: соседняя/обратная ветка не меняет этап.
        const candidates = leg.segments.filter(segment => segment.length > 0).map(segment => {
          const {a, b} = segment, scale = Math.cos(radians((a[1] + b[1]) / 2));
          const x = radians(longitudeDelta(b[0] - a[0])) * earthRadius * scale, y = radians(b[1] - a[1]) * earthRadius;
          const px = radians(longitudeDelta(coordinates[0] - a[0])) * earthRadius * scale, py = radians(coordinates[1] - a[1]) * earthRadius;
          const t = Math.max(0, Math.min(1, (px * x + py * y) / (x * x + y * y)));
          const projected = [a[0] + longitudeDelta(b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          return {away: distance(coordinates, projected), along: segment.start + segment.length * t};
        }).sort((a, b) => a.away - b.away);
        const nearest = candidates[0];
        if (!nearest || nearest.away > Math.max(25, accuracy * 1.5)) return {...result, mode: 'off-route'};
        const plausible = candidates.filter(candidate => candidate.away <= nearest.away + Math.max(2, accuracy / 2));
        if (plausible.some(candidate => Math.abs(candidate.along - nearest.along) > Math.max(60, accuracy * 2))) return {...result, mode: 'ambiguous'};
        const remaining = Math.max(0, leg.length - nearest.along);
        const nearApproach = remaining <= 25 && accuracy <= 25 && distance(coordinates, leg.feature.geometry.coordinates.at(-1)) <= 20;
        return {...result, mode: nearApproach ? 'at-approach' : 'remaining', remainingMeters: remaining, estimatedMinutes: remaining / (4000 / 60)};
      }
    });
  }
  function validate(manifest, geojson, stops) {
    if (manifest.status !== 'ready' || !['walking', 'foot'].includes(manifest.profile)) throw new Error('Маршрут не подтверждён как пешеходный.');
    if (!manifest.provider || !manifest.sourceUrl || !manifest.checkedDate) throw new Error('Нет происхождения и даты геометрии.');
    if (geojson?.type !== 'FeatureCollection' || geojson.features?.length !== stops.length - 1) throw new Error('Нужны семь последовательных участков GeoJSON.');
    geojson.features.forEach((f, i) => {
      if (f.type !== 'Feature' || f.geometry?.type !== 'LineString' || f.properties?.from !== stops[i].id || f.properties?.to !== stops[i + 1].id) throw new Error('Нарушен порядок участков маршрута.');
      const coords = f.geometry.coordinates;
      if (!Array.isArray(coords) || coords.length < 2 || coords.some(p => !Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(Number.isFinite) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 85)) throw new Error('Некорректная геометрия [долгота, широта].');
      if (f.properties.verification !== 'checked' || f.properties.publicAccess !== true) throw new Error('Пешеходные подходы и доступность участка не подтверждены.');
    });
    return geojson;
  }
  window.BespokoistvoRoute = Object.freeze({
    validate, createNavigation,
    async load(base, stops, signal) {
      const response = await fetch(new URL('route-status.json', base), {signal});
      if (!response.ok) throw new Error('Не получены сведения о сохранённом маршруте.');
      const manifest = await response.json();
      if (manifest.status !== 'ready' || !manifest.geometryFile) return {status: manifest.status || 'blocked', manifest, geometry: null};
      if (manifest.geometryFile !== 'route.geojson') throw new Error('Ожидается локальный route.geojson, не запрос к сервису маршрутизации.');
      const routeResponse = await fetch(new URL('route.geojson', base), {signal});
      if (!routeResponse.ok) throw new Error('Сохранённая пешая линия недоступна.');
      return {status: 'ready', manifest, geometry: validate(manifest, await routeResponse.json(), stops)};
    }
  });
})();
