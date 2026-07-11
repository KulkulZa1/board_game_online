(function (root) {
  'use strict';

  const SAVE_VERSION = 2;

  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function serializeDeposit(deposit) {
    if (!deposit || typeof deposit.resource !== 'string') return null;
    const max = Math.max(1, finite(deposit.max, finite(deposit.amount, 1)));
    const amount = Math.max(0, Math.min(max, finite(deposit.amount, max)));
    return { resource: deposit.resource, amount, max };
  }

  function restoreDeposit(raw, isKnownResource, legacyAmount) {
    const fallback = Math.max(1, finite(legacyAmount, 600));
    const source = typeof raw === 'string' ? { resource: raw, amount: fallback, max: fallback } : raw;
    if (!source || typeof source !== 'object' || !isKnownResource(source.resource)) return null;
    const max = Math.max(1, finite(source.max, finite(source.amount, fallback)));
    const amount = Math.max(0, Math.min(max, finite(source.amount, max)));
    return amount > 0 ? { resource: source.resource, amount, max } : null;
  }

  function supportsSave(data) {
    return Boolean(data && (data.version === 1 || data.version === SAVE_VERSION) &&
      Array.isArray(data.deposits) && Array.isArray(data.buildings));
  }

  const api = { SAVE_VERSION, serializeDeposit, restoreDeposit, supportsSave };
  if (root) root.FactoryState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
