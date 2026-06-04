(function () {
  'use strict';

  const BADGE_ID = 'build-version-badge';
  const MAX_FIELD_LENGTH = 32;
  const COPY_FEEDBACK_MS = 1600;

  function clampText(value, maxLength) {
    const text = String(value || '').trim();
    if (text.length <= maxLength) return text;
    return text.slice(0, Math.max(0, maxLength - 3)) + '...';
  }

  function ensureStyles() {
    if (document.getElementById('build-version-badge-style')) return;

    const style = document.createElement('style');
    style.id = 'build-version-badge-style';
    style.textContent = [
      '#build-version-badge{',
      'position:fixed;',
      'left:10px;',
      'bottom:10px;',
      'z-index:1200;',
      'max-width:min(280px,calc(100vw - 20px));',
      'padding:6px 9px;',
      'border:1px solid rgba(148,163,184,.42);',
      'border-radius:8px;',
      'background:rgba(15,23,42,.82);',
      'color:#e5e7eb;',
      'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
      'box-shadow:0 8px 24px rgba(15,23,42,.18);',
      'backdrop-filter:blur(8px);',
      'white-space:nowrap;',
      'overflow:hidden;',
      'text-overflow:ellipsis;',
      'user-select:text;',
      '}',
      '#build-version-badge button{',
      'all:unset;',
      'cursor:pointer;',
      'display:block;',
      'max-width:100%;',
      'overflow:hidden;',
      'text-overflow:ellipsis;',
      '}',
      '@media (max-width:640px){',
      '#build-version-badge{left:8px;bottom:8px;font-size:10px;padding:5px 8px;}',
      '}',
    ].join('');
    document.head.appendChild(style);
  }

  function createBadge() {
    ensureStyles();

    let badge = document.getElementById(BADGE_ID);
    if (badge) return badge;

    badge = document.createElement('aside');
    badge.id = BADGE_ID;
    badge.setAttribute('aria-live', 'polite');
    badge.setAttribute('aria-label', 'Build version');

    const button = document.createElement('button');
    button.type = 'button';
    button.title = 'Copy build version diagnostics';
    badge.appendChild(button);

    document.body.appendChild(badge);
    return badge;
  }

  function formatVersion(version) {
    const branch = clampText(version.branch || 'unknown', MAX_FIELD_LENGTH);
    const commit = clampText(version.commit || 'unknown', MAX_FIELD_LENGTH);
    const shortCommit = commit === 'local' ? 'local' : commit.slice(0, 7);
    const startTime = Number(version.startTime);
    const started = Number.isFinite(startTime) ? new Date(startTime).toISOString() : 'unknown';

    return {
      branch,
      commit,
      shortCommit,
      label: `${branch} ${shortCommit}`,
      details: `branch=${branch} commit=${commit} started=${started}`,
    };
  }

  function renderBadge(version) {
    const badge = createBadge();
    const button = badge.querySelector('button');
    const formatted = formatVersion(version);

    button.textContent = formatted.label;
    button.title = `Copy build diagnostics: ${formatted.details}`;
    badge.dataset.diagnostics = formatted.details;

    button.onclick = async () => {
      const original = button.textContent;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(badge.dataset.diagnostics || formatted.details);
          button.textContent = 'copied build info';
          window.setTimeout(() => {
            button.textContent = original;
          }, COPY_FEEDBACK_MS);
        }
      } catch (_) {
        button.textContent = original;
      }
    };
  }

  async function initVersionBadge() {
    if (!document.body) return;

    try {
      const response = await fetch('/api/version', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      renderBadge(await response.json());
    } catch (_) {
      renderBadge({ branch: 'version', commit: 'unavailable', startTime: null });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVersionBadge, { once: true });
  } else {
    initVersionBadge();
  }
})();
