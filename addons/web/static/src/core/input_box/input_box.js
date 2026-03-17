import { useForwardRefToParent } from "@web/core/utils/hooks";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { hasTouch } from "@web/core/browser/feature_detection";
import { browser } from "@web/core/browser/browser";
import { Component } from "@odoo/owl";
import { getVisibleElements } from "../utils/ui";

function _positionInputBoxOverlay(target) {
    const closestInputBox =
        target.closest(".o_input_box:not(.o_input_box .o_input_box)") ||
        target.querySelector(".o_input_box");
    if (!closestInputBox) {
        return;
    }
    const endOverlays = getVisibleElements(closestInputBox, `.o_input_box_overlay_end:not(.o_input_box_overlay_inline)`);
    const inlineOverlay = getVisibleElements(closestInputBox, `.o_input_box_overlay_inline`)[0];

    if (endOverlays.length < 2 && !inlineOverlay) {
        return;
    }
    
    let endPadding = 0;
    for (let i = endOverlays.length; i > 0; i--) {
        const overlay = endOverlays[i - 1];
        if (hasTouch() && overlay.classList.contains("btn-link")) {
            overlay.classList.add("btn-secondary");
            overlay.classList.remove("btn-link");
        }
        if (endOverlays.length === 1) {
            // no need to do the next processing
            return;
        }
        const offset = endPadding > 0 ? ` + ${endPadding}px` : "";
        overlay.style["inset-inline-end"] = `calc(var(--inputbox-overlay-padding-x) ${offset})`;
        endPadding += overlay.clientWidth + 8; //--inputbox-spacing-unit
    }
    closestInputBox.style.setProperty("--inputbox-overlay-end-size", endPadding + "px");
    if (inlineOverlay) {
            const inputEl = closestInputBox.querySelector(
                "input, button, textarea, select, [contenteditable]"
            );
            if (inputEl) {
                let inputLength = inputEl.value?.length || 0;
                let paddingSize = 0//const startPadding;
                if (closestInputBox.querySelector(".o_tag")) {
                    inputEl.style.minWidth = inlineOverlay.clientWidth + "px";
                    const tagsLength = closestInputBox.offsetWidth - inputEl.offsetWidth;
                    paddingSize += tagsLength;
                }
                if (inputLength || paddingSize) {
                    paddingSize += inlineOverlay.clientWidth;
                    closestInputBox.style.setProperty(
                        "--inputbox-overlay-inline-position",
                        `calc(${paddingSize}px + ${inputLength}ch + var(--inputbox-spacing-unit) + var(--inputbox-overlay-padding-toggler))`
                    );
                }
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
        return "o_input_box_overlay_end btn btn-link";
    }
}
