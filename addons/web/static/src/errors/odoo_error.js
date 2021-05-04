/** @odoo-module **/

/**
 * Odoo Error
 *
 * The point of this class is to properly extend an error: changes on properties
 * (`name` or `message`) outside the constructor will not be reflected in the stack
 * or the appearance of the error in the console, whereas assigning them directly
 * on instanciation will have the expected result.
 */
export class OdooError extends Error {
  /**
   * @param {string} name
   * @param {string} message
   */
  constructor(name, message) {
    super(message);
    this.name = name;
  }
}
