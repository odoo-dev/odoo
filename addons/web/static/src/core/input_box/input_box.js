import { useForwardRefToParent } from "@web/core/utils/hooks";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { hasTouch } from "@web/core/browser/feature_detection";
import { browser } from "@web/core/browser/browser";
import { Component } from "@odoo/owl";

function _positionInputBoxOverlay(target) {
    const closestInputBox =
        target.closest(".o_input_box:not(.o_input_box .o_input_box)") ||
        target.querySelector(".o_input_box");
    if (!closestInputBox) {
        return;
    }
    const overlays = closestInputBox.querySelectorAll(`.o_input_box_overlay:is(:not(.d-none),${hasTouch() ? '[class*="d-touch-"]:not(.d-touch-none)' : ''})`);
    if (overlays.length === 0) {
        return;
    }
    const width = {
        end: 0,
        start: 0,
    };
    const gap = parseInt(
        getComputedStyle(closestInputBox).getPropertyValue("--inputbox-spacing-unit")
    );
    overlays.forEach((overlay) => {
        const length = overlay.clientWidth;
        const toAdd = length + gap;
        if (overlay.classList.contains("suffix")) {
            const offset = width.end > 0 ? ` + ${width.end}px` : "";
            overlay.style.right = `calc(var(--inputbox-overlay-padding-x) + var(--inputbox-overlay-padding-toggler) ${offset})`;
            width.end += toAdd;
        } else {
            const offset = width.start > 0 ? ` + ${width.start}px` : "";
            overlay.style.left = `calc((1.5 * var(--inputbox-overlay-padding-x)) ${offset})`;
            width.start += toAdd;
        }
        overlay.style.opacity = 1;
    });
    closestInputBox.style.setProperty("--inputbox-overlay-padding-prefix", width.start + "px");
    closestInputBox.style.setProperty("--inputbox-overlay-padding-suffix", width.end + "px");
    const inlineEl = closestInputBox.querySelector(".o_input_box_overlay.inline");
    if (inlineEl) {
        const inputEl = closestInputBox.querySelector(
            ".o_input, textarea, select, [contenteditable]"
        );
        if (inputEl && inputEl.value) {
            const length = inputEl.value.length;
            closestInputBox.style.setProperty(
                "--inputbox-overlay-inline-position",
                `calc(100% - (${length}px + ${
                    length * 0.5
                }rem) - var(--inputbox-overlay-size) - var(--inputbox-spacing-unit))`
            );
        }
    }
}

export function positionInputBoxOverlay(target) {
    if (target) {
        requestAnimationFrame(() => _positionInputBoxOverlay(target));
    }
}

export class InputBox extends Component {
    static template = "web.InputBox";
    static components = { Dropdown, DropdownItem };
    static defaultProps = {
        type: "text",
    };
    static props = {
        id: { type: String, optional: true },
        input: { type: Function, optional: true },
        overlayButtons: { type: Array, optional: true },
        placeholder: { type: String, optional: true },
        required: { type: Boolean, optional: true },
        type: { type: String, optional: true },
    };

    setup() {
        this.inputRef = useForwardRefToParent("input");
        this.hasTouch = hasTouch();
    }

    get overlayButtons() {
        if (this.props.overlayButtons) {
            return this.props.overlayButtons.map((btn) => ({
                ...btn,
                onSelected: btn.onSelected || (() => browser.open(btn.href))
            }));
        }
        return [];
    }

    get buttonClass() {
        return "o_input_box_overlay suffix btn btn-link";
    }
}
