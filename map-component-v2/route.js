/* Загрузка только СОХРАНЁННОГО маршрута. Посетитель не обращается к маршрутизатору. */
(() => {
  'use strict';
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
    validate,
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
