import { getIframeAdjustedBoundingRect } from "@html_editor/utils/dom_info";
import { Component, signal, t, useOnChange, useProps } from "@odoo/owl";

/**
 * Shows the power buttons next to the empty block holding the selection.
 */
export class PowerButtonsOverlay extends Component {
    static template = "html_editor.PowerButtonsOverlay";
    props = useProps({
        powerButtons: t.array(),
        powerButtonsTarget: t.signal(),
        editable: t.object(),
    });
    powerButtonsContainerRef = signal.ref();

    setup() {
        useOnChange(
            () => [this.powerButtonsContainerRef(), this.props.powerButtonsTarget()],
            (powerButtonsContainer, powerButtonsTarget) => {
                if (powerButtonsContainer) {
                    this.showPowerButtons(powerButtonsContainer, powerButtonsTarget);
                }
            }
        );
    }

    showPowerButtons(powerButtonsContainer, powerButtonsTarget) {
        powerButtonsContainer.classList.add("invisible");
        if (!powerButtonsTarget) {
            return;
        }
        const { block, blockRect, direction, availability } = powerButtonsTarget;
        // Hide/show buttons based on their availability.
        for (const [index, isAvailable] of availability.entries()) {
            powerButtonsContainer.children[index].classList.toggle("d-none", !isAvailable);
        }
        this.setPowerButtonsPosition(powerButtonsContainer, block, blockRect, direction);
        powerButtonsContainer.classList.remove("invisible");
        powerButtonsContainer.setAttribute("dir", direction);
    }

    getPlaceholderWidth(block) {
        const hintText = block.getAttribute("o-we-hint-text");
        const cs = getComputedStyle(block);
        const canvas = this.canvas || (this.canvas = document.createElement("canvas"));
        const ctx = canvas.getContext("2d");
        ctx.font = cs.font;
        const width = ctx.measureText(hintText).width;
        return width;
    }

    /**
     * @param {HTMLElement} powerButtonsContainer
     * @param {HTMLElement} block
     * @param {DOMRect} blockRect
     * @param {string} direction
     */
    setPowerButtonsPosition(powerButtonsContainer, block, blockRect, direction) {
        // Resetting the position of the power buttons.
        const localOverlayRect = powerButtonsContainer.parentElement.getBoundingClientRect();
        const placeholderWidth = this.getPlaceholderWidth(block);
        let newButtonContainerLeft;
        const editableRect = getIframeAdjustedBoundingRect(this.props.editable);
        if (direction === "rtl") {
            newButtonContainerLeft =
                blockRect.right - localOverlayRect.left - placeholderWidth - 30;
            if (newButtonContainerLeft <= 0) {
                powerButtonsContainer
                    .querySelectorAll(".power_button:not(:last-child)")
                    .forEach((el) => el.classList.add("d-none"));
                newButtonContainerLeft =
                    blockRect.right - localOverlayRect.left - placeholderWidth - 30;
            }
            powerButtonsContainer.style.transform = "translateX(-100%)";
        } else {
            powerButtonsContainer.style.transform = "unset";
            newButtonContainerLeft = blockRect.left - localOverlayRect.left + placeholderWidth + 30;
            if (newButtonContainerLeft + powerButtonsContainer.offsetWidth > editableRect.right) {
                powerButtonsContainer
                    .querySelectorAll(".power_button:not(:last-child)")
                    .forEach((el) => el.classList.add("d-none"));
            }
        }
        powerButtonsContainer.style.left = newButtonContainerLeft + "px";
        powerButtonsContainer.style.top = blockRect.top - localOverlayRect.top + "px";
    }

    /**
     * @param {Function} commandFn
     */
    async applyCommand(commandFn) {
        const btns = [...this.powerButtonsContainerRef().querySelectorAll(".btn")];
        btns.forEach((btn) => btn.classList.add("disabled"));
        await commandFn();
        btns.forEach((btn) => btn.classList.remove("disabled"));
    }
}
