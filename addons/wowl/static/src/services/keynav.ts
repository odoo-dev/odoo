import { core } from "@odoo/owl";
import { EventBus } from "@odoo/owl/dist/types/core/event_bus";
import { OdooEnv, Service } from "../types";

const FIRST_LEVEL_ACCESSKEY_DELAY = 1000;

interface KeyNavService extends EventBus {}

export const keyNavService: Service<KeyNavService> = {
  name: "keynav",
  dependencies: ["ui"],
  deploy(env: OdooEnv): KeyNavService {
    const bus = new core.EventBus();

    let overlaysShown: boolean = false;

    let timerHandle: number | undefined;

    function addOverlays() {
      const isVisible = (el: HTMLElement) => el.offsetHeight > 0 && el.offsetWidth > 0;
      [...document.querySelectorAll<HTMLElement>("[accesskey]")].filter(isVisible).forEach((el) => {
        const overlay = document.createElement("div");
        overlay.className = "o_web_accesskey_overlay";
        overlay.innerHTML = el.getAttribute("accesskey")!.toUpperCase();

        const overlayParent = el.tagName.toLowerCase() === "input" ? el.parentElement! : el;
        if (overlayParent.style.position !== "absolute") {
          overlayParent.style.position = "relative";
        }
        overlayParent.appendChild(overlay);
        overlaysShown = true;
      });
    }

    function removeOverlays() {
      document.querySelectorAll(".o_web_accesskey_overlay").forEach((el) => el.remove());
      overlaysShown = false;
    }

    function onKeydown(ev: KeyboardEvent) {
      if (
        !overlaysShown &&
        !env.services.ui.isBlocked &&
        (ev.altKey || ev.key === "Alt") &&
        !ev.ctrlKey
      ) {
        addOverlays();
      }
      if (timerHandle !== undefined) {
        odoo.browser.clearTimeout(timerHandle);
      }
      timerHandle = odoo.browser.setTimeout(clearFlak, FIRST_LEVEL_ACCESSKEY_DELAY);
    }

    function onKeyup(ev: KeyboardEvent) {
      if (overlaysShown && (ev.altKey || ev.key === "Alt") && !ev.ctrlKey) {
        removeOverlays();
      }
    }

    function clearFlak() {
      odoo.browser.clearTimeout(timerHandle);
      removeOverlays();
    }

    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    return Object.assign(bus, {});
  },
};
