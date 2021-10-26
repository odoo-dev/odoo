/* @odoo-module */
/* global owl */

const sourceAtoms = new WeakMap();
const observerAtoms = new WeakMap();

const SOURCE = Symbol('source');
const OBSERVER = Symbol('observer');
const KEYS = Symbol('keys');

export function atom(source, observer) {
  if (isTrackable(source) && observerAtoms.has(observer)) {
    source = source[SOURCE] || source;
    const oldAtom = getObserverSourceAtom(observer, source);
    if (oldAtom) {
      return oldAtom;
    }
    registerSource(source);
    return createAtom(source, observer);
  }
  return source;
}

function createAtom(source, observer) {
  const keys = new Set();
  const newAtom = new Proxy(source, {
    set(target, key, value) {
      if (!(key in target)) {
        target[key] = value;
        notifySourceObservers(source);
        return true;
      }
      const current = target[key];
      if (current !== value) {
        target[key] = value;
        notifySourceKeyOBservers(source, key);
      }
      return true;
    },
    deleteProperty(target, key) {
      if (key in target) {
        delete target[key];
        notifySourceObservers(source);
        deleteKeyFromKeys(source, key);
      }
      return true;
    },
    get(target, key) {
      switch (key) {
        case OBSERVER:
          return observer;
        case SOURCE:
          return source;
        case KEYS:
          return keys;
        default:
          const value = target[key];
          keys.add(key);
          return atom(value, observer);
      }
    },
  });
  getObserverAtoms(observer).add(newAtom);
  getSourceAtoms(source).add(newAtom);
  return newAtom;
}

function deleteKeyFromKeys(source, key) {
  for (const atom of getSourceAtoms(source)) {
    atom[KEYS].delete(key);
  }
}

function getObserverAtoms(observer) {
  return observerAtoms.get(observer);
}

function getObserverSourceAtom(observer, source) {
  for (const atom of getObserverAtoms(observer)) {
    if (atom[SOURCE] === source) {
      return atom;
    }
  }
  return null;
}

function getSourceAtoms(source) {
  return sourceAtoms.get(source);
}

function isTrackable(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !(value instanceof Date) &&
    !(value instanceof Promise) && !(value instanceof Image) && !(value instanceof Map) && !(value instanceof Set)
  );
}

function notifySourceKeyOBservers(source, key) {
  for (const atom of getSourceAtoms(source)) {
    if (atom[KEYS].has(key)) {
      // atom[OBSERVER]();
      notify(atom[OBSERVER]);
    }
  }
}

function notifySourceObservers(source) {
  for (const atom of getSourceAtoms(source)) {
    // atom[OBSERVER]();
    notify(atom[OBSERVER]);
  }
}

function pseudoDelay() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let notifications;
async function notify(observer) {
  if (notifications) {
    notifications.add(observer);
    return;
  }
  notifications = new Set([observer]);
  await pseudoDelay();
  for (const observer of notifications) {
    observer();
  }
  notifications = null;
}

export function registerObserver(observer) {
  if (!observerAtoms.get(observer)) {
    observerAtoms.set(observer, new Set());
  }
  return unregisterObserver.bind(null, observer);
}

function registerSource(source) {
  if (!sourceAtoms.get(source)) {
    sourceAtoms.set(source, new Set());
  }
}

function unregisterObserver(observer) {
  for (const atom of getObserverAtoms(observer)) {
    const source = atom[SOURCE];
    const sourceAtoms = getSourceAtoms(source);
    sourceAtoms.delete(atom);
  }
  observerAtoms.delete(observer);
}

export function useState(state) {
  if (!isTrackable(state)) {
    throw new Error('Argument is not trackable');
  }
  const current = owl.Component.current;
  const observer = () => current.render();
  const unregisterObserver = registerObserver(observer);
  owl.hooks.onWillUnmount(() => unregisterObserver());
  return atom(state, observer);
}

export function useNoOp(obj) {
  if (!isTrackable(obj)) {
    throw new Error('Argument is not trackable');
  }
  const noOp = () => {};
  const unregisterObserver = registerObserver(noOp);
  owl.hooks.onWillUnmount(() => unregisterObserver());
  return atom(obj, noOp);
}
