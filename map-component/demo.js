/* Минимальная демонстрация: только карта, без внешнего интерфейса. */
window.moscowMap = BespokoistvoMap.create(document.getElementById('map'), {
  stops: BespokoistvoStops,
  onStopSelect(id) { /* Здесь аудиогид может обработать выбор. Звук не запускается. */ }
});
window.moscowMap.ready.catch(() => { /* Ошибка уже показана внутри карты. */ });
