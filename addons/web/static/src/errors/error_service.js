/** @odoo-module **/

import { isBrowserChrome } from "../core/browser";
import { serviceRegistry } from "../webclient/service_registry";
import { errorHandlerRegistry } from "./error_handler_registry";
import OdooError from "./odoo_error";

export const errorService = {
  dependencies: ["dialog", "notification", "rpc"],
  start(env) {
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
        err = new OdooError("UNKNOWN_CORS_ERROR", eventError);
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
        if (!isBrowserChrome()) {
          // transforms the stack into a chromium stack
          // Chromium stack example:
          // Error: Mock: Can't write value
          //     _onOpenFormView@http://localhost:8069/web/content/425-baf33f1/web.assets.js:1064:30
          //     ...
          stack = `${message}\n${stack}`.replace(/\n/g, "\n    ");
        }
        err = new OdooError("UNCAUGHT_CLIENT_ERROR", eventError);
        err.traceback = `${message}\n\n${filename}:${lineno}\n${env._t("Traceback")}:\n${stack}`;
      }
      handleError(err, env);
    });

    window.addEventListener("unhandledrejection", (ev) => {
      let err;
      if (ev.reason instanceof OdooError) {
        // the thrown error was originally an instance of "OdooError" or subtype.
        err = ev.reason;
      } else if (ev.reason instanceof Error) {
        // the thrown error was originally an instance of "Error"
        err = new OdooError("DEFAULT_ERROR", ev.reason);
        // @legacy
        // In the future, we probably don't want to use Promises as async if/else structures
        // rather, we should always consider a rejected Promise as an error
        // For the time being, this is not possible, as Odoo code intensively relies on guardedCatch
        // } else if (ev.reason && ev.reason.message) {
        //   // the thrown value was originally a non-Error instance or a raw js object
        //   err = new OdooError("UNCAUGHT_OBJECT_REJECTION_ERROR", ev.reason);
        //   err.traceback = JSON.stringify(ev.reason, Object.getOwnPropertyNames(ev.reason), 4);
        // } else {
        //   err = new OdooError("UNCAUGHT_EMPTY_REJECTION_ERROR", ev.reason);
        //   err.message = env._t("A Promise reject call with no argument is not getting caught.");
        // }
      }
      if (err) {
        handleError(err, env);
      }
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      ev.preventDefault();
    });
  },
};

serviceRegistry.add("error", errorService);
