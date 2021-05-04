/** @odoo-module **/

import { browser, isBrowserChrome } from "../core/browser";
import { serviceRegistry } from "../webclient/service_registry";
import { errorHandlerRegistry } from "./error_handler_registry";
import { OdooError } from "./odoo_error";

export const errorService = {
  start(env) {
    const handlers = errorHandlerRegistry.getAll().map((builder) => builder(env));

    function handleError(error) {
      browser.console.error(error);
      try {
        for (let handler of handlers) {
          if (handler(error, env)) {
            break;
          }
        }
        env.bus.trigger("ERROR_DISPATCHED", error);
      } catch (subError) {
        // Handles error occurring in error handlers.
        browser.console.error(
          env._t("An additional error occurred while handling the error above:")
        );
        browser.console.error(subError);
      }
    }

    window.addEventListener("error", (ev) => {
      const { colno, error: eventError, filename, lineno, message } = ev;
      let error;
      if (!filename && !lineno && !colno) {
        error = new OdooError("UNKNOWN_CORS_ERROR");
        error.traceback = env._t(
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
        error = new OdooError("UNCAUGHT_CLIENT_ERROR");
        error.traceback = `${message}\n\n${filename}:${lineno}\n${env._t("Traceback")}:\n${stack}`;
      }
      handleError(error);
    });

    window.addEventListener("unhandledrejection", (ev) => {
      /**
       * @legacy
       * In the future, we probably don't want to use Promises as async if/else structures
       * rather, we should always consider a rejected Promise as an error
       * For the time being, this is not possible, as Odoo code intensively relies on guardedCatch
       */
      if (ev.reason instanceof Error) {
        // the thrown error was originally an instance of "Error"
        handleError(ev.reason);
      }
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      ev.preventDefault();

      /** @next */
      // const eventError = ev.reason;
      // let error;
      // if (eventError && eventError.message) {
      //   // the thrown value was originally a non-Error instance or a raw js object
      //   error = new OdooError("UNCAUGHT_OBJECT_REJECTION_ERROR");
      //   error.traceback = JSON.stringify(eventError, Object.getOwnPropertyNames(eventError), 4);
      // } else {
      //   error = new OdooError(
      //     "UNCAUGHT_EMPTY_REJECTION_ERROR",
      //     "A Promise reject call with no argument is not getting caught."
      //   );
      // }
      // handleError(error);
    });
  },
};

serviceRegistry.add("error", errorService, { sequence: 1 });
