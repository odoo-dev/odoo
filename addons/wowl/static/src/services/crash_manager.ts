import { OdooEnv, Service } from "../types";
import { RPCError } from "./rpc";
import { ErrorDialog } from "../components/error_dialogs/error_dialogs";

export interface CrashManagerService {}

export const crashManagerService: Service<CrashManagerService> = {
  name: "crash_manager",
  dependencies: ["dialog_manager"],
  deploy(env: OdooEnv): CrashManagerService {
    window.addEventListener("error", (ev: ErrorEvent) => {
      const { colno, error: eventError, filename, lineno, message } = ev;
      let error;
      if (!filename && !lineno && !colno) {
        error = {
          type: "script",
          message: "Unknown CORS error",
          stack: `An unknown CORS error occured.
            
             The error probably originates from a JavaScript file served from a different origin.
             (Opening your browser console might give you a hint on the error.)`,
        };
      } else {
        // ignore Chrome video internal error: https://crbug.com/809574
        if (!eventError && message === "ResizeObserver loop limit exceeded") {
          return;
        }
        const traceback = eventError ? eventError.stack : "";
        error = {
          type: "script",
          message,
          stack: `${filename}:${lineno}\n${env._t("Traceback:")}\n${traceback}`,
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

    return {};
  },
};
