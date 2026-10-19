// PayPal's Venmo SDK app-switch flow supports iOS Safari and Android Chrome.
// Keep the SDK in charge of final funding eligibility; this prevents our custom
// selector from advertising Venmo in mobile browsers that cannot app-switch.
export function supportsVenmoBrowser(browser?: Pick<Navigator, 'userAgent' | 'maxTouchPoints'>): boolean {
  const device = browser ?? (typeof navigator === 'undefined' ? undefined : navigator);
  if (!device) return false;
  const ua = device.userAgent;
  const ios = /iPad|iPhone|iPod/i.test(ua)
    || (/Macintosh/i.test(ua) && device.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const embedded = /FBAN|FBAV|Instagram|GSA\/|Line\/|; wv\)/i.test(ua);
  if (embedded) return false;
  if (ios) {
    return /Version\/\d.*Safari\//i.test(ua)
      && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
  }
  if (android) {
    return /Chrome\//i.test(ua)
      && !/EdgA|OPR\/|SamsungBrowser|Firefox|DuckDuckGo/i.test(ua);
  }
  return !/Mobile|Windows Phone|BlackBerry|Silk\//i.test(ua);
}
