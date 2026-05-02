// admob.js — AdMob 광고 래퍼 (Capacitor 네이티브 앱에서만 동작, 웹에서는 무시됨)
window.AdMobHelper = (function () {
  // TODO: 프로덕션 시 자신의 AdMob 광고 단위 ID로 교체
  // Google 테스트 ID (개발·QA용, 앱 심사 전 반드시 실제 ID로 교체):
  const INTERSTITIAL_ID = 'ca-app-pub-3940256099942544/1033173712';

  let _initialized  = false;
  let _adReady      = false;

  // 페이지 로드 시 1회 호출 — Capacitor 네이티브 환경이 아니면 즉시 반환
  async function init() {
    if (!_isNative()) return;
    try {
      const { AdMob } = window.Capacitor.Plugins;
      if (!AdMob) return;
      await AdMob.initialize({ initializeForTesting: false });
      _initialized = true;
      _preload();
    } catch (e) { /* AdMob 플러그인 미설치 시 조용히 무시 */ }
  }

  async function _preload() {
    if (!_initialized) return;
    try {
      const { AdMob } = window.Capacitor.Plugins;
      await AdMob.prepareInterstitial({ adId: INTERSTITIAL_ID });
      _adReady = true;
    } catch (e) { _adReady = false; }
  }

  // 솔로 게임 종료 후 호출 — 광고가 준비된 경우에만 표시
  async function showAfterGame() {
    if (!_initialized || !_adReady) return;
    try {
      const { AdMob } = window.Capacitor.Plugins;
      _adReady = false;
      await AdMob.showInterstitial();
      // 다음 게임을 위해 미리 로드 (1초 딜레이로 광고 종료 후 로드)
      setTimeout(_preload, 1000);
    } catch (e) { _preload(); }
  }

  function _isNative() {
    return !!(
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()
    );
  }

  return { init, showAfterGame };
})();
