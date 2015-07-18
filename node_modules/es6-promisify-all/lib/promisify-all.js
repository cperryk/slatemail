'use strict';

var promisify = require('es6-promisify');

module.exports = promisifyAll;

var MAGIC_KEY = '__isPromisified__';
var IGNORED_PROPS = /^(?:length|name|arguments|caller|callee|prototype|__isPromisified__)$/;

function promisifyAll(target) {
  Object.getOwnPropertyNames(target).forEach(function (key) {
    if (IGNORED_PROPS.test(key)) {
      return;
    }
    if (typeof target[key] !== 'function') {
      return;
    }
    if (isPromisified(target[key])) {
      return;
    }

    var promisifiedKey = key + 'Async';

    target[promisifiedKey] = promisify(target[key]);

    [key, promisifiedKey].forEach(function (key) {
      Object.defineProperty(target[key], MAGIC_KEY, {
        value: true,
        configurable: true,
        enumerable: false,
        writable: true
      });
    });
  });

  return target;
}

function isPromisified(fn) {
  try {
    return fn[MAGIC_KEY] === true;
  } catch (e) {
    return false;
  }
}
