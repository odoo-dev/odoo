/** @odoo-module **/
import { useBus } from "../../core/hooks";
import { useService } from "../../core/hooks";
import { ParentClosingMode } from "./dropdown_item";

const { Component, core, hooks, useState, QWeb } = owl;

export class Dropdown extends Component {
  setup() {
    this.hotkeyService = useService("hotkey");
    this.hotkeyTokens = [];
    this.state = useState({ open: this.props.startOpen, groupIsOpen: this.props.startOpen });
    // Close on outside click listener
    hooks.useExternalListener(window, "click", this.onWindowClicked);
    // Listen to siblings states
    useBus(Dropdown.bus, "state-changed", this.onSiblingDropdownStateChanged);
    hooks.onMounted(() => {
      if (this.state.open) {
        this.subscribeKeynav();
      } else {
        this.unsubscribeKeynav();
      }
    });
    hooks.onPatched(() => {
      if (this.state.open) {
        this.subscribeKeynav();
      } else {
        this.unsubscribeKeynav();
      }
    });
    hooks.onWillStart(() => {
      if ((this.state.open || this.state.groupIsOpen) && this.props.beforeOpen) {
        return this.props.beforeOpen();
      }
    });
  }

  // --------------------------------------------------------------------------
  // PRIVATE
  // --------------------------------------------------------------------------
  async _changeStateAndNotify(stateSlice) {
    if ((stateSlice.open || stateSlice.groupIsOpen) && this.props.beforeOpen) {
      await this.props.beforeOpen();
    }
    // Update the state
    Object.assign(this.state, stateSlice);
    // Notify over the bus
    Dropdown.bus.trigger("state-changed", {
      emitter: this,
      newState: { ...this.state },
    });
  }

  /**
   * @param {"PREV"|"NEXT"|"FIRST"|"LAST"} direction
   */
  _setActiveItem(direction) {
    const items = [...this.el.querySelectorAll(":scope > ul.o_dropdown_menu > .o_dropdown_item")];
    const prevActiveIndex = items.findIndex((item) =>
      [...item.classList].includes("o_dropdown_active")
    );
    const nextActiveIndex =
      direction === "NEXT"
        ? Math.min(prevActiveIndex + 1, items.length - 1)
        : direction === "PREV"
        ? Math.max(0, prevActiveIndex - 1)
        : direction === "LAST"
        ? items.length - 1
        : direction === "FIRST"
        ? 0
        : undefined;
    if (nextActiveIndex !== undefined) {
      items.forEach((item) => item.classList.remove("o_dropdown_active"));
      items[nextActiveIndex].classList.add("o_dropdown_active");
    }
  }

  subscribeKeynav() {
    if (this.hotkeyTokens.length) {
      return;
    }

    const subs = [
      {
        hotkey: "arrowup",
        hint: this.env._t("select the item above"),
        callback: () => this._setActiveItem("PREV"),
      },
      {
        hotkey: "arrowdown",
        hint: "select the item below",
        callback: () => this._setActiveItem("NEXT"),
      },
      {
        hotkey: "shift-arrowup",
        hint: "select the first item",
        callback: () => this._setActiveItem("FIRST"),
      },
      {
        hotkey: "shift-arrowdown",
        hint: "select the last item",
        callback: () => this._setActiveItem("LAST"),
      },
      {
        hotkey: "enter",
        hint: "click on the selected menu",
        callback: () => {
          const activeItem = this.el.querySelector(
            ":scope > ul.o_dropdown_menu > .o_dropdown_item.o_dropdown_active"
          );
          if (activeItem) {
            activeItem.click();
          }
        },
      },
      {
        hotkey: "escape",
        hint: "close the dropdown",
        callback: this._close.bind(this),
      },
    ];
    this.hotkeyTokens = subs.map((sub) => this.hotkeyService.subscribe(sub));
  }

  unsubscribeKeynav() {
    this.hotkeyTokens.forEach((tokenId) => this.hotkeyService.unsubscribe(tokenId));
    this.hotkeyTokens = [];
  }

  _close() {
    return this._changeStateAndNotify({ open: false, groupIsOpen: false });
  }

  _open() {
    return this._changeStateAndNotify({ open: true, groupIsOpen: true });
  }

  _toggle() {
    const toggled = !this.state.open;
    return this._changeStateAndNotify({
      open: toggled,
      groupIsOpen: toggled,
    });
  }

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------
  onItemSelected(ev) {
    // Handle parent closing request
    const { dropdownClosingRequest } = ev.detail;
    const closeAll = dropdownClosingRequest.mode === ParentClosingMode.AllParents;
    const closeSelf =
      dropdownClosingRequest.isFresh &&
      dropdownClosingRequest.mode === ParentClosingMode.ClosestParent;
    if (closeAll || closeSelf) {
      this._close();
    }
    // Mark closing request as started
    ev.detail.dropdownClosingRequest.isFresh = false;
  }

  /**
   * When a sibling dropdown state has changed, update mine accordingly.
   * To avoid loops, here it's the only place where
   * we do not want to notify our state changes.
   */
  onSiblingDropdownStateChanged(args) {
    var _a, _b;
    // Do not listen to my own events
    if (args.emitter.el === this.el) return;
    // Do not listen to events not emitted by direct siblings
    if (
      ((_a = args.emitter.el) === null || _a === void 0 ? void 0 : _a.parentElement) !==
      ((_b = this.el) === null || _b === void 0 ? void 0 : _b.parentElement)
    )
      return;
    // A direct sibling is now open ? Close myself.
    if (args.newState.open) {
      this.state.open = false;
    }
    // Sync the group status
    this.state.groupIsOpen = args.newState.groupIsOpen;
  }

  onTogglerClick() {
    this._toggle();
  }

  onTogglerMouseEnter() {
    if (this.state.groupIsOpen) {
      this._open();
    }
  }

  /**
   * Used to close ourself on outside click.
   */
  onWindowClicked(ev) {
    var _a;
    // Return if already closed
    if (!this.state.open) return;
    let element = ev.target;
    let gotClickedInside = false;
    do {
      element =
        (_a = element.parentElement) === null || _a === void 0 ? void 0 : _a.closest(".o_dropdown");
      gotClickedInside = element === this.el;
    } while (
      (element === null || element === void 0 ? void 0 : element.parentElement) &&
      !gotClickedInside
    );
    if (!gotClickedInside) {
      this._close();
    }
  }
}
Dropdown.bus = new core.EventBus();
Dropdown.props = {
  startOpen: {
    type: Boolean,
    optional: true,
  },
  menuClass: {
    type: String,
    optional: true,
  },
  beforeOpen: {
    type: Function,
    optional: true,
  },
  togglerClass: {
    type: String,
    optional: true,
  },
  hotkey: {
    type: String,
    optional: true,
  },
};
Dropdown.template = "wowl.Dropdown";

QWeb.registerComponent("Dropdown", Dropdown);
