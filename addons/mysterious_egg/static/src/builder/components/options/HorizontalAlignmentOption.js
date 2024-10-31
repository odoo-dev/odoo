import { Component, useState, useSubEnv, EventBus } from "@odoo/owl";
import { defaultOptionComponents } from "../defaultComponents";

const alignClasses = [
    "align-items-start",
    "align-items-center",
    "align-items-end",
    "align-items-stretch",
];

export class HorizontalAlignmentOption extends Component {
    static template = "mysterious_egg.HorizontalAlignmentOption";
    static components = {
        ...defaultOptionComponents,
    };
    static props = {
        toolboxElement: Object,
    };
    setup() {
        this.state = useState(this.setState({}));
        this.env.editorBus.addEventListener("STEP_ADDED", () => {
            this.setState(this.state);
        });

        const exclusiveClassOptionsBus = new EventBus();

        const align = this.env.editor.shared.makePreviewableOperation((id) => {
            // Call the bus to remove all classes
            exclusiveClassOptionsBus.trigger("CLEANUP");
            // Add the correct one
            const rowEl = this.getRowElement();
            rowEl.classList.add(id);
        });
        this.verticalAlignementButtonProps = {
            activeState: this.state,
            isActive: (buttonId, activeState) => {
                console.warn("isActive", buttonId, activeState.verticalAlignement);
                console.warn(
                    `buttonId === activeState.verticalAlignement:`,
                    buttonId === activeState.verticalAlignement
                );
                return buttonId === activeState.verticalAlignement;
            },
            onClick: (buttonId) => align.commit(buttonId),
            onMouseenter: (buttonId) => {
                align.preview(buttonId);
            },
            onMouseleave: () => {
                align.revert();
            },
            cleanClass: (buttonId) => {
                const rowEl = this.getRowElement();
                rowEl.classList.remove(buttonId);
            }
        };
        useSubEnv({
            exclusiveClassOptionsBus,
        });
    }

    getRowElement() {
        return this.props.toolboxElement.querySelector(".row");
    }

    setState(object) {
        return Object.assign(object, {
            verticalAlignement: this.getAlignement(),
        });
    }
    getAlignement() {
        const row = this.getRowElement();
        // TODO: need to find a way to remove alignClasses
        for (const alignClass of alignClasses) {
            if (row.classList.contains(alignClass)) {
                return alignClass;
            }
        }
        return "align-items-start";
    }
}
