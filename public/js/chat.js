// chat.js — Chat and emoticon handling
window.Chat = (function () {
  let myRole = null;
  let socket = null;

  const messagesEl   = document.getElementById('chat-messages');
  const inputEl      = document.getElementById('chat-input');
  const sendBtn      = document.getElementById('chat-send-btn');
  const chatPanel    = document.getElementById('chat-panel');
  const chatToggleBtn = document.getElementById('chat-toggle-btn');
  const chatCloseBtn  = document.getElementById('chat-close-btn');

  function init(options) {
    myRole = options.role;
    socket = options.socket;

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
  }

  function loadHistory(messages) {
    messagesEl.innerHTML = '';
    messages.forEach(addMessage);
  }

  return { init, addMessage, loadHistory };
})();
