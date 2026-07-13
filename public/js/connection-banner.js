(function () {
  const PEER_OFFLINE_MESSAGE = '상대방 연결이 끊겼습니다. 재접속 대기 중...';

  function create({ banner, message, root = document.body }) {
    if (!banner || !message) throw new Error('Connection banner elements are required');

    function show(text) {
      message.textContent = text;
      banner.style.display = 'flex';
      if (root) root.classList.add('has-disconnect-banner');
    }

    function hide() {
      banner.style.display = 'none';
      if (root) root.classList.remove('has-disconnect-banner');
    }

    return {
      show,
      hide,
      showPeerOffline: () => show(PEER_OFFLINE_MESSAGE),
    };
  }

  window.ConnectionBanner = { create, PEER_OFFLINE_MESSAGE };
})();
