import { Component } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { toolbarButtonProps } from "@html_editor/main/toolbar/toolbar";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
import { useDebounced } from "@web/core/utils/timing";
import { useDropdownAutoVisibility } from "@html_editor/dropdown_autovisibility_hook";
import { useChildRef } from "@web/core/utils/hooks";
import { IframeInput } from "@web/core/iframe_input/iframe_input";
import { useLayoutEffect, useState } from "@web/owl2/utils";

export const MAX_FONT_SIZE = 400;

export class FontSizeSelector extends Component {
    static template = "html_editor.FontSizeSelector";
    static props = {
        getItems: Function,
        getDisplay: Function,
        onFontSizeInput: Function,
        onSelected: Function,
        onBlur: { type: Function, optional: true },
        document: { validate: (p) => p.nodeType === Node.DOCUMENT_NODE },
        ...toolbarButtonProps,
    };
    static components = { Dropdown, DropdownItem, IframeInput };

    setup() {
        this.items = this.props.getItems();
        this.state = useState(this.props.getDisplay());
        this.dropdown = useDropdownState();
        this.menuRef = useChildRef();
        useDropdownAutoVisibility(this.env.overlayState, this.menuRef);
        this.iframeContentRef = useChildRef();
        this.fontSizeInputRef = useChildRef();
        this.debouncedCustomFontSizeInput = useDebounced(this.onCustomFontSizeInput, 200);

        useLayoutEffect(
            () => {
                if (this.fontSizeInput) {
                    // Focus input on dropdown open, blur on close.
                    if (this.dropdown.isOpen) {
                        this.fontSizeInput.select();
                    } else if (
                        this.iframeContentRef.el?.contains(this.props.document.activeElement)
                    ) {
                        this.fontSizeInput.blur();
                        this.props.onBlur?.();
                    }
                }
            },
            () => [this.dropdown.isOpen]
        );
    }

    get fontSizeInput() {
        return this.fontSizeInputRef.el;
    }

    onClickFontSizeInput() {
        if (!this.dropdown.isOpen) {
            this.dropdown.open();
        }
    }

    onCustomFontSizeInput(ev) {
        let fontSize = parseInt(ev.target.value, 10);
        if (fontSize > 0) {
            fontSize = Math.min(fontSize, MAX_FONT_SIZE);
            if (this.state.displayName !== fontSize) {
                this.props.onFontSizeInput(`${fontSize}px`);
            } else {
                // Reset input if state.displayName does not change.
                this.fontSizeInput.value = this.state.displayName;
            }
        }
        this.fontSizeInput.focus();
    }

    onKeyDownFontSizeInput(ev) {
        if (["Enter", "Tab"].includes(ev.key) && this.dropdown.isOpen) {
            this.dropdown.close();
        } else if (["ArrowUp", "ArrowDown"].includes(ev.key)) {
            const fontSizeSelectorMenu = document.querySelector(".o_font_size_selector_menu div");
            if (!fontSizeSelectorMenu) {
                return;
            }
            ev.target.blur();
            const fontSizeMenuItemToFocus =
                ev.key === "ArrowUp"
                    ? fontSizeSelectorMenu.lastElementChild
                    : fontSizeSelectorMenu.firstElementChild;
            if (fontSizeMenuItemToFocus) {
                fontSizeMenuItemToFocus.focus();
            }
        }
    }

    onSelected(item) {
        this.props.onSelected(item);
    }
}
