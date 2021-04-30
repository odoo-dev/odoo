/** @odoo-module **/

export default class OdooError extends Error {
  constructor(name, originalError) {
    super();
    this.name = name;
    if (originalError) {
      const { message, stack } = originalError;
      this.message = message;
      this.traceback = stack;
      this.stack = stack;
      this.originalError = originalError;
    } else {
      this.originalError = this;
    }
  }
}
