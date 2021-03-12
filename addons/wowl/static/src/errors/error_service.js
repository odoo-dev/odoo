/** @odoo-module **/

import { serviceRegistry } from "../webclient/service_registry";
import OdooError from "./odoo_error";
import { errorHandlerRegistry } from "./error_handler_registry";
import { isBrowserChrome } from "../core/browser";

export const errorService = {
  dependencies: ["dialog", "notification", "rpc"],
  deploy(env) {
    const handlers = errorHandlerRegistry.getAll().map((builder) => builder(env));

    function handleError(error, env) {
      for (let handler of handlers) {
        if (handler(error, env)) {
          break;
        }
      }
      env.bus.trigger("ERROR_DISPATCHED", error);
    }

    window.addEventListener("error", (ev) => {
      const { colno, error: eventError, filename, lineno, message } = ev;
      let err;
      if (!filename && !lineno && !colno) {
        err = new OdooError("UNKNOWN_CORS_ERROR");
        err.traceback = env._t(
          `Unknown CORS error\n\n` +
            `An unknown CORS error occured.\n` +
            `The error probably originates from a JavaScript file served from a different origin.\n` +
            `(Opening your browser console might give you a hint on the error.)`
        );
      } else {
        // ignore Chrome video internal error: https://crbug.com/809574
        if (!eventError && message === "ResizeObserver loop limit exceeded") {
          return;
        }
        let stack = eventError ? eventError.stack : "";
        if (!isBrowserChrome) {
          // transforms the stack into a chromium stack
          // Chromium stack example:
          // Error: Mock: Can't write value
          //     _onOpenFormView@http://localhost:8069/web/content/425-baf33f1/wowl.assets.js:1064:30
          //     ...
          stack = `${message}\n${stack}`.replace(/\n/g, "\n    ");
        }
        err = new OdooError("UNCAUGHT_CLIENT_ERROR");
        err.traceback = `${message}\n\n${filename}:${lineno}\n${env._t("Traceback")}:\n${stack}`;
      }
      handleError(err, env);
    });

    window.addEventListener("unhandledrejection", (ev) => {
      let unhandledError = ev.reason;
      if (!unhandledError) {
        const error = new OdooError("UNCAUGHT_EMPTY_REJECTION_ERROR");
        error.message = env._t("A Promise reject call with no argument is not getting caught.");
        handleError(error, env);
        return;
      }
      // The thrown error was originally an instance of "OdooError" or subtype.
      if (OdooError.prototype.isPrototypeOf(unhandledError)) {
        handleError(unhandledError, env);
      }
      // The thrown error was originally an instance of "Error"
      else if (Error.prototype.isPrototypeOf(unhandledError)) {
        const error = new OdooError("DEFAULT_ERROR");
        error.message = ev.reason.message;
        error.traceback = ev.reason.stack;
        handleError(error, env);
      }
      // The thrown value was originally a non-Error instance or a raw js object
      else {
        const error = new OdooError("UNCAUGHT_OBJECT_REJECTION_ERROR");
        error.message = ev.reason.message;
        error.traceback = JSON.stringify(
          unhandledError,
          Object.getOwnPropertyNames(unhandledError),
          4
        );
        handleError(error, env);
      }
    });
  },
};

serviceRegistry.add("error", errorService);
