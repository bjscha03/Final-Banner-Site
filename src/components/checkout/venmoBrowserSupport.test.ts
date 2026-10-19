import { describe, expect, it } from 'vitest';
import { supportsVenmoBrowser } from './venmoBrowserSupport';

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36';

describe('Venmo mobile app-switch availability', () => {
  it.each([
    ['iPhone Safari', `${iphone} Version/18.0 Mobile/15E148 Safari/604.1`, 5, true],
    ['iPhone Chrome', `${iphone} CriOS/140.0 Mobile/15E148 Safari/604.1`, 5, false],
    ['iPhone Firefox', `${iphone} FxiOS/140.0 Mobile/15E148 Safari/605.1.15`, 5, false],
    ['iPhone in-app browser', `${iphone} Version/18.0 Mobile/15E148 Safari/604.1 Instagram`, 5, false],
    ['iPad desktop-mode Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 5, true],
    ['iPad desktop-mode Chrome', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 CriOS/140.0 Safari/605.1.15', 5, false],
    ['Android Chrome', `${android} Chrome/140.0.0.0 Mobile Safari/537.36`, 5, true],
    ['Android Samsung Internet', `${android} SamsungBrowser/28.0 Chrome/140.0.0.0 Mobile Safari/537.36`, 5, false],
    ['Android Edge', `${android} Chrome/140.0.0.0 Mobile Safari/537.36 EdgA/140.0`, 5, false],
    ['Android webview', 'Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 Version/4.0 Chrome/140.0 Mobile Safari/537.36', 5, false],
    ['desktop Chrome', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36', 0, true],
    ['desktop Firefox', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0', 0, true],
  ])('%s', (_name, userAgent, maxTouchPoints, expected) => {
    expect(supportsVenmoBrowser({ userAgent: String(userAgent), maxTouchPoints: Number(maxTouchPoints) })).toBe(expected);
  });
});
