import { Component, core, hooks } from "@odoo/owl";
import { OdooEnv, Service } from "../types";

const bus = new core.EventBus();

const isVisibleHTMLElement = (el: HTMLElement) => el.offsetHeight > 0 && el.offsetWidth > 0;

interface UseHotkeysParams {
  autoRegisterAccessKeys: boolean;
  combinator: string;
  separator: string;
  scope: string;
}

/**
 * This hook should be used by components when
 * they want to ease the hotkeys service usage.
 */
export function useHotkeys(params: Partial<UseHotkeysParams>) {
  // BOI: just an idea I may explore later...
  const component = Component.current! as Component<any, OdooEnv>;

  // Ensure hotkeys service is available
  if (!component.env.services.hotkeys) {
    throw new Error("Hotkeys service not deployed.");
  }

  // Default params
  params = Object.assign(
    { autoRegisterAccessKeys: true, combinator: "+", separator: ",", scope: "all" },
    params
  );

  // Automatically subscribe accesskey attributes as accessible through keyboard events.
  // Useful for
  if (params.autoRegisterAccessKeys) {
    function registerAccesskeyElements() {
      [...component.el!.querySelectorAll<HTMLElement>("[accesskey]")]
        .filter(isVisibleHTMLElement)
        .forEach((el) => {
          bus.trigger("register", {
            callback: null,
            description: el.title || component.env._t("Undocumented hotkey shortcut"),
            hotkey: el.accessKeyLabel || el.accessKey,
            owner: component,
            target: el,
          });
        });
    }
    hooks.onMounted(registerAccesskeyElements);
    hooks.onPatched(registerAccesskeyElements);
  }

  function unregister() {
    bus.trigger("unregister", { owner: component });
  }

  hooks.onWillUnmount(unregister);

  return {
    on: function (hotkeyPattern: string, cb: () => boolean) {
      bus.on("dispatch", component, (keys) => {
        if (keys === hotkeyPattern) {
          cb();
        }
      });
    },
  };
}

interface HotkeysService {}

const FLUSH_DELAY = 1000;
export const hotkeysService: Service<HotkeysService> = {
  name: "hotkeys",
  deploy(): HotkeysService {
    let flushTimer: number | undefined;
    const keysBuffer: any = {};

    function registerKeydown(ev: KeyboardEvent) {
      keysBuffer[ev.key] = {
        key: ev.key,
        modifiers: {
          alt: ev.altKey,
          ctrl: ev.ctrlKey,
          shift: ev.shiftKey,
        },
      };
      const eventName = Object.keys(keysBuffer).join(" ");
      bus.trigger(eventName, keysBuffer);
      resetAutoFlush();
    }

    function resetAutoFlush() {
      odoo.browser.clearTimeout(flushTimer);
      flushTimer = odoo.browser.setTimeout(flush, FLUSH_DELAY);
    }

    function flush() {
      console.log("flushing", keysBuffer);
      Object.keys(keysBuffer).forEach((k) => {
        console.log("delete", keysBuffer[k]);
        delete keysBuffer[k];
      });
      console.log("flushed", keysBuffer);
      odoo.browser.clearTimeout(flushTimer);
    }

    window.addEventListener("keydown", registerKeydown);

    return {};
  },
};
