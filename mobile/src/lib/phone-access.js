// UI eligibility only, not an authorization boundary: browser signals can be spoofed.
const PHONE_SHORT_SIDE_LIMIT = 600;

function shortSide(size) {
  if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height)
    || size.width <= 0 || size.height <= 0) return null;
  return Math.min(size.width, size.height);
}

/**
 * Pure device classification; does not read browser/RN globals.
 * Input: platform ('ios'|'android'|'web'), screen/window in logical pixels,
 * isPad/isTablet booleans, interfaceIdiom ('phone'|'pad'|'tv'...),
 * userAgent, maxTouchPoints, pointerCoarse, userAgentMobile (optional UA hint),
 * isDevelopment and developmentPreviewRequested (explicit booleans).
 *
 * Output: { isPhone, isDevelopmentPreview, canAccess, reason }.
 * canAccess = isPhone || isDevelopmentPreview. Preview never makes isPhone true.
 * Native screen is preferred over window (split-screen); window is a fallback.
 * Web requires screen dimensions, mobile UA, touch and coarse-pointer evidence;
 * a resized viewport alone is never sufficient. <600 logical pixels is the
 * conservative handset cutoff, not a guarantee: unusually wide/folded phones
 * can be excluded. Missing/ambiguous signals fail closed. Call again on resize.
 * Preview opt-in must come from a development build AND an explicit request;
 * do not derive either flag merely from viewport size or a production URL.
 */
function getPhoneAccess(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  const { platform } = value;
  const screenSide = shortSide(value.screen);
  const windowSide = shortSide(value.window);
  const side = screenSide ?? windowSide;
  const small = side !== null && side < PHONE_SHORT_SIDE_LIMIT;
  let isPhone = false;
  let reason = 'unsupported-platform';

  if (platform === 'ios' || platform === 'android') {
    if (value.isPad === true || value.isTablet === true || value.interfaceIdiom === 'pad') reason = 'tablet';
    else if (value.interfaceIdiom && value.interfaceIdiom !== 'phone') reason = 'unsupported-device';
    else if (side === null) reason = 'missing-dimensions';
    else if (!small) reason = 'large-screen';
    else if (platform === 'ios' && value.isPad !== false && value.interfaceIdiom !== 'phone') reason = 'unknown-ios-device';
    else { isPhone = true; reason = 'native-phone'; }
  } else if (platform === 'web') {
    const ua = typeof value.userAgent === 'string' ? value.userAgent : '';
    const tablet = /iPad|Tablet|PlayBook|Silk\//i.test(ua)
      || (/Macintosh/i.test(ua) && value.maxTouchPoints > 1)
      || (/Android/i.test(ua) && !/Mobile/i.test(ua));
    const phoneUA = /iPhone/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua));
    if (tablet || value.isTablet === true || value.isPad === true) reason = 'tablet';
    else if (!phoneUA || value.userAgentMobile === false) reason = 'not-mobile-browser';
    else if (!Number.isFinite(value.maxTouchPoints) || value.maxTouchPoints < 1 || value.pointerCoarse !== true) reason = 'missing-phone-capabilities';
    else if (screenSide === null) reason = 'missing-screen-dimensions';
    else if (screenSide >= PHONE_SHORT_SIDE_LIMIT) reason = 'large-screen';
    else { isPhone = true; reason = 'web-phone'; }
  }

  const isDevelopmentPreview = !isPhone && platform === 'web'
    && value.isDevelopment === true && value.developmentPreviewRequested === true
    && windowSide !== null && windowSide < PHONE_SHORT_SIDE_LIMIT;
  return { isPhone, isDevelopmentPreview, canAccess: isPhone || isDevelopmentPreview,
    reason: isDevelopmentPreview ? 'development-preview' : reason };
}

module.exports = { PHONE_SHORT_SIDE_LIMIT, shortSide, getPhoneAccess };
