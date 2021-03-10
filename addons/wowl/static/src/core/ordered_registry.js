/** @odoo-module **/

import { Registry } from "./registry";

export class OrderedRegistry extends Registry {
  /**
   * Add an entry (key, value) to the registry if key is not already used. If
   * the parameter force is set to true, an entry with same key (if any) is replaced.
   *
   * Note that this also returns the registry, so another add method call can
   * be chained
   *
   * @param {string} key
   * @param {any} value
   * @param {{force?: boolean, sequence?: number}} [options]
   * @returns {OrderedRegistry}
   */
  add(key, value, options = {}) {
    const sequence = options.sequence === undefined ? 50 : options.sequence;
    return super.add(key, [sequence, value], options);
  }

  get(key) {
    return super.get(key)[1];
  }

  getAll() {
    const orderedElems = super.getAll().sort((el1, el2) => el1[0] - el2[0]);
    return orderedElems.map((elem) => elem[1]);
  }

  getEntries() {
    const entries = super.getEntries();

    /** @type {any} */
    const result = entries.map(([str, elem]) => [str, elem[1]]);
    return result;
  }
}
