import { Component, useState, validate } from "@odoo/owl";
import { omit, pick } from "@web/core/utils/objects";

export class Toolbar extends Component {
    static template = "html_editor.Toolbar";
    static props = {
        class: { type: String, optional: true },
        toolbar: {
            type: Object,
            shape: {
                getSelection: Function,
                focusEditable: Function,
                state: {
                    type: Object,
                    shape: {
                        namespace: { type: String, optional: true },
                        buttonGroups: {
                            type: Array,
                            element: {
                                type: Object,
                                shape: {
                                    id: String,
                                    buttons: {
                                        type: Array,
                                        element: {
                                            type: Object,
                                            validate: (button) => {
                                                const base = {
                                                    id: String,
                                                    description: String,
                                                };
                                                if (button.Component) {
                                                    validate(button, {
                                                        ...base,
                                                        Component: Function,
                                                        props: { type: Object, optional: true },
                                                    });
                                                } else {
                                                    validate(button, {
                                                        ...base,
                                                        run: Function,
                                                        icon: { type: String, optional: true },
                                                        text: { type: String, optional: true },
                                                        isActive: Boolean,
                                                        isDisabled: Boolean,
                                                    });
                                                }
                                                return true;
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    };

    setup() {
        this.state = useState(this.props.toolbar.state);
    }

    onButtonClick(button) {
        button.run();
        this.props.toolbar.focusEditable();
    }
}

export const toolbarButtonProps = {
    title: [String, Function],
    getSelection: Function,
};

/** @typedef {import("@html_editor/core/user_command_plugin").UserCommand} UserCommand */
/** @typedef {import("./toolbar_plugin").ToolbarCommandItem} ToolbarCommandItem */
/** @typedef {import("./toolbar_plugin").ToolbarCommandButton} ToolbarCommandButton */

/**
 * @param {UserCommand} userCommand
 * @param {ToolbarCommandItem} toolbarItem
 * @returns {ToolbarCommandButton}
 */
export function composeToolbarButton(userCommand, toolbarItem) {
    return {
        ...pick(userCommand, "description", "icon", "isAvailable"),
        ...omit(toolbarItem, "commandId", "commandParams"),
        run: () => userCommand.run(toolbarItem.commandParams),
    };
}
