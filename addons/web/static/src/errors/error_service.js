/** @odoo-module **/

import { browser, isBrowserChrome } from "../core/browser";
import { serviceRegistry } from "../webclient/service_registry";
import { errorHandlerRegistry } from "./error_handler_registry";
import { UncaughtClientError, UnknownCorsError } from "./odoo_error";
/** @owlnext */
// import { UncaughtEmptyRejectionError, UncaughtObjectRejectionError } from "./odoo_error";

export const errorService = {
  start(env) {
    const handlers = errorHandlerRegistry.getAll().map((builder) => builder(env));

    /**
     * Returns a traceback built from a given error. This traceback is formatted
     * the same way as a stack trace in chromium-based browsers. Example:
     *
     *  Traceback:
     *
     *  Error: Can't write value
     *      at _onOpenFormView (http://localhost:8069/web/content/425-baf33f1/web.assets.js:1064:30)
     *      ...
     *
     * @param {Error} error
     * @returns {string}
     */
    function buildTraceback(error) {
      let stack;
      if (error.stack && isBrowserChrome()) {
        stack = error.stack;
      } else {
        const chromiumStackLines = (error.stack || "")
          .split("\n")
          .filter(Boolean)
          .map((l) => `\n    ${l.replace(/(.*)@(.*)/g, "at $1 ($2)").replace(/\/</g, "")}`);
        stack = `${error.name}: ${error.message}` + chromiumStackLines.join("");
      }
      return `${env._t("Traceback")}:\n\n${stack}`;
    }

    function handleError(error) {
      browser.console.error(error);
      if (!error.traceback) {
        error.traceback = buildTraceback(error);
      }
      try {
        for (let handler of handlers) {
          if (handler(error, env)) {
            break;
          }
        }
        env.bus.trigger("ERROR_DISPATCHED", error);
      } catch (subError) {
        // Handles error occurring in error handlers.
        browser.console.error(env._t("Another error occurred while handling the error above:"));
        browser.console.error(subError);
      }
    }

    window.addEventListener("error", (ev) => {
      const { colno, error: eventError, filename, lineno, message } = ev;
      let error;
      if (!filename && !lineno && !colno) {
        error = new UnknownCorsError();
        error.traceback = env._t(
          `Unknown CORS error

An unknown CORS error occured.
The error probably originates from a JavaScript file served from a different origin.
(Opening your browser console might give you a hint on the error.)`
        );
      } else {
        // ignore Chrome video internal error: https://crbug.com/809574
        if (!eventError && message === "ResizeObserver loop limit exceeded") {
          return;
        }
        error = eventError || new UncaughtClientError(message);
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
      } else {
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        ev.preventDefault();
      }

      /** @owlnext */
      // const eventError = ev.reason;
      // let error;
      // if (eventError && eventError.message) {
      //   // the thrown value was originally a non-Error instance or a raw js object
      //   error = new UncaughtObjectRejectionError();
      //   error.traceback = JSON.stringify(eventError, Object.getOwnPropertyNames(eventError), 4);
      // } else {
      //   error = new UncaughtEmptyRejectionError(
      //     "A Promise reject call with no argument is not getting caught."
      //   );
      // }
      // handleError(error);
    });
  },
};

serviceRegistry.add("error", errorService, { sequence: 1 });
