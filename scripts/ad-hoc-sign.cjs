// electron-builder afterPack hook: ad-hoc sign the macOS app.
//
// We ship unsigned (no Apple Developer account), but arm64 macOS refuses to launch
// a binary with NO signature at all ("'Git Menu' is damaged and can't be opened").
// An ad-hoc signature (`codesign --sign -`) makes it launchable; Gatekeeper then
// shows the normal "unidentified developer" prompt, which right-click -> Open clears.
const { execSync } = require('child_process');
const path = require('path');

exports.default = async function adHocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );
  console.log(`[afterPack] ad-hoc signing ${appPath}`);
  execSync(`codesign --force --deep --sign - ${JSON.stringify(appPath)}`, { stdio: 'inherit' });
};
