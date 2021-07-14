/** @odoo-module **/

import { useBus } from "../bus_hook";
import { useService } from "../service_hook";
import { useEffect } from "../effect_hook";
import { usePosition } from "../position/position_hook";
import { useDropdownNavigation } from "./dropdown_navigation_hook";
import { ParentClosingMode } from "./dropdown_item";

const { Component, core, hooks, useState, QWeb } = owl;
const { EventBus } = core;
const { onWillStart, useExternalListener, useRef, useSubEnv } = hooks;

/**
 * @typedef DropdownState
 * @property {boolean} open
 * @property {boolean} groupIsOpen
 */

/**
 * @typedef DropdownStateChangedPayload
 * @property {Dropdown} emitter
 * @property {DropdownState} newState
 */

/**
 * @extends Component
 */
export class Dropdown extends Component {
    setup() {
        this.state = useState({
            open: this.props.startOpen,
            groupIsOpen: this.props.startOpen,
        });

        // Set up beforeOpen ---------------------------------------------------
        onWillStart(() => {
            if (this.state.open && this.props.beforeOpen) {
                return this.props.beforeOpen();
            }
        });

        // Set up dynamic open/close behaviours --------------------------------
        if (!this.props.manualOnly) {
            // Close on outside click listener
            useExternalListener(window, "click", this.onWindowClicked);
            // Listen to all dropdowns state changes
            useBus(Dropdown.bus, "state-changed", this.onDropdownStateChanged);
        }

        // Set up UI active element related behavior ---------------------------
        this.ui = useService("ui");
        useBus(this.ui.bus, "active-element-changed", (activeElement) => {
            if (activeElement !== this.myActiveEl && this.state.open) {
                // Close when UI active element changes to something different
                this.close();
            }
        });
        useEffect(
            () => {
                Promise.resolve().then(() => {
                    this.myActiveEl = this.ui.activeElement;
                });
            },
            () => []
        );

        // Set up nested dropdowns ---------------------------------------------
        this.hasParentDropdown = this.env.inDropdown;
        useSubEnv({ inDropdown: true });
        this.rootTag = this.props.tag || (this.hasParentDropdown ? "li" : "div");
        const position =
            this.props.position || (this.hasParentDropdown ? "right-start" : "bottom-start");

        // Set up key navigation -----------------------------------------------
        useDropdownNavigation();

        // Set up toggler and positioning --------------------------------------
        if (this.props.toggler === "parent") {
            // Add parent click listener to handle toggling
            useEffect(
                () => {
                    const onClick = (ev) => {
                        if (this.el.contains(ev.target)) {
                            // ignore clicks inside the dropdown
                            return;
                        }
                        this.toggle();
                    };
                    this.el.parentElement.addEventListener("click", onClick);
                    return () => {
                        this.el.parentElement.removeEventListener("click", onClick);
                    };
                },
                () => []
            );

            // Position menu relatively to parent element
            usePosition(() => this.el.parentElement, { popper: "menuRef", position });
        } else {
            // Position menu relatively to inner toggler
            const togglerRef = useRef("togglerRef");
            usePosition(() => togglerRef.el, { popper: "menuRef", position });
        }
    }

    // -------------------------------------------------------------------------
    // Private
    // -------------------------------------------------------------------------

    /**
     * Changes the dropdown state and notifies over the Dropdown bus.
     *
     * All state changes must trigger on the bus, except when reacting to
     * another dropdown state change.
     *
     * @see onDropdownStateChanged()
     *
     * @param {Partial<DropdownState>} stateSlice
     */
    async changeStateAndNotify(stateSlice) {
        if (stateSlice.open && this.props.beforeOpen) {
            await this.props.beforeOpen();
        }
        // Update the state
        Object.assign(this.state, stateSlice);
        // Notify over the bus
        /** @type DropdownStateChangedPayload */
        const stateChangedPayload = {
            emitter: this,
            newState: { ...this.state },
        };
        Dropdown.bus.trigger("state-changed", stateChangedPayload);
    }

    /**
     * Closes the dropdown.
     *
     * @returns {Promise<void>}
     */
    close() {
        return this.changeStateAndNotify({ open: false, groupIsOpen: false });
    }

    /**
     * Opens the dropdown.
     *
     * @returns {Promise<void>}
     */
    open() {
        return this.changeStateAndNotify({ open: true, groupIsOpen: true });
    }

    /**
     * Toggles the dropdown open state.
     *
     * @returns {Promise<void>}
     */
    toggle() {
        const toggled = !this.state.open;
        return this.changeStateAndNotify({ open: toggled, groupIsOpen: toggled });
    }

    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------

    /**
     * Checks if should close on dropdown item selection.
     *
     * @param {CustomEvent<import("./dropdown_item").DropdownItemSelectedEventDetail>} ev
     */
    onItemSelected(ev) {
        // Handle parent closing request
        const { dropdownClosingRequest } = ev.detail;
        const closeAll = dropdownClosingRequest.mode === ParentClosingMode.AllParents;
        const closeSelf =
            dropdownClosingRequest.isFresh &&
            dropdownClosingRequest.mode === ParentClosingMode.ClosestParent;
        if (!this.props.manualOnly && (closeAll || closeSelf)) {
            this.close();
        }
        // Mark closing request as started
        ev.detail.dropdownClosingRequest.isFresh = false;
    }

    /**
     * Dropdowns react to each other state changes through this method.
     *
     * All state changes must trigger on the bus, except when reacting to
     * another dropdown state change.
     *
     * @see changeStateAndNotify()
     *
     * @param {DropdownStateChangedPayload} args
     */
    onDropdownStateChanged(args) {
        if (this.el.contains(args.emitter.el)) {
            // Do not listen to events emitted by self or children
            return;
        }

        // Emitted by direct siblings ?
        if (args.emitter.el.parentElement === this.el.parentElement) {
            // Sync the group status
            this.state.groupIsOpen = args.newState.groupIsOpen;

            // Another dropdown is now open ? Close myself without notifying siblings.
            if (this.state.open && args.newState.open) {
                this.state.open = false;
            }
        } else {
            // Another dropdown is now open ? Close myself and notify the world (i.e. siblings).
            if (this.state.open && args.newState.open) {
                this.close();
            }
        }
    }

    /**
     * Toggles the dropdown on its toggler click.
     */
    onTogglerClick() {
        this.toggle();
    }

    /**
     * Opens the dropdown the mouse enters its toggler.
     * NB: only if its siblings dropdown group is opened and if not a sub dropdown.
     */
    onTogglerMouseEnter() {
        if (this.hasParentDropdown) {
            return;
        }
        if (this.state.groupIsOpen && !this.state.open) {
            this.open();
        }
    }

    /**
     * Used to close ourself on outside click.
     *
     * @param {MouseEvent} ev
     */
    onWindowClicked(ev) {
        // Return if already closed
        if (!this.state.open) {
            return;
        }
        // Return if it's a different ui active element
        if (this.ui.activeElement !== this.myActiveEl) {
            return;
        }
        // Close if we clicked outside the dropdown, or outside the parent
        // element if it is the toggler
        const rootEl = this.props.toggler === "parent" ? this.el.parentElement : this.el;
        const gotClickedInside = rootEl.contains(ev.target);
        if (!gotClickedInside) {
            this.close();
        }
    }
}
Dropdown.bus = new EventBus();
Dropdown.props = {
    toggler: {
        type: String,
        optional: true,
        validate: (prop) => ["parent"].includes(prop),
    },
    startOpen: {
        type: Boolean,
        optional: true,
    },
    manualOnly: {
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
    tag: {
        type: String,
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
    title: {
        type: String,
        optional: true,
    },
    position: {
        type: String,
        optional: true,
    },
};
Dropdown.template = "web.Dropdown";

QWeb.registerComponent("Dropdown", Dropdown);
