/** @odoo-module **/

/**
 * KeepLast is a concurrency primitive that manages a list of tasks, and only
 * keep the last task active.
 */
export class KeepLast {
  id = 0;

  /**
   * Register a new task
   *
   * @template T
   * @param {Promise<T>} promise
   * @returns {Promise<T>}
   */
  add(promise) {
    this.id++;
    const currentId = this.id;
    return new Promise((resolve, reject) => {
      promise
        .then((value) => {
          if (this.id === currentId) {
            resolve(value);
          }
        })
        .catch((reason) => {
          // not sure about this part
          if (this.id === currentId) {
            reject(reason);
          }
        });
    });
  }
}

/**
 * A (Odoo) mutex is a primitive for serializing computations.  This is
 * useful to avoid a situation where two computations modify some shared
 * state and cause some corrupted state.
 *
 * Imagine that we have a function to fetch some data _load(), which returns
 * a promise which resolves to something useful. Now, we have some code
 * looking like this::
 *
 *      return this._load().then(function (result) {
 *          this.state = result;
 *      });
 *
 * If this code is run twice, but the second execution ends before the
 * first, then the final state will be the result of the first call to
 * _load.  However, if we have a mutex::
 *
 *      this.mutex = new Mutex();
 *
 * and if we wrap the calls to _load in a mutex::
 *
 *      return this.mutex.exec(function() {
 *          return this._load().then(function (result) {
 *              this.state = result;
 *          });
 *      });
 *
 * Then, it is guaranteed that the final state will be the result of the
 * second execution.
 *
 * A Mutex has to be a class, and not a function, because we have to keep
 * track of some internal state.
 */
export class Mutex {
  constructor() {
    this.lock = Promise.resolve();
    this.queueSize = 0;
    this.unlockedProm = undefined;
    this._unlock = undefined;
  }
  /**
   * Add a computation to the queue, it will be executed as soon as the
   * previous computations are completed.
   *
   * @param {function} action a function which may return a Promise
   * @returns {Promise}
   */
  exec(action) {
    var self = this;
    var currentLock = this.lock;
    var result;
    this.queueSize++;
    this.unlockedProm =
      this.unlockedProm ||
      new Promise(function (resolve) {
        self._unlock = resolve;
      });
    this.lock = new Promise(function (unlockCurrent) {
      currentLock.then(function () {
        result = action();
        var always = function (returnedResult) {
          unlockCurrent();
          self.queueSize--;
          if (self.queueSize === 0) {
            self.unlockedProm = undefined;
            self._unlock();
          }
          return returnedResult;
        };
        Promise.resolve(result).then(always).guardedCatch(always);
      });
    });
    return this.lock.then(function () {
      return result;
    });
  }
  /**
   * @returns {Promise} resolved as soon as the Mutex is unlocked
   *   (directly if it is currently idle)
   */
  getUnlockedDef() {
    return this.unlockedProm || Promise.resolve();
  }
}
