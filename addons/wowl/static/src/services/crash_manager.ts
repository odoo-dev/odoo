import type { Service } from "../types";

export const crashManagerService: Service<void> = {
  name: "crash_manager",
  deploy(env) {
    const console = env.browser.console;
    env.bus.on("RPC_ERROR", null, (error) => {
      console.error(error);
    });
  },
};
