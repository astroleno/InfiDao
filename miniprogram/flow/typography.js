const { family: FAMILY, supplementFamily: SUPPLEMENT } = require('../assets/fonts/manifest');
const FONT_DATA = require('../assets/fonts/serif-data');
const SUPPLEMENT_DATA = require('../assets/fonts/supplement-data');
const FACES = [{ family: FAMILY, data: FONT_DATA }, { family: SUPPLEMENT, data: SUPPLEMENT_DATA }];

// Page text uses font registration. Canvas reads the same font files directly;
// iPhone's native font matching cannot silently substitute a different typeface.
function createTypography() {
  const status = { webview: 'pending', canvas: 'font-file' };
  const registered = {};
  let pending;
  function prepare(api) {
    if (pending) return pending;
    pending = new Promise(resolve => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        if (status.webview === 'pending') status.webview = 'fallback';
        resolve({ ...status });
      };
      // A font failure must not leave the opening scene waiting indefinitely.
      const timeout = setTimeout(finish, 1800);
      try {
        if (!api || !api.loadFontFace) { finish(); return; }
        for (const face of FACES) {
          const done = loaded => {
            if (finished) return;
            registered[face.family] = loaded;
            if (Object.keys(registered).length === FACES.length) {
              status.webview = Object.values(registered).every(Boolean) ? 'loaded' : 'fallback';
              finish();
            }
          };
          try {
            api.loadFontFace({
              global: true, family: face.family, scopes: ['webview'],
              source: `url("data:font/woff;base64,${face.data}")`,
              desc: { style: 'normal', weight: '400' },
              success: () => done(true), fail: () => done(false),
            });
          } catch (_) { done(false); }
        }
      } catch (_) { finish(); }
    });
    return pending;
  }
  return { prepare, status: () => ({ ...status }) };
}

const typography = createTypography();
module.exports = { FAMILY, SUPPLEMENT, createTypography, typography };
