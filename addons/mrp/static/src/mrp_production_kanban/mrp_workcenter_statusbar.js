import { Component, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

/**
 * Statusbar of the work centers a manufacturing order can go to (the field's
 * records), with all the ones it is currently at (`workcenter_ids`) highlighted.
 * Clicking a work center adds the order to it, or takes it out of it when the
 * order is already there (its work orders there are then done).
 */
export class MrpWorkcenterStatusbar extends Component {
    static template = "mrp.MrpWorkcenterStatusbar";
    props = useProps(standardFieldProps);

    setup() {
        this.orm = useService("orm");
    }

    get items() {
        const active = new Set(this.props.record.data.workcenter_ids.currentIds);
        // displayed right to left, as the statusbar
        return this.props.record.data[this.props.name].records
            .map((record) => ({
                id: record.resId,
                label: record.data.display_name,
                isActive: active.has(record.resId),
            }))
            .reverse();
    }

    get isDisabled() {
        const { record } = this.props;
        // the field itself is computed (readonly): moves are written through the ORM
        return !record.resId || ["done", "cancel"].includes(record.data.state);
    }

    async toggle(item) {
        const { record } = this.props;
        if (record.dirty && !(await record.save())) {
            return;
        }
        const command = item.isActive ? [3, item.id] : [4, item.id];
        await this.orm.write("mrp.production", [record.resId], { workcenter_ids: [command] });
        await record.load();
    }
}

registry.category("fields").add("mrp_workcenter_statusbar", {
    component: MrpWorkcenterStatusbar,
    // same layout and styling as the statusbar
    additionalClasses: ["o_field_statusbar"],
    supportedTypes: ["many2many"],
    relatedFields: [{ name: "display_name", type: "char" }],
    fieldDependencies: [
        { name: "workcenter_ids", type: "many2many", relation: "mrp.workcenter" },
        { name: "state", type: "selection" },
    ],
});
