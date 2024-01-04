/** @odoo-module **/

import { Component, onMounted, onRendered, status, useEffect, useState, xml } from "@odoo/owl";
import { useNavigation } from "@web/core/navigation/navigation";
import { useChildRef, useService } from "@web/core/utils/hooks";
import { useDropdownGroup } from "./dropdown_behaviours/dropdown_group_hook";
import { useDropdownNesting } from "./dropdown_behaviours/dropdown_nesting";
import { DropdownPopover } from "./dropdown_behaviours/dropdown_popover";
import { effect } from "@web/core/utils/reactive";
import { mergeClasses } from "../utils/className";

/**
 * @typedef {Object} DropdownState
 * @property {() => void} open
 * @property {() => void} close
 * @property {() => void} toggle
 * @property {boolean} isOpen
 * @property {'auto'|'controlled'} mode
 */

/**
 * Hook used to interact with the Dropdown state.
 *
 * @param {'auto'|'controlled'} [mode='auto'] - By default the state
 * is managed by the dropdown, meaning click events on the toggler will open
 * the dropdown. Default is 'auto' but when set to 'controlled' no listener
 * is added and it's the parent's responsability to open the dropdown.
 *
 * @param {Function} [onChange=undefined] - Callback invoked when the state
 * changes, takes (isOpen) as its parameter.
 *
 * @returns {DropdownState}
 */
export function useDropdown({ mode = "auto", onChange } = {}) {
    const state = useState({
        mode: mode,
        isOpen: false,
        open: async () => {
            state.isOpen = true;
            onChange?.(true);
        },
        close: () => {
            state.isOpen = false;
            onChange?.(false);
        },
        toggle: async () => {
            if (state.isOpen) {
                state.close();
            } else {
                await state.open();
            }
        },
    });
    return state;
}

function getFirstElementOfNode(node) {
    if (!node) {
        return null;
    }
    if (node.el) {
        return node.el.nodeType === Node.ELEMENT_NODE ? node.el : null;
    }
    if (node.bdom || node.child) {
        return getFirstElementOfNode(node.bdom || node.child);
    }
    if (node.children) {
        for (const child of node.children) {
            const el = getFirstElementOfNode(child);
            if (el) {
                return el;
            }
        }
    }
    return null;
}

/**
 * The Dropdown component allows to define a menu that will
 * show itself when a target is toggled.
 *
 * Items are defined using DropdownItems. Dropdowns are
 * also allowed as items to be able to create nested
 * dropdown menus.
 */
export class Dropdown extends Component {
    static template = xml`<t t-slot="default"/>`;
    static components = {};
    static props = {
        menuClass: { optional: true },
        position: { type: String, optional: true },
        slots: {
            type: Object,
            shape: {
                default: { optional: true },
                content: { optional: true },
            },
        },

        items: {
            optional: true,
            type: Array,
            elements: {
                type: Object,
                shape: {
                    label: String,
                    onSelected: Function,
                    class: { optional: true },
                    "*": true,
                },
            },
        },

        /* To be used with useChildRef */
        menuRef: { type: Function, optional: true },
        enabled: { type: Boolean, optional: true },
        holdOnHover: { type: Boolean, optional: true },
        options: { type: Object, optional: true },

        beforeOpen: { type: Function, optional: true },
        onOpened: { type: Function, optional: true },
        onStateChanged: { type: Function, optional: true },

        /** Manual state handling, @see useDropdown */
        state: {
            type: Object,
            shape: {
                isOpen: Boolean,
                close: Function,
                open: Function,
                "*": true,
            },
            optional: true,
        },
    };
    static defaultProps = {
        menuClass: "",
        holdOnHover: false,
        options: {
            navigation: {},
            popover: {},
        },
        enabled: true,
        state: undefined,
    };

    setup() {
        this.popover = useService("popover");
        this.menuRef = this.props.menuRef || useChildRef();

        this.state = this.props.state || useDropdown();
        this.nesting = useDropdownNesting(this.state);
        this.group = useDropdownGroup();
        this.navigation = useNavigation(this.menuRef, {
            itemsSelector: ":scope .o-navigable, :scope .o-dropdown",
            focusInitialElementOnDisabled: () => !this.group.isInGroup,
            ...this.nesting.navigationOptions,
            ...this.props.options.navigation,
            hotkeys: {
                ...this.nesting.navigationOptions.hotkeys,
                ...(this.props.options.navigation?.hotkeys ?? {}),
            },
        });

        this.DIRECTION_CLASS = {
            bottom: "dropdown",
            top: "dropup",
            left: "dropstart",
            right: "dropend",
        };

        // As the popover is in another context we need to force
        // its re-rendering when the dropdown re-renders
        this.renderRef = {};
        onRendered(() => this.renderRef.render?.());

        onMounted(() => this.onStateChanged(this.state));
        effect((state) => this.onStateChanged(state), [this.state]);

        useEffect(
            (target) => this.setTargetElement(target),
            () => [this.target]
        );

        useEffect(
            (enabled) => {
                if (!enabled) {
                    this.closePopover();
                }
            },
            () => [this.props.enabled]
        );
    }

    /** @type {string} */
    get position() {
        return this.props.position || (this.hasParent ? "right-start" : "bottom-start");
    }

    /** @type {boolean} */
    get hasParent() {
        return this.nesting.hasParent;
    }

    /** @type {HTMLElement|null} */
    get target() {
        const target = getFirstElementOfNode(this.__owl__.bdom);
        if (target) {
            return target;
        } else {
            throw new Error(
                "Could not find a valid dropdown toggler, prefer a single html element and put any dynamic content inside of it."
            );
        }
    }

    /** @type {boolean} */
    get isControlled() {
        return this.props.state && this.props.state.mode == "controlled";
    }

    handleClick(event) {
        if (!this.props.enabled) {
            return;
        }

        // event.stopPropagation();
        if (this.state.isOpen && !this.hasParent) {
            // this.state.close();
        } else {
            this.state.open();
        }
    }

    handleMouseEnter() {
        if (!this.props.enabled) {
            return;
        }

        if (this.hasParent || this.group.isOpen) {
            this.target.focus();
            this.state.open();
        }
    }

    onStateChanged(state) {
        if (state.isOpen) {
            this.openPopover();
        } else if (!state.isOpen) {
            this.closePopover();
        }
        this.props.onStateChanged?.(state.isOpen);
    }

    setTargetElement(target) {
        if (!target) {
            return;
        }

        target.ariaExpanded = false;
        target.classList.add("o-dropdown");

        if (this.hasParent) {
            target.classList.add("o-dropdown--has-parent");
        }

        const tagName = target.tagName.toLowerCase();
        if (!["input", "textarea", "table", "thead", "tbody", "tr", "th", "td"].includes(tagName)) {
            target.classList.add("dropdown-toggle");
            if (this.hasParent) {
                target.classList.add("o-dropdown-item", "o-navigable", "dropdown-item");

                if (!target.classList.contains("o-dropdown--no-caret")) {
                    target.classList.add("o-dropdown-caret");
                }
            }
        }

        this.defaultDirection = this.position.split("-")[0];
        this.setTargetDirectionClass(this.defaultDirection);

        if (!this.isControlled) {
            target.addEventListener("click", this.handleClick.bind(this));
            target.addEventListener("mouseenter", this.handleMouseEnter.bind(this));

            return () => {
                target.removeEventListener("click", this.handleClick.bind(this));
                target.removeEventListener("mouseenter", this.handleMouseEnter.bind(this));
            };
        }
    }

    setTargetDirectionClass(direction) {
        if (!this.target) {
            return;
        }
        for (const _direction in this.DIRECTION_CLASS) {
            this.target.classList[_direction === direction ? "add" : "remove"](
                this.DIRECTION_CLASS[_direction]
            );
        }
    }

    async openPopover() {
        if (this._closePopover !== undefined || status(this) !== "mounted") {
            return;
        }
        if (!this.target || !this.target.isConnected) {
            this.state.close();
            return;
        }

        const props = {
            beforeOpen: () => this.props.beforeOpen?.(),
            onOpened: () => this.onOpened(),
            onClosed: () => this.onClosed(),
            env: this.__owl__.childEnv,
            renderRef: this.renderRef,
            items: this.props.items,
            slots: this.props.slots,
        };

        const options = {
            popoverClass: mergeClasses("o-dropdown--menu dropdown-menu", this.props.menuClass),
            popoverRole: "menu",
            arrow: false,
            animation: true,
            setActiveElement: false,
            position: this.position,
            ref: this.menuRef,
            closeOnEscape: false, // Handled via navigation and prevents closing root of nested dropdown
            onClose: () => this.state.close(),
            onPositioned: (el, { direction }) => {
                this.setTargetDirectionClass(direction);
            },
            holdOnHover: this.props.holdOnHover,
        };

        this._closePopover = this.popover.add(this.target, DropdownPopover, props, options);
        this.renderRef.render?.();
    }

    closePopover() {
        this._closePopover?.();
        this._closePopover = undefined;
        this.navigation.disable();
    }

    onOpened() {
        this.props.onOpened?.();
        this.navigation.enable();
        if (this.target) {
            this.target.ariaExpanded = true;
            this.target.classList.add("show");
        }
    }

    onClosed() {
        if (this.target) {
            this.target.ariaExpanded = false;
            this.target.classList.remove("show");
            this.setTargetDirectionClass(this.defaultDirection);
        }
    }
}
