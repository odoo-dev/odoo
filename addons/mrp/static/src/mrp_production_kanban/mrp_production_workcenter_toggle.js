import { Component, t, useProps } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";

const STATE_LABELS = {
    blocked: _t("Blocked"),
    ready: _t("To Do"),
    progress: _t("In Progress"),
    cancel: _t("Cancelled"),
    done: _t("Done"),
};

/**
 * Footer of a manufacturing order card: the users working on its work orders,
 * and the status dropdown of these work orders (as on work order cards). When
 * grouped by work center, both apply to the work orders of the card's column.
 */
export class MrpProductionWorkcenterToggle extends Component {
    static template = "mrp.MrpProductionWorkcenterToggle";
    static components = { Dropdown, DropdownItem };
    props = useProps(standardWidgetProps);

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.colorIcons = {
            blocked: "text-bg-warning",
            ready: "text-bg-secondary",
            progress: "text-bg-info",
            cancel: "text-bg-danger",
            done: "text-bg-success",
        };
        this.stateLabels = STATE_LABELS;
    }

    get group() {
        const group = this.props.record.group;
        return group?.groupByField?.name === "workcenter_ids" ? group : null;
    }

    /** keys of the work centers the card is about: the column's one, or all */
    _workcenterKeys(byWorkcenter) {
        return this.group ? [String(this.group.value || 0)] : Object.keys(byWorkcenter);
    }

    get workingUsers() {
        const usersByWorkcenter = this.props.record.data.working_user_ids || {};
        const users = new Map();
        for (const key of this._workcenterKeys(usersByWorkcenter)) {
            for (const [id, name] of usersByWorkcenter[key] || []) {
                users.set(id, name);
            }
        }
        return [...users].map(([id, name]) => ({ id, name }));
    }

    /** @returns {{ ids: number[], state: string } | null} */
    get workorders() {
        const states = this.props.record.data.workcenter_states || {};
        const keys = this._workcenterKeys(states).filter((key) => states[key]);
        if (!keys.length) {
            return null;
        }
        const ids = keys.flatMap((key) => states[key].ids);
        const allStates = keys.map((key) => states[key].state);
        const state = ["progress", "ready", "blocked"].find((s) => allStates.includes(s));
        return { ids, state: state || allStates[0] };
    }

    get isVisible() {
        return (
            Boolean(this.workorders) &&
            !["draft", "done", "cancel"].includes(this.props.record.data.state)
        );
    }

    get statusColor() {
        return this.colorIcons[this.workorders?.state] || "";
    }

    async setState(state) {
        const record = this.props.record;
        const result = await this.orm.call("mrp.workorder", "set_state", [
            this.workorders.ids,
            state,
        ]);
        const reload = async () => {
            // the card may change columns: reload the whole view
            await record.model.root.load();
            record.model.notify();
        };
        if (result && typeof result === "object" && result.type) {
            return this.action.doAction(result, { onClose: reload });
        }
        await reload();
    }
}

registry.category("view_widgets").add("mrp_production_workcenter_toggle", {
    component: MrpProductionWorkcenterToggle,
    fieldDependencies: [
        { name: "state", type: "selection" },
        { name: "workcenter_states", type: "json" },
        { name: "working_user_ids", type: "json" },
    ],
});
