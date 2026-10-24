const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const origin = process.env.MAP_TEST_ORIGIN || 'http://127.0.0.1:8087';
const route = JSON.parse(fs.readFileSync(path.join(root, 'route.geojson')));
const observe = `const OriginalMap=maplibregl.Map;maplibregl.Map=class extends OriginalMap{constructor(...a){super(...a);window.observedMap=this;window.sdkErrors=[];this.on('error',e=>sdkErrors.push(String(e.error?.message||e.error)))}};`;
async function open(page) {
  await page.route('**/demo.js', r => r.fulfill({contentType: 'text/javascript', body: observe + fs.readFileSync(path.join(root, 'demo.js'), 'utf8')}));
  await page.goto(origin + '/map-demo.html');
  await page.waitForFunction(() => moscowMap.getStatus().basemap === 'ready' && moscowMap.getStatus().navigation, null, {timeout: 30000});
}
const progress = page => page.evaluate(() => moscowMap.getStatus().navigation);
const waitStill = page => page.waitForFunction(() => !observedMap.isMoving());
async function fix(context, page, coordinates, accuracy, mode) {
  await context.setGeolocation({longitude: coordinates[0], latitude: coordinates[1], accuracy});
  await page.waitForFunction(expected => moscowMap.getStatus().navigation.mode === expected, mode);
  await waitStill(page);
}
(async () => {
  const browser = await chromium.launch({executablePath: process.env.MAP_CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  for (const [name, width, height] of [['desktop', 1280, 800], ['phone', 320, 640], ['short-phone', 320, 360]]) {
    const context = await browser.newContext({viewport: {width, height}, reducedMotion: 'reduce', permissions: ['geolocation'], geolocation: {longitude: 37.6067634, latitude: 55.7527926, accuracy: 5}, ...(name.includes('phone') ? {isMobile: true, hasTouch: true} : {})});
    await context.addInitScript(() => {
      window.geoCalls = 0;
      const watch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
      navigator.geolocation.watchPosition = (...args) => { geoCalls++; return watch(...args); };
    });
    const page = await context.newPage(), errors = [], failed = [], responses = [], requests = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('requestfailed', r => failed.push(r.failure()?.errorText)); page.on('request', r => requests.push(r.url())); page.on('response', r => { if (r.status() >= 400) responses.push(r.status()); });
    await open(page); await page.locator('.bspm-journey').waitFor({state: 'visible'});
    assert.equal(await page.evaluate(() => geoCalls), 0);
    assert.equal((await progress(page)).targetStopId, 'ryabushinsky');
    assert.equal((await progress(page)).distanceMeters, null);
    assert.equal(await page.locator('.bspm-journey-prev').isDisabled(), true);
    await page.locator('.bspm-journey-next').focus(); await page.keyboard.press('Enter'); await waitStill(page);
    assert.equal((await progress(page)).targetStopId, 'gogol-andreev');
    assert(Math.abs((await progress(page)).distanceMeters - 710.976) < 1);
    assert((await page.locator('.bspm-journey-metrics').textContent()).includes('710 м'));
    assert((await page.locator('.bspm-journey-note').textContent()).includes('От остановки 01'));
    assert.deepEqual(await page.evaluate(async () => (await observedMap.getSource('bspm-next-leg').getData()).features[0].geometry.coordinates), route.features[0].geometry.coordinates);
    await page.waitForFunction(() => observedMap.queryRenderedFeatures({layers: ['bspm-next-leg-line']}).length > 0);
    await page.locator('.bspm-journey-target').click();
    assert.equal(await page.locator('.bspm-journey').isVisible(), false);
    assert((await page.locator('.bspm-popup-title').textContent()).includes('Дом Гоголя'));
    await page.locator('.bspm-popup-close').click();
    assert.equal(await page.locator('.bspm-journey').isVisible(), true);
    assert.equal((await progress(page)).targetStopId, 'gogol-andreev');
    await page.evaluate(() => moscowMap.selectStop('psychology'));
    assert.equal((await progress(page)).targetStopId, 'gogol-andreev', 'Browsing another card does not change the walking stage');
    await page.locator('.bspm-popup-go').click(); await waitStill(page);
    assert.equal((await progress(page)).targetStopId, 'psychology');
    assert.equal((await progress(page)).fromStopId, 'varvara-morozova');
    assert.equal(await page.locator('.bspm-marker[data-next]').count(), 1);
    assert.deepEqual(await page.evaluate(async () => (await observedMap.getSource('bspm-next-leg').getData()).features[0].geometry.coordinates), route.features[5].geometry.coordinates);
    await page.locator('.bspm-locate').click();
    await page.waitForFunction(() => moscowMap.getStatus().navigation.mode === 'remaining'); await waitStill(page);
    const firstRemaining = (await progress(page)).remainingMeters;
    assert(Math.abs(firstRemaining - 356.71347) < .2);
    await fix(context, page, route.features[5].geometry.coordinates[16], 5, 'remaining');
    assert((await progress(page)).remainingMeters < firstRemaining - 100);
    await fix(context, page, route.features[5].geometry.coordinates[16], 180, 'imprecise');
    assert.equal((await progress(page)).remainingMeters, null);
    assert((await page.locator('.bspm-journey-note').textContent()).includes('Весь участок'));
    assert((await page.locator('.bspm-journey-note').textContent()).includes('GPS неточный'));
    await fix(context, page, [30.31, 59.94], 5, 'off-route');
    assert.equal((await progress(page)).remainingMeters, null);
    await fix(context, page, route.features[5].geometry.coordinates.at(-1), 5, 'at-approach');
    assert.equal((await progress(page)).targetStopId, 'psychology', 'GPS arrival never advances automatically');
    await page.locator('.bspm-fit').click(); await waitStill(page);
    assert.equal((await progress(page)).targetStopId, 'psychology', 'Whole route preserves current stage');
    const panel = await page.locator('.bspm-journey').boundingBox(), geo = await page.locator('.bspm-location-status').boundingBox(), attrib = await page.locator('.maplibregl-ctrl-attrib').boundingBox();
    assert(panel.x >= 0 && panel.x + panel.width <= width && panel.y >= geo.y + geo.height && panel.y + panel.height <= attrib.y, 'GPS, navigation and attribution never overlap');
    for (const selector of ['.bspm-journey-prev', '.bspm-journey-next']) { const box = await page.locator(selector).boundingBox(); assert(box.width >= 44 && box.height >= 44); }
    await page.locator('.bspm-location-status button').click();
    assert.equal((await progress(page)).mode, 'leg');
    assert.equal((await progress(page)).remainingMeters, null);
    await page.locator('.bspm-journey-prev').click(); await waitStill(page);
    assert.equal((await progress(page)).targetStopId, 'varvara-morozova');
    assert(Math.abs((await progress(page)).distanceMeters - 28.81) < 1);
    assert((await page.locator('.bspm-journey-metrics').textContent()).includes('< 1 мин'));
    await page.locator('.bspm-locate').click();
    await fix(context, page, route.features[4].geometry.coordinates.at(-1), 5, 'at-approach');
    assert.equal((await progress(page)).targetStopId, 'varvara-morozova');
    await page.locator('.bspm-location-status button').click();
    await page.locator('.bspm-journey-next').click(); await page.locator('.bspm-journey-next').click();
    assert.equal((await progress(page)).targetStopId, 'old-msu');
    await page.locator('.bspm-journey-next').click();
    assert.equal((await progress(page)).completed, true);
    assert.equal(await page.locator('.bspm-marker[data-next]').count(), 0);
    await page.locator('.bspm-journey-prev').click();
    assert.equal((await progress(page)).targetStopId, 'old-msu');
    await page.locator('.bspm-journey-next').click(); await page.locator('.bspm-journey-next').click();
    assert.equal((await progress(page)).targetStopId, 'ryabushinsky');
    assert.equal(await page.locator('.bspm-journey-prev').isDisabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.evaluate(() => moscowMap.setNextStop('unknown-id')), false);
    assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(responses, []); assert.deepEqual(await page.evaluate(() => sdkErrors), []);
    assert(requests.every(url => url.startsWith(origin)), 'No external route/GPS request from component');
    await page.evaluate(() => moscowMap.destroy());
    assert.equal(await page.evaluate(() => moscowMap.setNextStop('psychology')), false);
    console.log('PASS', name, 'manual stages, keyboard, ordered saved-line distances/highlight, cards, live remaining/ETA, inaccurate/outside GPS, no auto-advance, close 05/06, finish/restart, layout, no JS/SDK/network errors');
    await context.close();
  }
  {
    const context = await browser.newContext(); const page = await context.newPage();
    await page.route('**/route.geojson', r => r.fulfill({status: 503, body: 'Unavailable'}));
    await page.goto(origin + '/map-demo.html');
    await page.waitForFunction(() => window.moscowMap && moscowMap.getStatus().route === 'error');
    assert.equal(await page.locator('.bspm-journey').isVisible(), false);
    assert.equal(await page.evaluate(() => moscowMap.setNextStop('psychology')), false);
    assert((await page.locator('.bspm-route-note').textContent()).includes('Не удалось'));
    console.log('PASS route failure has an explicit message and no invented distance or navigation');
    await context.close();
  }
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
