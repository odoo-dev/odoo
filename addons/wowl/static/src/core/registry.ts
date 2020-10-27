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

export class Registry<T> {
  content: { [key: string]: T } = {};

  /**
   * Add an entry (key, value) to the registry if key is not already used. If
   * the parameter force is set to true, an entry with same key (if any) is replaced.
   *
   * Note that this also returns the registry, so another add method call can
   * be chained
   */
  add(key: string, value: T, force: boolean = false): Registry<T> {
    if (!force && key in this.content) {
      throw new Error(`Cannot add '${key}' in this registry: it already exists`);
    }
    this.content[key] = value;
    return this;
  }

  /**
   * Get an item from the registry
   */
  get(key: string): T {
    if (!(key in this.content)) {
      throw new Error(`Cannot find ${key} in this registry!`);
    }
    return this.content[key];
  }

  /**
   * Check the presence of a key in the registry
   */
  contains(key: string): boolean {
    return key in this.content;
  }

  /**
   * Get a list of all elements in the registry
   */
  getAll(): T[] {
    return Object.values(this.content);
  }

  getEntries(): [string, T][] {
    return Object.entries(this.content);
  }

  /**
   * Remove an item from the registry
   */
  remove(key: string) {
    delete this.content[key];
  }
}
