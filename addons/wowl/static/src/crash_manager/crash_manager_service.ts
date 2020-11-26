import { OdooEnv, Service } from "../types";
import { RPCError } from "../services/rpc";
import { ErrorDialog } from "./error_dialogs";
import { isBrowserChromium } from "../utils/utils";

export const crashManagerService: Service<void> = {
  name: "crash_manager",
  dependencies: ["dialog_manager"],
  deploy(env: OdooEnv): void {
    window.addEventListener("error", (ev: ErrorEvent) => {
      const { colno, error: eventError, filename, lineno, message } = ev;
      let error;
      if (!filename && !lineno && !colno) {
        error = {
          type: "script",
          traceback: env._t(
            `Unknown CORS error\n\n` +
              `An unknown CORS error occured.\n` +
              `The error probably originates from a JavaScript file served from a different origin.\n` +
              `(Opening your browser console might give you a hint on the error.)`
          ),
        };
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
        error = {
          type: "script",
          traceback: `${message}\n\n${filename}:${lineno}\n${env._t("Traceback")}:\n${stack}`,
        };
      }
      env.services.dialog_manager.open(ErrorDialog, { error });
    });

    env.bus.on("RPC_ERROR", null, (error: RPCError) => {
      if (error.type !== "server") {
        return;
      }
      let dialogClass;
      if (error.name && env.registries.errorDialogs.contains(error.name)) {
        dialogClass = env.registries.errorDialogs.get(error.name);
      }
      env.services.dialog_manager.open(dialogClass || ErrorDialog, { error });
    });
  },
};
