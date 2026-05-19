// chat.js — Chat and emoticon handling
window.Chat = (function () {
  const BUBBLE_VISIBLE_MS = 4000;
  const BUBBLE_MAX_LENGTH = 64;

  let myRole = null;
  let socket = null;
  let initialized = false;
  const bubbleTimers = {};

  const messagesEl   = document.getElementById('chat-messages');
  const inputEl      = document.getElementById('chat-input');
  const sendBtn      = document.getElementById('chat-send-btn');
  const chatPanel    = document.getElementById('chat-panel');
  const chatToggleBtn = document.getElementById('chat-toggle-btn');
  const chatCloseBtn  = document.getElementById('chat-close-btn');

  function init(options) {
    myRole = options.role;
    socket = options.socket;

    if (initialized) return;
    initialized = true;

    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Emote buttons
    document.querySelectorAll('.emote-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        socket.emit('chat:send', { text: btn.dataset.emote });
      });
    });

    // Mobile toggle
    chatToggleBtn.addEventListener('click', () => {
      chatPanel.classList.toggle('open');
    });

    chatCloseBtn.addEventListener('click', () => {
      chatPanel.classList.remove('open');
    });
  }

  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;
    socket.emit('chat:send', { text });
    inputEl.value = '';
  }

  function getBubbleAnchor(role) {
    if (role !== 'host' && role !== 'guest') return null;

    if (myRole === 'spectator') {
      return document.getElementById(role === 'host' ? 'my-bar' : 'opponent-bar');
    }

    return document.getElementById(role === myRole ? 'my-bar' : 'opponent-bar');
  }

  function getBubbleText(text) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= BUBBLE_MAX_LENGTH) return normalized;
    return normalized.slice(0, BUBBLE_MAX_LENGTH - 3).trimEnd() + '...';
  }

  function showBubble(msg) {
    const anchor = getBubbleAnchor(msg.role);
    const text = getBubbleText(msg.text);
    if (!anchor || !text) return;

    let bubble = anchor.querySelector('.chat-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      anchor.appendChild(bubble);
    }

    bubble.className = 'chat-bubble';
    bubble.textContent = text;

    const key = anchor.id || msg.role;
    if (bubbleTimers[key]) clearTimeout(bubbleTimers[key]);
    bubbleTimers[key] = setTimeout(() => {
      if (bubble.parentNode) bubble.remove();
      delete bubbleTimers[key];
    }, BUBBLE_VISIBLE_MS);
  }

  function addMessage(msg, options) {
    const opts = options || {};
    const isSpectator = msg.role === 'spectator';
    const isMine = msg.role === myRole && !isSpectator;

    const div = document.createElement('div');
    const isSingleEmoji = /^\p{Emoji}$/u.test(msg.text.trim()) && msg.text.trim().length <= 4;

    div.className = [
      'chat-msg',
      isMine ? 'mine' : 'theirs',
      isSingleEmoji ? 'big-emote' : '',
      isSpectator ? 'spectator-msg' : ''
    ].filter(Boolean).join(' ');

    if (isSpectator && msg.nickname) {
      const nick = document.createElement('div');
      nick.className = 'spectator-nick';
      nick.textContent = '👁 ' + msg.nickname;
      div.appendChild(nick);
    }

    const textEl = document.createElement('div');
    textEl.textContent = msg.text;
    div.appendChild(textEl);

    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    if (opts.showBubble !== false) showBubble(msg);
    if (!isMine && typeof Sound !== 'undefined') Sound.play('chat');
  }

  function loadHistory(messages) {
    messagesEl.innerHTML = '';
    messages.forEach(msg => addMessage(msg, { showBubble: false }));
  }

  return { init, addMessage, loadHistory };
})();
