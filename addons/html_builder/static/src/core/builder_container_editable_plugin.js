import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";

export class BuilderContainerEditablePlugin extends Plugin {
    static id = "builderContainerEditable";
    resources = {
        change_current_options_containers_listeners: this.restrictEditableArea.bind(this),
    };

    setup() {
        this.restrictedElements = new Map([
            ["mostOuterContainer", null],
            ["mostInnerContainer", null],
        ]);
    }

    destroy() {
        super.destroy();
        this.restoreRestrictedElements();
    }

    restoreRestrictedElements() {
        // restore the previous state of previously restricted elements
        this.restrictedElements.forEach((value) => {
            if (value) {
                if (value.contenteditable === null) {
                    value.element.removeAttribute("contenteditable");
                } else {
                    value.element.setAttribute("contenteditable", value.contenteditable);
                }
            }
        });
    }

    restrictEditableArea(optionsContainer) {
        if (!optionsContainer.length) {
            return;
        }

        this.restoreRestrictedElements();

        // store the current state
        const mostInnerContainerParentEl = optionsContainer.at(-1).element?.parentElement;
        const mostInnerContainerEl = optionsContainer.at(-1).element;

        if (!mostInnerContainerParentEl) {
            return;
        }

        this.restrictedElements.set("mostOuterContainer", {
            element: mostInnerContainerParentEl,
            contenteditable: mostInnerContainerParentEl.getAttribute("contenteditable"),
        });
        this.restrictedElements.set("mostInnerContainer", {
            element: mostInnerContainerEl,
            contenteditable: mostInnerContainerEl.getAttribute("contenteditable"),
        });

        // Restrict the editable area to the most inner container
        // set contenteditable to false on the parent element to block the selection
        // inside the inner container element
        mostInnerContainerParentEl.setAttribute("contenteditable", "false");
        mostInnerContainerEl.setAttribute("contenteditable", "true");
    }
}

registry
    .category("website-plugins")
    .add(BuilderContainerEditablePlugin.id, BuilderContainerEditablePlugin);
