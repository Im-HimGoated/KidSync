const test = require('node:test');
const assert = require('node:assert/strict');
const { getPhoneAccess, shortSide } = require('../mobile/src/lib/phone-access');
const phone = { width: 390, height: 844 };
const tablet = { width: 768, height: 1024 };
const iphone = { platform: 'web', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  screen: phone, window: phone, maxTouchPoints: 5, pointerCoarse: true };
const android = { ...iphone, userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', userAgentMobile: true };

test('native iPhone and Android handsets qualify in either orientation', () => {
  for (const platform of ['ios', 'android']) {
    for (const screen of [phone, { width: 844, height: 390 }]) {
      assert.deepEqual(getPhoneAccess({ platform, isPad: false, screen }), {
        isPhone: true, isDevelopmentPreview: false, canAccess: true, reason: 'native-phone'
      });
    }
  }
});
test('native iPad, Android tablets and large screens cannot qualify through a narrow window', () => {
  for (const platform of ['ios', 'android']) {
    for (const metadata of [{ isPad: true }, { isTablet: true }, { interfaceIdiom: 'pad' }, { screen: tablet }]) {
      assert.equal(getPhoneAccess({ platform, isPad: false, window: phone, ...metadata }).canAccess, false);
    }
    assert.equal(getPhoneAccess({ platform, screen: { width: 600, height: 960 }, isPad: false }).canAccess, false);
  }
});
test('native window fallback works but iOS requires affirmative non-iPad metadata', () => {
  assert.equal(getPhoneAccess({ platform: 'android', window: phone }).isPhone, true);
  assert.equal(getPhoneAccess({ platform: 'ios', window: phone }).isPhone, false);
  assert.equal(getPhoneAccess({ platform: 'ios', interfaceIdiom: 'phone', window: phone }).isPhone, true);
  assert.equal(getPhoneAccess({ platform: 'ios', interfaceIdiom: 'tv', screen: phone, isPad: false }).isPhone, false);
});
test('web iPhone and Android phone require genuine-looking phone signals and survive rotation', () => {
  for (const input of [iphone, android]) {
    assert.equal(getPhoneAccess(input).isPhone, true);
    assert.equal(getPhoneAccess({ ...input, screen: { width: 844, height: 390 }, window: { width: 844, height: 390 } }).isPhone, true);
    for (const override of [{ pointerCoarse: false }, { maxTouchPoints: 0 }, { userAgentMobile: false }, { screen: undefined }]) {
      assert.equal(getPhoneAccess({ ...input, ...override }).canAccess, false);
    }
  }
});
test('web desktop resize, touchscreen laptops and tablets do not unlock phone flow', () => {
  for (const userAgent of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130',
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile/15E148',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1.15',
    'Mozilla/5.0 (Linux; Android 15; Tablet) Chrome/130 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 15; Tablet) Mobile Safari/537.36']) {
    assert.equal(getPhoneAccess({ ...iphone, userAgent }).canAccess, false, userAgent);
  }
  assert.equal(getPhoneAccess({ ...android, screen: tablet, window: phone }).canAccess, false);
  assert.equal(getPhoneAccess({ ...iphone, isTablet: true }).canAccess, false);
});
test('development phone preview is explicit, web-only and never actual phone eligibility', () => {
  const desktop = { platform: 'web', userAgent: 'Desktop', screen: { width: 1920, height: 1080 }, window: phone };
  assert.deepEqual(getPhoneAccess({ ...desktop, isDevelopment: true, developmentPreviewRequested: true }), {
    isPhone: false, isDevelopmentPreview: true, canAccess: true, reason: 'development-preview'
  });
  for (const flags of [{}, { isDevelopment: true }, { developmentPreviewRequested: true },
    { isDevelopment: false, developmentPreviewRequested: true }, { isDevelopment: 'true', developmentPreviewRequested: true }]) {
    assert.equal(getPhoneAccess({ ...desktop, ...flags }).canAccess, false);
  }
  assert.equal(getPhoneAccess({ ...desktop, isDevelopment: true, developmentPreviewRequested: true, window: tablet }).canAccess, false);
  assert.equal(getPhoneAccess({ platform: 'ios', screen: tablet, isDevelopment: true, developmentPreviewRequested: true }).canAccess, false);
  assert.equal(getPhoneAccess({ ...iphone, isDevelopment: true, developmentPreviewRequested: true }).isDevelopmentPreview, false);
});
test('missing, invalid and unsupported inputs fail closed without consulting globals', () => {
  for (const input of [undefined, null, {}, 'ios', { platform: 'windows', screen: phone },
    { platform: 'android' }, { platform: 'android', screen: { width: NaN, height: 800 } },
    { ...iphone, maxTouchPoints: Infinity }]) assert.equal(getPhoneAccess(input).canAccess, false);
  for (const input of [undefined, {}, { width: 0, height: 10 }, { width: '390', height: 844 }, { width: Infinity, height: 800 }]) {
    assert.equal(shortSide(input), null);
  }
  assert.equal(shortSide({ width: 844, height: 390 }), 390);
});
