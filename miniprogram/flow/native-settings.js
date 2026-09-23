const KEY = 'infidao-native-preview-key-v1';
function previewAllowed(api) {
  try { return ['develop', 'trial'].includes(api.getAccountInfoSync().miniProgram.envVersion); }
  catch (_) { return false; }
}
function readPreviewKey(api) {
  if (!previewAllowed(api)) return '';
  try { const value = api.getStorageSync(KEY); return typeof value === 'string' ? value : ''; }
  catch (_) { return ''; }
}
function savePreviewKey(api, value) {
  if (!previewAllowed(api)) throw new Error('此连接方式仅用于开发预览。');
  const key = String(value || '').trim();
  if (key.length < 16 || key.length > 256 || /\s/.test(key)) throw new Error('请粘贴完整的 DS API Key。');
  api.setStorageSync(KEY, key);
}
function clearPreviewKey(api) { api.removeStorageSync(KEY); }
module.exports = { KEY, previewAllowed, readPreviewKey, savePreviewKey, clearPreviewKey };
