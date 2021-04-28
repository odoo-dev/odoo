/** @odoo-module **/

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * @typedef {Object} OdooEnv
 * @property {Object} services
 * @property {owl.core.EventBus} bus
 * @property {owl.QWeb} qweb
 * @property {string} debug
 * @property {(str: string) => string} _t
 * @property {boolean} [isSmall]
 */

// -----------------------------------------------------------------------------
// makeEnv
// -----------------------------------------------------------------------------

/**
 * Return a value Odoo Env object
 *
 * @param {string} debug
 * @returns {OdooEnv}
 */
export function makeEnv(debug) {
  return {
    qweb: new owl.QWeb(),
    bus: new owl.core.EventBus(),
    services: {},
    debug,
    _t: () => {
      throw new Error("Translations are not ready yet. Maybe use _lt instead?");
    },
    get isSmall() {
      throw new Error("UI service not initialized!");
    },
  };
}
