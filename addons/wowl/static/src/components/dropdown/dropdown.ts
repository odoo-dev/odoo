import { Component, core, hooks, useState } from "@odoo/owl";
import { OwlEvent } from "@odoo/owl/dist/types/core/owl_event";
import { DropdownItemSelectedPayload, ParentClosingMode } from "./dropdown_item";

export class Dropdown extends Component {
  static bus = new core.EventBus();
  static props = {
    startOpen: {
      type: Boolean,
      optional: true,
    },
    menuClass: {
      type: String,
      optional: true,
    },
    togglerClass: {
      type: String,
      optional: true,
    },
  };
  static template = "wowl.Dropdown";

  state = useState({ open: this.props.startOpen, groupIsOpen: this.props.startOpen });

  constructor() {
    super(...arguments);
    // Close on outside click listener
    hooks.useExternalListener(window, "click", this.onWindowClicked);
    // Listen to siblings state
    Dropdown.bus.on("state-changed", this, this.onSiblingDropdownStateChanged);
  }

  // --------------------------------------------------------------------------
  // PRIVATE
  // --------------------------------------------------------------------------
  private _changeStateAndNotify(stateSlice: any) {
    // Update the state
    Object.assign(this.state, stateSlice);
    // Notify over the bus
    Dropdown.bus.trigger("state-changed", {
      emitter: this,
      newState: { ...this.state },
    });
  }

  private _close() {
    this._changeStateAndNotify({ open: false, groupIsOpen: false });
  }

  private _open() {
    this._changeStateAndNotify({ open: true, groupIsOpen: true });
  }

  private _toggle() {
    const toggled = !this.state.open;
    this._changeStateAndNotify({
      open: toggled,
      groupIsOpen: toggled,
    });
  }

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------
  onItemSelected(ev: OwlEvent<DropdownItemSelectedPayload>) {
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
  onSiblingDropdownStateChanged(args: { emitter: Dropdown; newState: any }) {
    // Do not listen to my own events
    if (args.emitter.el === this.el) return;
    // Do not listen to events not emitted by direct siblings
    if (args.emitter.el?.parentElement !== this.el?.parentElement) return;

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
  onWindowClicked(ev: MouseEvent) {
    // Return if already closed
    if (!this.state.open) return;

    let element: Element | null | undefined = ev.target as Element;
    let gotClickedInside = false;
    do {
      element = element.parentElement?.closest(".o_dropdown");
      gotClickedInside = element === this.el;
    } while (element?.parentElement && !gotClickedInside);

    if (!gotClickedInside) {
      this._close();
    }
  }
}
