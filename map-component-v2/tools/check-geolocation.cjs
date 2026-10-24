const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.MAP_TEST_ORIGIN || 'http://127.0.0.1:8085';
const demo = fs.readFileSync(require('node:path').join(__dirname, '..', 'demo.js'), 'utf8');
const observer = `const OriginalMap=maplibregl.Map;maplibregl.Map=class extends OriginalMap{constructor(...a){super(...a);window.observedMap=this;window.sdkErrors=[];this.on('error',e=>sdkErrors.push(String(e.error?.message||e.error)))}};`;
const nativeObserver = () => {
  window.geoCalls = []; window.geoClears = [];
  const geo = navigator.geolocation;
  const watch = geo.watchPosition.bind(geo), clear = geo.clearWatch.bind(geo);
  geo.watchPosition = (...args) => { window.geoCalls.push(args[2]); return watch(...args); };
  geo.clearWatch = id => { window.geoClears.push(id); return clear(id); };
};
async function ready(page) {
  await page.route('**/demo.js', route => route.fulfill({contentType: 'text/javascript', body: observer + demo}));
  await page.goto(origin + '/map-demo.html');
  await page.waitForFunction(() => moscowMap.getStatus().basemap === 'ready' && moscowMap.getStatus().route === 'ready', null, {timeout: 30000});
}
async function geometry(page) {
  return page.evaluate(async () => (await observedMap.getSource('bspm-location').getData()).features);
}
async function waitActive(page) {
  await page.waitForFunction(() => moscowMap.getStatus().geolocation.state === 'active');
  await page.waitForFunction(() => !observedMap.isMoving());
}
(async () => {
  const browser = await chromium.launch({executablePath: process.env.MAP_CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  for (const [name, width, height] of [['desktop', 1280, 800], ['phone', 320, 640], ['short-phone', 320, 360]]) {
    const context = await browser.newContext({viewport: {width, height}, reducedMotion: 'reduce', permissions: ['geolocation'], geolocation: {longitude: 37.5999, latitude: 55.7542, accuracy: 18}, ...(name.includes('phone') ? {isMobile: true, hasTouch: true} : {})});
    await context.addInitScript(nativeObserver);
    const page = await context.newPage(); const errors = [], failed = [], requests = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('requestfailed', r => failed.push(r.failure()?.errorText)); page.on('request', r => requests.push(r.url()));
    await ready(page);
    assert.equal(await page.evaluate(() => geoCalls.length), 0, 'No request on load, even with pre-granted permission');
    const fit = await page.locator('.bspm-fit').boundingBox(), locate = await page.locator('.bspm-locate').boundingBox(), zoom = await page.locator('.maplibregl-ctrl-zoom-in').boundingBox();
    assert(fit.x + fit.width <= locate.x && locate.x + locate.width <= zoom.x, 'Controls fit without overlap');
    assert(locate.height >= 44 && locate.width >= 44);
    await page.locator('.bspm-locate').click(); await waitActive(page);
    let features = await geometry(page);
    assert.equal(features.length, 2); assert.deepEqual(features[1].geometry.coordinates, [37.5999, 55.7542]);
    assert.equal(features[0].geometry.coordinates[0].length, 65);
    await page.waitForFunction(() => observedMap.queryRenderedFeatures({layers: ['bspm-location-dot']}).length > 0 && observedMap.queryRenderedFeatures({layers: ['bspm-location-accuracy']}).length > 0);
    const radius = await page.evaluate(async () => {
      const f = (await observedMap.getSource('bspm-location').getData()).features;
      return new maplibregl.LngLat(...f[1].geometry.coordinates).distanceTo(new maplibregl.LngLat(...f[0].geometry.coordinates[0][0]));
    }); assert(Math.abs(radius - 18) < .1, 'Accuracy radius is genuinely metres');
    assert((await page.locator('.bspm-location-status').textContent()).includes('18 м'));
    assert.equal(await page.locator('.bspm-locate').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => geoCalls.length), 1);
    await context.setGeolocation({longitude: 37.6004, latitude: 55.7544, accuracy: 220});
    await page.waitForFunction(() => document.querySelector('.bspm-host').shadowRoot.querySelector('.bspm-location-status').textContent.includes('220 м'));
    assert((await page.locator('.bspm-location-status').textContent()).includes('приблизительное'));
    await page.waitForFunction(() => Math.abs(moscowMap.getStatus().center[0] - 37.6004) < .00001);
    await page.locator('.bspm-fit').click();
    assert.equal(await page.evaluate(() => moscowMap.getStatus().geolocation.following), false);
    const overviewCenter = await page.evaluate(() => moscowMap.getStatus().center);
    await context.setGeolocation({longitude: 37.6007, latitude: 55.7545, accuracy: 12});
    await page.waitForFunction(() => document.querySelector('.bspm-host').shadowRoot.querySelector('.bspm-location-status').textContent.includes('12 м'));
    const overviewStatus = await page.evaluate(() => moscowMap.getStatus());
    assert.equal(overviewStatus.overview, true, 'Overview is not interrupted by fresh GPS');
    assert.equal(overviewStatus.geolocation.following, false);
    assert(Math.abs(overviewStatus.center[0] - overviewCenter[0]) < .00001 && Math.abs(overviewStatus.center[1] - overviewCenter[1]) < .0002, 'Only status-height padding can adjust overview');
    await page.locator('.bspm-locate').click(); await waitActive(page);
    await page.waitForFunction(() => Math.abs(moscowMap.getStatus().center[0] - 37.6007) < .00001);
    assert.equal(await page.evaluate(() => geoCalls.length), 1, 'Recenter does not create another watch');
    // Genuine pointer drag pauses following, without stopping position updates.
    await page.mouse.move(width / 2, height / 2); await page.mouse.down(); await page.mouse.move(width / 2 + 40, height / 2 + 10, {steps: 4}); await page.mouse.up();
    assert.equal(await page.evaluate(() => moscowMap.getStatus().geolocation.following), false);
    await page.evaluate(() => moscowMap.selectStop('psychology'));
    await page.waitForFunction(() => !observedMap.isMoving());
    const card = await page.locator('.bspm-tooltip').boundingBox(), status = await page.locator('.bspm-location-status').boundingBox(), attribution = await page.locator('.maplibregl-ctrl-attrib').boundingBox();
    assert(card.y >= status.y + status.height, 'Card clears GPS status even at short mobile height');
    assert(card.y + card.height <= attribution.y);
    await context.setGeolocation({longitude: 30.31, latitude: 59.94, accuracy: 20});
    await page.waitForFunction(() => moscowMap.getStatus().geolocation.state === 'outside');
    assert.equal((await geometry(page)).length, 0, 'Outside fix must not leave a misleading old point');
    assert((await page.locator('.bspm-location-status').textContent()).includes('вне района'));
    await context.setGeolocation({longitude: 37.601, latitude: 55.7545, accuracy: 10}); await waitActive(page);
    assert.equal((await geometry(page)).length, 2);
    await page.locator('.bspm-location-status button').click();
    assert.deepEqual(await page.evaluate(() => moscowMap.getStatus().geolocation), {state: 'idle', watching: false, following: false});
    assert.equal((await geometry(page)).length, 0); assert.equal(await page.evaluate(() => geoClears.length), 1);
    await page.locator('.bspm-locate').click(); await waitActive(page);
    await page.evaluate(() => moscowMap.destroy());
    assert.equal(await page.evaluate(() => geoClears.length), 2, 'Destroy clears the watch');
    assert.equal(await page.locator('.bspm-host').count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(await page.evaluate(() => sdkErrors), []);
    assert(requests.every(u => u.startsWith(origin)), 'No application request sends coordinates to another server');
    console.log('PASS', name, 'native browser permission+watch; live fix; metre accuracy; poor accuracy; pointer drag; overview; recenter; outside/back; 44px controls; card layout; stop/destroy; no JS/SDK/network errors');
    await context.close();
  }
  // Browser-level permission denial, exercising the native API.
  {
    const context = await browser.newContext({reducedMotion: 'reduce'}); await context.addInitScript(nativeObserver);
    const page = await context.newPage(); await ready(page);
    const session = await context.newCDPSession(page);
    await session.send('Browser.setPermission', {permission: {name: 'geolocation'}, setting: 'denied', origin});
    await page.locator('.bspm-locate').click(); await page.waitForFunction(() => moscowMap.getStatus().geolocation.state === 'error');
    assert.equal(await page.evaluate(() => moscowMap.getStatus().geolocation.watching), false);
    assert((await page.locator('.bspm-location-status').textContent()).includes('Доступ'));
    assert.equal(await page.evaluate(() => geoClears.length), 1);
    console.log('PASS native browser denies permission, watch cleared, actionable message'); await context.close();
  }
  // Fault injection covers hardware errors and callbacks arriving after cancellation.
  {
    const context = await browser.newContext({reducedMotion: 'reduce'});
    await context.addInitScript(() => {
      window.geoCalls = []; window.geoClears = [];
      navigator.geolocation.watchPosition = (success, error, options) => { geoCalls.push({success, error, options}); return geoCalls.length - 1; };
      navigator.geolocation.clearWatch = id => geoClears.push(id);
      window.fix = (index, values = {}) => geoCalls[index].success({coords: {longitude: 37.6005, latitude: 55.7544, accuracy: 22, ...values}, timestamp: Date.now()});
    });
    const page = await context.newPage(); await ready(page);
    await page.locator('.bspm-locate').click();
    assert.equal(await page.evaluate(() => geoCalls.length), 1);
    await page.locator('.bspm-locate').click(); assert.equal(await page.evaluate(() => geoCalls.length), 1, 'Pending permission does not duplicate watch');
    await page.evaluate(() => geoCalls[0].error({code: 3}));
    assert.equal(await page.evaluate(() => moscowMap.getStatus().geolocation.state), 'error');
    await page.evaluate(() => fix(0)); await waitActive(page);
    await page.evaluate(() => geoCalls[0].error({code: 2})); assert.equal((await geometry(page)).length, 0);
    await page.locator('.bspm-locate').click();
    assert.equal(await page.evaluate(() => geoCalls.length), 2);
    assert.deepEqual(await page.evaluate(() => geoClears), [0], 'Watch ID zero must be cleared');
    await page.evaluate(() => fix(0)); assert.equal(await page.evaluate(() => moscowMap.getStatus().geolocation.state), 'requesting', 'Old callback ignored');
    await page.evaluate(() => fix(1)); await waitActive(page);
    // Expire a fresh fix using the browser fake clock; the map removes the stale point.
    await page.clock.install(); await page.evaluate(() => fix(1)); await page.clock.fastForward(45001);
    assert.equal(await page.evaluate(() => moscowMap.getStatus().geolocation.state), 'error'); assert.equal((await geometry(page)).length, 0);
    await page.evaluate(() => fix(1, {longitude: NaN})); assert.equal((await geometry(page)).length, 0);
    await page.evaluate(() => fix(1)); await waitActive(page);
    await page.locator('.bspm-location-status button').click(); await page.evaluate(() => fix(1));
    assert.equal(await page.evaluate(() => moscowMap.getStatus().geolocation.state), 'idle'); assert.equal((await geometry(page)).length, 0);
    await page.locator('.bspm-locate').click(); await page.evaluate(() => fix(2)); await waitActive(page);
    await page.evaluate(() => {
      const old = moscowMap;
      window.moscowMap = BespokoistvoMap.create(document.getElementById('map'));
      old.destroy(); fix(2);
    });
    assert.deepEqual(await page.evaluate(() => geoClears), [0, 1, 2]);
    assert.equal(await page.evaluate(() => moscowMap.getStatus().geolocation.state), 'idle');
    console.log('PASS injected timeout/unavailable; retry; late callbacks; watch ID zero; stale fix; invalid fix; recreated map cleanup');
    await context.close();
  }
  for (const mode of ['unsupported', 'blocked-frame', 'insecure']) {
    const context = await browser.newContext();
    await context.addInitScript(mode => {
      if (mode === 'unsupported') Object.defineProperty(navigator, 'geolocation', {value: undefined});
      if (mode === 'insecure') Object.defineProperty(window, 'isSecureContext', {value: false});
      if (mode === 'blocked-frame') Object.defineProperty(document, 'permissionsPolicy', {value: {allowsFeature: () => false}});
    }, mode);
    const page = await context.newPage(); await ready(page); await page.locator('.bspm-locate').click();
    assert.equal(await page.evaluate(() => moscowMap.getStatus().geolocation.watching), false);
    assert.notEqual(await page.evaluate(() => moscowMap.getStatus().geolocation.state), 'idle');
    assert.equal((await geometry(page)).length, 0);
    console.log('PASS', mode, 'clear message, no watch or fake point'); await context.close();
  }
  // Genuine cross-origin iframe delegation and server Permissions-Policy, with real map data.
  // A real loopback server preserves the browser's address-space classification.
  const parentServer = require('node:http').createServer((request, response) => {
    response.writeHead(200, {'Content-Type': 'text/html', 'Permissions-Policy': request.url === '/allow' ? `geolocation=(self "${origin}")` : 'geolocation=()'});
    response.end(`<iframe title="Карта" src="${origin}/map-demo.html" allow="geolocation" style="width:360px;height:560px;border:0"></iframe>`);
  });
  await new Promise(resolve => parentServer.listen(0, '127.0.0.1', resolve));
  const parentOrigin = `http://127.0.0.1:${parentServer.address().port}`;
  for (const allowed of [true, false]) {
    const context = await browser.newContext({permissions: ['geolocation'], geolocation: {longitude: 37.6002, latitude: 55.7544, accuracy: 15}, reducedMotion: 'reduce'});
    const page = await context.newPage();
    await page.goto(parentOrigin + (allowed ? '/allow' : '/deny'));
    const iframe = await (await page.locator('iframe').elementHandle()).contentFrame();
    await iframe.waitForFunction(() => window.moscowMap && moscowMap.getStatus().basemap === 'ready', null, {timeout: 30000});
    await iframe.locator('.bspm-locate').click();
    await iframe.waitForFunction(expected => moscowMap.getStatus().geolocation.state === expected, allowed ? 'active' : 'error');
    assert.equal(await iframe.evaluate(() => moscowMap.getStatus().geolocation.watching), allowed);
    console.log('PASS cross-origin iframe:', allowed ? 'allowed by iframe + server policy' : 'server policy blocks location with a clear message');
    await context.close();
  }
  await new Promise(resolve => parentServer.close(resolve));
  {
    const context = await browser.newContext({permissions: ['geolocation'], geolocation: {longitude: 37.6002, latitude: 55.7544, accuracy: 15}, reducedMotion: 'reduce'});
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let releaseStyle;
    const gate = new Promise(resolve => { releaseStyle = resolve; });
    await page.route('**/style.json', async route => { await gate; await route.continue(); });
    await page.goto(origin + '/map-demo.html');
    await page.locator('.bspm-locate').click();
    await page.waitForFunction(() => moscowMap.getStatus().geolocation.state === 'active');
    releaseStyle();
    await page.waitForFunction(() => moscowMap.getStatus().basemap === 'ready');
    await page.locator('.bspm-location-status button').click();
    assert.deepEqual(errors, []);
    console.log('PASS location requested before slow map style; fix appears after style loads, no exception');
    await context.close();
  }
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
