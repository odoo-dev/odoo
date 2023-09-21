/** @odoo-module **/
import { Component, xml, useChildSubEnv, onWillDestroy } from "@odoo/owl";

const GROUPS = new Map();

function getGroup(id) {
    if (!GROUPS.has(id)) {
        GROUPS.set(id, {
            group: new Set(),
            count: 1,
        });
    }
    return GROUPS.get(id).group;
}

function removeGroup(id) {
    const groupData = GROUPS.get(id);
    groupData.count--;
    if (groupData.count <= 0) {
        GROUPS.delete(id);
    }
}

export class DropdownGroup extends Component {
    static template = xml`<t t-slot="default"/>`;
    static props = {
        group: { type: String, optional: true },
        slots: Object,
    };

    setup() {
        if (this.props.group) {
            const group = getGroup(this.props.group);
            onWillDestroy(() => removeGroup(this.props.group));
            useChildSubEnv({ dropdownGroup: group });
        } else {
            useChildSubEnv({ dropdownGroup: new Set() });
        }
    }
}
