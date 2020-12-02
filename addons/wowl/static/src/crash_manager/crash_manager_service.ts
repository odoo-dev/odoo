import {
  ClientErrorDialog,
  ErrorDialog,
  NetworkErrorDialog,
  RPCErrorDialog,
} from "./error_dialogs";
import { OdooEnv, Service, Type } from "../types";
import { isBrowserChromium } from "../utils/utils";
import { Component } from "@odoo/owl";
import { Env } from "@odoo/owl/dist/types/component/component";
import { RPCError } from "../services/rpc";
import OdooError from "./odoo_error";

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
      env.bus.trigger("ERROR_DISPATCH", err);
    });

    window.addEventListener("unhandledrejection", (ev) => {
      let unhandledError = ev.reason;

      if (!unhandledError) {
        const error = new OdooError("UNCAUGHT_EMPTY_REJECTION_ERROR");
        error.message = env._t("A Promise reject call with no argument is not getting caught.");
        env.bus.trigger("ERROR_DISPATCH", error);
        return;
      }

      // The thrown error was originally an instance of "Error"
      if (Error.prototype == Object.getPrototypeOf(unhandledError)) {
        const error = new OdooError("DEFAULT_ERROR");
        error.message = ev.reason.message;
        error.traceback = ev.reason.stack;
        env.bus.trigger("ERROR_DISPATCH", error);
      }
      // The thrown error was originally an instance of "OdooError" or subtype.
      else if (OdooError.prototype.isPrototypeOf(unhandledError)) {
        env.bus.trigger("ERROR_DISPATCH", unhandledError);
      }
      // The thrown value was originally a non-Error instance or a raw js object
      else {
        const error = new OdooError("UNCAUGHT_OBJECT_REJECTION_ERROR");
        error.message = ev.reason.message;
        error.traceback = JSON.stringify(
          unhandledError,
          Object.getOwnPropertyNames(unhandledError)
        );
        env.bus.trigger("ERROR_DISPATCH", error);
      }
    });

    env.bus.on("ERROR_DISPATCH", null, (error: OdooError) => {
      const type = error.name;
      let dialogComponent: Type<Component<any, Env>> = ErrorDialog;
      // If an error has been defined to have a custom dialog
      if (error.alternativeComponent) {
        dialogComponent = error.alternativeComponent!;
      }

      switch (type) {
        case "UNKNOWN_CORS_ERROR":
          env.services.dialog_manager.open(NetworkErrorDialog, {
            traceback: error.traceback ?? error.stack,
            message: error.message,
            name: error.name,
          });
          break;
        case "UNCAUGHT_CLIENT_ERROR":
          env.services.dialog_manager.open(ClientErrorDialog, {
            traceback: error.traceback ?? error.stack,
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
          env.services.dialog_manager.open(dialogComponent || RPCErrorDialog, {
            traceback: error.traceback ?? error.stack,
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
          env.services.dialog_manager.open(dialogComponent, {
            traceback: error.traceback ?? error.stack,
            message: error.message,
            name: error.name,
          });
          break;
      }
    });
  },
};
