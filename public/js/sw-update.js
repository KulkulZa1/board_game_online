// Keeps PWA/service-worker controlled pages from staying on old game assets after deploys.
(function () {
  // `'serviceWorker' in navigator` is true even where the API is unusable: on an insecure
  // origin (plain http on a LAN IP, which is exactly how this repo is dev-tested) Chrome
  // keeps the prototype key but leaves the property undefined. Check the value, not the key,
  // or every page load on http://192.168.x.x throws before the rest of this file runs.
  if (!navigator.serviceWorker) return;

  var SW_SCRIPT_URL = '/sw.js?v=20260713a';
  var hadController = Boolean(navigator.serviceWorker.controller);
  var refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register(SW_SCRIPT_URL, { updateViaCache: 'none' })
      .then(function (registration) {
        if (registration && typeof registration.update === 'function') {
          registration.update().catch(function () {});
        }
      })
      .catch(function () {});
  });
})();
