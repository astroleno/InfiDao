const { family: FAMILY, supplementFamily: SUPPLEMENT, supplementCharacters } = require('../assets/fonts/manifest');
const FALLBACK = '"Songti SC", "STSong", "Noto Serif CJK SC", "Noto Serif SC", "Source Han Serif SC", "SimSun", serif';
const FONT_DATA = require('../assets/fonts/serif-data');
const SUPPLEMENT_DATA = require('../assets/fonts/supplement-data');
const FACES = [{ family: FAMILY, data: FONT_DATA }, { family: SUPPLEMENT, data: SUPPLEMENT_DATA }];

// Keep the page and native atlas registrations independent: one scope failing
// must not discard the other. No network request or device-installed font needed.
function createTypography() {
  const status = { webview: 'pending', native: 'pending' };
  const registered = { webview: {}, native: {} };
  let pending;
  function prepare(api) {
    if (pending) return pending;
    pending = new Promise(resolve => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        for (const scope of ['webview', 'native']) {
          if (status[scope] === 'pending') status[scope] = 'fallback';
        }
        resolve({ ...status });
      };
      // A font failure must not leave the opening scene waiting indefinitely.
      const timeout = setTimeout(finish, 1800);
      try {
        if (!api || !api.loadFontFace) { finish(); return; }
        for (const scope of ['webview', 'native']) {
          for (const face of FACES) {
            const done = loaded => {
              if (finished) return;
              registered[scope][face.family] = loaded;
              if (Object.keys(registered[scope]).length === FACES.length) {
                status[scope] = Object.values(registered[scope]).every(Boolean) ? 'loaded' : 'fallback';
              }
              if (Object.values(status).every(value => value !== 'pending')) finish();
            };
            try {
              api.loadFontFace({
                global: true, family: face.family, scopes: [scope],
                source: `url("data:font/woff;base64,${face.data}")`,
                desc: { style: 'normal', weight: '400' },
                success: () => done(true), fail: () => done(false),
              });
            } catch (_) { done(false); }
          }
        }
      } catch (_) { finish(); }
    });
    return pending;
  }
  return { prepare, status: () => ({ ...status }), canvasFamily: char => {
    const family = char && supplementCharacters.includes(char) ? SUPPLEMENT : FAMILY;
    return registered.native[family] ? family : FALLBACK;
  } };
}

const typography = createTypography();
module.exports = { FAMILY, SUPPLEMENT, FALLBACK, createTypography, typography };
