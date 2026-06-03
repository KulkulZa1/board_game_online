// admob.js — AdMob 광고 래퍼 (Capacitor 네이티브 앱에서만 동작, 웹에서는 무시됨)
window.AdMobHelper = (function () {
  // TODO: 프로덕션 시 자신의 AdMob 광고 단위 ID로 교체
  // Google 테스트 ID (개발·QA용, 앱 심사 전 반드시 실제 ID로 교체):
  const INTERSTITIAL_ID = 'ca-app-pub-3940256099942544/1033173712';
  const REWARDED_ID     = 'ca-app-pub-3940256099942544/5224354917';
  const PRODUCT_IDS = {
    adRemoval: 'board_game_online.remove_ads',
    premiumCharacterPrefix: 'board_game_online.character.'
  };

  let _initialized  = false;
  let _adReady      = false;
  let _adsRemoved   = false;

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
    if (_adsRemoved || !_initialized || !_adReady) return;
    try {
      const { AdMob } = window.Capacitor.Plugins;
      _adReady = false;
      await AdMob.showInterstitial();
      // 다음 게임을 위해 미리 로드 (1초 딜레이로 광고 종료 후 로드)
      setTimeout(_preload, 1000);
    } catch (e) { _preload(); }
  }

  async function showRewardedRevive() {
    if (!_isNative()) return false;
    try {
      const { AdMob } = window.Capacitor.Plugins;
      if (!AdMob || typeof AdMob.prepareRewardVideoAd !== 'function' || typeof AdMob.showRewardVideoAd !== 'function') return false;
      await AdMob.prepareRewardVideoAd({ adId: REWARDED_ID });
      await AdMob.showRewardVideoAd();
      return true;
    } catch (e) {
      return false;
    }
  }

  async function showRewardedStartBoost() {
    return showRewardedRevive();
  }

  function setAdsRemoved(removed) {
    _adsRemoved = !!removed;
  }

  function hasAdsRemoved() {
    return _adsRemoved;
  }

  function canUseNativePurchases() {
    return _isNative() && !!_purchasePlugin();
  }

  async function purchaseAdRemoval() {
    const result = await _purchaseProduct(PRODUCT_IDS.adRemoval);
    if (result.ok) setAdsRemoved(true);
    return result;
  }

  async function restorePurchases() {
    const plugin = _purchasePlugin();
    if (!_isNative() || !plugin) return { ok: false, reason: 'native-purchase-plugin-unavailable' };
    try {
      if (typeof plugin.restorePurchases === 'function') {
        const restored = await plugin.restorePurchases();
        return { ok: !!_containsProduct(restored, PRODUCT_IDS.adRemoval), raw: restored };
      }
      if (typeof plugin.getPurchases === 'function') {
        const purchases = await plugin.getPurchases();
        return { ok: !!_containsProduct(purchases, PRODUCT_IDS.adRemoval), raw: purchases };
      }
      return { ok: false, reason: 'restore-api-unavailable' };
    } catch (e) {
      return { ok: false, reason: 'restore-failed' };
    }
  }

  async function purchasePremiumCharacter(characterId) {
    const safeId = String(characterId || '').replace(/[^a-z0-9_-]/gi, '');
    if (!safeId) return { ok: false, reason: 'invalid-character-id' };
    return _purchaseProduct(PRODUCT_IDS.premiumCharacterPrefix + safeId);
  }

  async function _purchaseProduct(productId) {
    const plugin = _purchasePlugin();
    if (!_isNative() || !plugin) return { ok: false, reason: 'native-purchase-plugin-unavailable', productId };
    try {
      let result = null;
      if (typeof plugin.purchaseProduct === 'function') {
        result = await plugin.purchaseProduct({ productId });
      } else if (typeof plugin.purchase === 'function') {
        result = await plugin.purchase({ productId });
      } else if (typeof plugin.buy === 'function') {
        result = await plugin.buy({ productId });
      } else {
        return { ok: false, reason: 'purchase-api-unavailable', productId };
      }
      return { ok: _purchaseSucceeded(result), productId, raw: result };
    } catch (e) {
      return { ok: false, reason: 'purchase-failed', productId };
    }
  }

  function _purchasePlugin() {
    const plugins = window.Capacitor && window.Capacitor.Plugins;
    if (!plugins) return null;
    return plugins.InAppPurchase || plugins.CapacitorPurchases || plugins.Purchases || null;
  }

  function _purchaseSucceeded(result) {
    if (!result) return false;
    if (result.ok === true || result.success === true || result.purchased === true) return true;
    if (typeof result.transactionId === 'string' || typeof result.orderId === 'string') return true;
    return false;
  }

  function _containsProduct(result, productId) {
    const text = JSON.stringify(result || {});
    return text.includes(productId);
  }

  function _isNative() {
    return !!(
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()
    );
  }

  return {
    init,
    showAfterGame,
    showRewardedRevive,
    showRewardedStartBoost,
    setAdsRemoved,
    hasAdsRemoved,
    canUseNativePurchases,
    purchaseAdRemoval,
    restorePurchases,
    purchasePremiumCharacter
  };
})();
