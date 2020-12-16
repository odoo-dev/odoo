import { Component, core, tags } from "@odoo/owl";
import type { OdooEnv, Service } from "../types";
import { RainbowMan } from "./rainbow_man";
const { EventBus } = core;

interface Effect extends DisplayOptions {
  id: number;
  message?: string;
}

interface DisplayOptions {
  imgUrl?: string;
  fadeout?: "slow" | "medium" | "fast" | "none";
  type?: "rainbow_man";
}

export interface EffectService {
  create: (message: string, options?: DisplayOptions) => void;
}

class EffectsManager extends Component<{}, OdooEnv> {
  static template = tags.xml`
    <div class="o_effects_manager">
      <RainbowMan t-if="rainbowProps.id" t-props="rainbowProps" t-key="rainbowProps.id" t-on-close-rainbowman="closeRainbowMan"/>
    </div>`;
  static components = { RainbowMan };

  rainbowProps: Effect | {} = {};
  closeRainbowMan() {}
}

export function convertRainBowMessage(message: any): string | undefined {
  if (message instanceof jQuery) {
    return (message as JQuery).html();
  } else if (message instanceof Element) {
    return message.outerHTML;
  } else if (typeof message === "string") {
    return message;
  }
}

export const effectService: Service<EffectService> = {
  name: "effects",
  dependencies: ["notifications", "user"],
  deploy(env: OdooEnv): EffectService {
    if (!env.services.user.showEffect) {
      return {
        create: (message, options?) => {
          env.services.notifications.create(message, { sticky: false });
        },
      };
    }
    let effectId: number = 0;
    let effect: Effect | {} = {};
    const bus = new EventBus();

    class ReactiveEffectsManager extends EffectsManager {
      constructor() {
        super(...arguments);
        bus.on("UPDATE", this, () => {
          this.rainbowProps = effect;
          this.render();
        });
      }
      closeRainbowMan() {
        close();
      }
    }
    odoo.mainComponentRegistry.add("EffectsManager", ReactiveEffectsManager);

    function close(): void {
      effect = {};
      bus.trigger("UPDATE");
    }

    function create(message: string, options?: DisplayOptions): void {
      message = message || env._t("Well Done!");
      let type = "rainbow_man";
      if (options) {
        type = options.type || type;
      }
      if (type === "rainbow_man") {
        effect = Object.assign({ imgUrl: "/web/static/src/img/smile.svg" }, options, {
          id: ++effectId,
          message,
        });
        bus.trigger("UPDATE");
      }
    }

    return { create };
  },
};
