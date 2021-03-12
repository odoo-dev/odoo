/** @odoo-module **/
import { useService } from "../core/hooks";
import { debounce } from "../utils/misc";
import { serviceRegistry } from "../webclient/service_registry";

const { Component, core, hooks } = owl;
const { EventBus } = core;
const { onMounted, onWillUnmount, useRef } = hooks;

export const SIZES = { XS: 0, VSM: 1, SM: 2, MD: 3, LG: 4, XL: 5, XXL: 6 };

/**
 * This hook will set the UI ownership
 * when the caller component will mount/unmount.
 *
 * The caller component could pass a `t-ref` value of its template
 * to delegate the UI ownership to another element than itself.
 * In that case, it is mandatory that the referenced element is fixed and
 * not dynamically attached in/detached from the DOM (e.g. with t-if directive).
 *
 * @param {string?} refName
 */
export function useUIOwnership(refName) {
  const uiService = useService("ui");
  const owner = refName ? useRef(refName) : Component.current;
  let uiOwnership = undefined;
  onMounted(() => {
    uiOwnership = uiService.takeOwnership(owner.el);
  });
  onWillUnmount(() => {
    uiOwnership.release();
  });
}

export const uiService = {
  deploy(env) {
    let ui = {};

    // block/unblock code
    const bus = new EventBus();

    let blockCount = 0;
    function block() {
      blockCount++;
      if (blockCount === 1) {
        bus.trigger("BLOCK");
      }
    }
    function unblock() {
      blockCount = Math.max(0, blockCount - 1);
      if (blockCount === 0) {
        bus.trigger("UNBLOCK");
      }
    }

    Object.assign(ui, {
      bus,
      block,
      unblock,
      get isBlocked() {
        return blockCount > 0;
      },
    });

    // UI ownership code
    let ownerStack = [document];
    function takeOwnership(owner) {
      ownerStack.push(owner);
      return {
        release() {
          ownerStack = ownerStack.filter((x) => x !== owner);
        },
      };
    }
    function getOwner() {
      return ownerStack[ownerStack.length - 1];
    }

    Object.assign(ui, {
      getOwner,
      takeOwnership,
    });

    // window size handling
    const MEDIAS = [
      window.matchMedia("(max-width: 474px)"),
      window.matchMedia("(min-width: 475px) and (max-width: 575px)"),
      window.matchMedia("(min-width: 576px) and (max-width: 767px)"),
      window.matchMedia("(min-width: 768px) and (max-width: 991px)"),
      window.matchMedia("(min-width: 992px) and (max-width: 1199px)"),
      window.matchMedia("(min-width: 1200px) and (max-width: 1533px)"),
      window.matchMedia("(min-width: 1534px)"),
    ];
    function getSize() {
      return MEDIAS.findIndex((media) => media.matches);
    }

    // listen to media query status changes
    function updateSize() {
      ui.size = getSize();
    }
    MEDIAS.forEach((media) => media.addEventListener("change", debounce(updateSize, 100)));

    Object.assign(ui, {
      size: getSize(),
      get isSmall() {
        return ui.size <= SIZES.SM;
      },
    });

    return ui;
  },
};

serviceRegistry.add("ui", uiService);
