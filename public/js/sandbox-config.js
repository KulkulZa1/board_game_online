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
      var saved = read(key);
      if (!saved || !target) return false;
      deepMerge(target, saved);
      target.__loadedFromSandbox = true;
      return true;
    } catch (error) {
      console.warn('Sandbox config load failed:', key, error);
      return false;
    }
  }

  function read(key) {
    try {
      var raw = window.localStorage && window.localStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      parsed.__loadedFromSandbox = true;
      return parsed;
    } catch (error) {
      console.warn('Sandbox config read failed:', key, error);
      return null;
    }
  }

  window.SandboxConfigBridge = {
    deepMerge: deepMerge,
    load: load,
    read: read
  };
})();
