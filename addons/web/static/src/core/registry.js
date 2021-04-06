/** @odoo-module **/

const { core } = owl;
const { EventBus } = core;

/**
 * Registry
 *
 * The Registry class is basically just a mapping from a string key to an object.
 * It is really not much more than an object. It is however useful for the
 * following reasons:
 *
 * 1. it let us react and execute code when someone add something to the registry
 *   (for example, the FunctionRegistry subclass this for this purpose)
 * 2. it throws an error when the get operation fails
 * 3. it provides a chained API to add items to the registry.
 */
export class Registry extends EventBus {
  content = {};
  elements = null;
  entries = null;

  constructor() {
    super();
    this.on("UPDATE", this, () => {
      this.elements = null;
      this.entries = null;
    });
  }

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
   * @returns {Registry}
   */
  add(key, value, { force, sequence } = {}) {
    if (!force && key in this.content) {
      throw new Error(`Cannot add '${key}' in this registry: it already exists`);
    }
    let previousSequence;
    if (force) {
      const elem = this.content[key];
      previousSequence = elem && elem[0];
    }
    sequence = sequence === undefined ? previousSequence || 50 : sequence;
    this.content[key] = [sequence, value];
    const payload = { operation: "add", key, value };
    this.trigger("UPDATE", payload);
    return this;
  }

  /**
   * Get an item from the registry
   *
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    if (!(key in this.content)) {
      throw new Error(`Cannot find ${key} in this registry!`);
    }
    return this.content[key][1];
  }

  /**
   * Check the presence of a key in the registry
   *
   * @param {string} key
   * @returns {boolean}
   */
  contains(key) {
    return key in this.content;
  }

  /**
   * Get a list of all elements in the registry. Note that it is ordered
   * according to the sequence numbers.
   *
   * @returns {any[]}
   */
  getAll() {
    if (!this.elements) {
      const content = Object.values(this.content).sort((el1, el2) => el1[0] - el2[0]);
      this.elements = content.map((elem) => elem[1]);
    }
    return this.elements;
  }

  /**
   * Return a list of all entries, ordered by sequence numbers.
   *
   * @returns {[string, any][]}
   */
  getEntries() {
    if (!this.entries) {
      const entries = Object.entries(this.content).sort((el1, el2) => el1[1][0] - el2[1][0]);
      this.entries = entries.map(([str, elem]) => [str, elem[1]]);
    }
    return this.entries;
  }

  /**
   * Remove an item from the registry
   *
   * @param {string} key
   */
  remove(key) {
    const value = this.content[key];
    delete this.content[key];
    const payload = { operation: "delete", key, value };
    this.trigger("UPDATE", payload);
  }
}
