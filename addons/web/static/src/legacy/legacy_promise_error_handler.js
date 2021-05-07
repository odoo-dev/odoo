/** @odoo-module **/

import { errorHandlerRegistry } from "../errors/error_handler_registry";

/**
 * @typedef {import("../env").OdooEnv} OdooEnv
 * @typedef {import("../errors/error_service").UncaughtError} UncaughError
 * @typedef {(error: UncaughError) => boolean | void} ErrorHandler
 */

// -----------------------------------------------------------------------------
// Legacy Promise error handling
// -----------------------------------------------------------------------------

/**
 * @param {OdooEnv} env
 * @returns {ErrorHandler}
 */
 function legacyRejectPromiseHandler(env) {
  return (error) => {
    if (error.name === "UncaughtPromiseError") {
      const isLegitError = error.originalError && error.originalError instanceof Error;
      const isLegacyRPC = error.originalError && error.originalError.legacy;
      if (!isLegitError && !isLegacyRPC) {
        // we consider that a code throwing something that is not an error is
        // a case where it is meant as an asynchronous control flow (as legacy
        // code is sadly doing). For now, we just want to consider this as a non
        // error, so we prevent default it.
        error.unhandledRejectionEvent.preventDefault();
        return true;
      }
    }
  };
}
errorHandlerRegistry.add("legacyRejectPromiseHandler", legacyRejectPromiseHandler, { sequence: 1 });

