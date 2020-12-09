import { isBrowserChromium } from "../utils/misc";
import {
  ClientErrorDialog,
  ErrorDialog,
  NetworkErrorDialog,
  RPCErrorDialog,
} from "./error_dialogs";
import { OdooEnv, Service, Type } from "../types";
import { Component } from "@odoo/owl";
import { Env } from "@odoo/owl/dist/types/component/component";
import { RPCError } from "../services/rpc";
import OdooError from "./odoo_error";

function handleError(error: OdooError, env: OdooEnv) {
  switch (error.name) {
    case "UNKNOWN_CORS_ERROR":
      env.services.dialog_manager.open(NetworkErrorDialog, {
        traceback: error.traceback || error.stack,
        message: error.message,
        name: error.name,
      });
      break;
    case "UNCAUGHT_CLIENT_ERROR":
      env.services.dialog_manager.open(ClientErrorDialog, {
        traceback: error.traceback || error.stack,
        message: error.message,
        name: error.name,
      });
      break;
    case "UNCAUGHT_EMPTY_REJECTION_ERROR":
      env.services.dialog_manager.open(ClientErrorDialog, {
        message: error.message,
        name: error.name,
      });
      break;
    case "RPC_ERROR":
      // When an error comes from the server, it can have an exeption name.
      // (or any string truly). It is used as key in the error dialog from
      // server registry to know which dialog component to use.
      // It's how a backend dev can easily map its error to another component.
      // Note that for a client side exception, we don't use this registry
      // as we can directly assign a value to `component`.

      // error is here a RPCError
      const exceptionName = (error as RPCError).exceptionName;
      let ErrorComponent = error.Component;
      if (!ErrorComponent && exceptionName && odoo.errorDialogRegistry.contains(exceptionName)) {
        ErrorComponent = odoo.errorDialogRegistry.get(exceptionName);
      }

      env.services.dialog_manager.open(ErrorComponent || RPCErrorDialog, {
        traceback: error.traceback || error.stack,
        message: error.message,
        name: error.name,
        exceptionName: (error as RPCError).exceptionName,
        data: (error as RPCError).data,
        subType: (error as RPCError).subType,
        code: (error as RPCError).code,
        type: (error as RPCError).type,
      });
      break;
    default:
      let DialogComponent: Type<Component<any, Env>> = ErrorDialog;
      // If an error has been defined to have a custom dialog
      if (error.Component) {
        DialogComponent = error.Component!;
      }
      env.services.dialog_manager.open(DialogComponent, {
        traceback: error.traceback || error.stack,
        message: error.message,
        name: error.name,
      });
      break;
  }
  env.bus.trigger("ERROR_DISPATCHED", error);
}

export const crashManagerService: Service<void> = {
  name: "crash_manager",
  dependencies: ["dialog_manager"],
  deploy(env: OdooEnv): void {
    window.addEventListener("error", (ev: ErrorEvent) => {
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
        if (!isBrowserChromium()) {
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

      // The thrown error was originally an instance of "Error"
      if (Error.prototype == Object.getPrototypeOf(unhandledError)) {
        const error = new OdooError("DEFAULT_ERROR");
        error.message = ev.reason.message;
        error.traceback = ev.reason.stack;
        handleError(error, env);
      }
      // The thrown error was originally an instance of "OdooError" or subtype.
      else if (OdooError.prototype.isPrototypeOf(unhandledError)) {
        handleError(unhandledError, env);
      }
      // The thrown value was originally a non-Error instance or a raw js object
      else {
        const error = new OdooError("UNCAUGHT_OBJECT_REJECTION_ERROR");
        error.message = ev.reason.message;
        error.traceback = JSON.stringify(
          unhandledError,
          Object.getOwnPropertyNames(unhandledError)
        );
        handleError(error, env);
      }
    });
  },
};
