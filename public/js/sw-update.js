// Keeps PWA/service-worker controlled pages from staying on old game assets after deploys.
(function () {
  if (!('serviceWorker' in navigator)) return;

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
