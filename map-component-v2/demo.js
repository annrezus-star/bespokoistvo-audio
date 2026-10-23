/* Минимальная демонстрация: только карта, без внешнего интерфейса. */
window.moscowMap = BespokoistvoMap.create(document.getElementById('map'), {
  stops: BespokoistvoStops,
  cooperativeGestures: false, // Самостоятельная карта: колёсико без Ctrl/⌘.
  scrollZoom: true,
  onStopSelect(id) { /* Здесь аудиогид может обработать выбор. Звук не запускается. */ }
});
window.moscowMap.ready.catch(() => { /* Ошибка уже показана внутри карты. */ });
