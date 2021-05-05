/** @odoo-module **/

import { errorDialogRegistry } from "../errors/error_dialog_registry";
import {
  RPCErrorDialog,
} from "../errors/error_dialogs";
import { errorHandlerRegistry } from "../errors/error_handler_registry";

/**
 * @typedef {import("../env").OdooEnv} OdooEnv
 * @typedef {import("../errors/error_service").UncaughtError} UncaughError
 * @typedef {(error: UncaughError) => boolean | void} ErrorHandler
 */

// -----------------------------------------------------------------------------
// Legacy error handling
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

/**
 * @param {OdooEnv} env
 * @returns {ErrorHandler}
 */
function legacyRPCErrorHandler(env) {
  return (uncaughtError) => {
    let error = uncaughtError.originalError;
    if (error && error.legacy && error.message && error.message.name === "RPC_ERROR") {
      const event = error.event;
      error = error.message;
      uncaughtError.unhandledRejectionEvent.preventDefault();
      if (event.isDefaultPrevented()) {
        // in theory, here, event was already handled
        return true;
      }
      event.preventDefault();
      const exceptionName = error.exceptionName;
      let ErrorComponent = error.Component;
      if (!ErrorComponent && exceptionName && errorDialogRegistry.contains(exceptionName)) {
        ErrorComponent = errorDialogRegistry.get(exceptionName);
      }

      env.services.dialog.open(ErrorComponent || RPCErrorDialog, {
        traceback: error.traceback || error.stack,
        message: error.message,
        name: error.name,
        exceptionName: error.exceptionName,
        data: error.data,
        subType: error.subType,
        code: error.code,
        type: error.type,
      });
      return true;
    }
  };
}
errorHandlerRegistry.add("legacyRPCErrorHandler", legacyRPCErrorHandler, { sequence: 2 });
