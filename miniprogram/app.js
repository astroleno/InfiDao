const { typography } = require('./flow/typography');

App({
  onLaunch() { this.fontReady = typography.prepare(wx); },
});
