// chat.js — Chat and emoticon handling
window.Chat = (function () {
  let myRole = null;
  let socket = null;
  let initialized = false;
  const bubbleTimers = {};
  const BUBBLE_MS = 4000;
  const BUBBLE_MAX = 64;

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

    if (socket && typeof socket.on === 'function') {
      socket.on('chat:ratelimit', ({ message } = {}) => {
        addSystemMessage(message || 'Chat is temporarily rate limited.');
      });
    }
  }

  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;
    socket.emit('chat:send', { text });
    inputEl.value = '';
  }

  function addMessage(msg) {
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

    if (!isMine && typeof Sound !== 'undefined') Sound.play('chat');
    if (!msg.fromHistory) showBubble(msg);
  }

  function loadHistory(messages) {
    messagesEl.innerHTML = '';
    clearBubbles();
    messages.forEach(msg => addMessage(Object.assign({}, msg, { fromHistory: true })));
  }

  function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-msg system';
    div.textContent = String(text || '').trim().slice(0, 120);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function bubbleText(text) {
    const clean = String(text || '').trim().replace(/\s+/g, ' ');
    return clean.length > BUBBLE_MAX ? clean.slice(0, BUBBLE_MAX - 3) + '...' : clean;
  }

  function getBubbleAnchor(role) {
    if (role !== 'host' && role !== 'guest') return null;
    if (myRole === 'spectator') {
      return document.getElementById(role === 'host' ? 'opponent-bar' : 'my-bar');
    }
    if (role === myRole) return document.getElementById('my-bar');
    return document.getElementById('opponent-bar');
  }

  function showBubble(msg) {
    const anchor = getBubbleAnchor(msg.role);
    const text = bubbleText(msg.text);
    if (!anchor || !text) return;

    const role = msg.role;
    let bubble = anchor.querySelector('.chat-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      anchor.appendChild(bubble);
    }
    bubble.textContent = text;

    if (bubbleTimers[role]) clearTimeout(bubbleTimers[role]);
    bubbleTimers[role] = setTimeout(() => {
      bubble.remove();
      delete bubbleTimers[role];
    }, BUBBLE_MS);
  }

  function clearBubbles() {
    Object.keys(bubbleTimers).forEach(role => {
      clearTimeout(bubbleTimers[role]);
      delete bubbleTimers[role];
    });
    ['my-bar', 'opponent-bar'].forEach(id => {
      const el = document.getElementById(id);
      const bubble = el && el.querySelector('.chat-bubble');
      if (bubble) bubble.remove();
    });
  }

  return { init, addMessage, loadHistory };
})();
