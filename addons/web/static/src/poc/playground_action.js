/** @odoo-module **/

import { registry } from "@web/core/registry";
import { View } from "@web/views/view";

const { Component, xml } = owl;

class PlaygroundAction extends Component {}
PlaygroundAction.components = {
    View: View,
};
PlaygroundAction.template = xml`
    <View type="'fields'" resModel="'fields.test_field'" />
`;
registry.category("actions").add("playground_action", PlaygroundAction);

function playgroundItem({ env }) {
    return {
        type: "item",
        description: "Playground",
        callback: () => {
            env.services.action.doAction("playground_action");
        },
    };
}
registry.category("debug").category("default").add("playgroundItem", playgroundItem);
