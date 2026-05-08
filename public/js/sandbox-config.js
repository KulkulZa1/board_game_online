(function () {
  'use strict';

  function deepMerge(target, source) {
    if (!target || !source || typeof source !== 'object') return target;
    Object.keys(source).forEach(function (key) {
      var value = source[key];
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        target[key] &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        deepMerge(target[key], value);
      } else {
        target[key] = Array.isArray(value) ? value.slice() : value;
      }
    });
    return target;
  }

  function load(key, target) {
    try {
      var raw = window.localStorage && window.localStorage.getItem(key);
      if (!raw) return false;
      deepMerge(target, JSON.parse(raw));
      target.__loadedFromSandbox = true;
      return true;
    } catch (error) {
      console.warn('Sandbox config load failed:', key, error);
      return false;
    }
  }

  window.SandboxConfigBridge = {
    deepMerge: deepMerge,
    load: load
  };
})();
