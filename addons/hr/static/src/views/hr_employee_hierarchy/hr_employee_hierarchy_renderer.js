import { usePlugin } from "@odoo/owl";

import { ActionPlugin } from "@web/webclient/actions/action_plugin";
import { HierarchyRenderer } from "@web_hierarchy/hierarchy_renderer";

export class HrEmployeeHierarchyRenderer extends HierarchyRenderer {
    static template = "hr.HrEmployeeHierarchyRenderer";
    static components = {
        ...HierarchyRenderer.components,
    };

    setup() {
        super.setup();
        this.action = usePlugin(ActionPlugin);
    }

    get employeesInCycleIds() {
        return this.props.model.nodesInCycle;
    }

    _displayEmployeesInCycle() {
        const { model } = this.props;
        const resModel = model.resModel;

        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: resModel,
            domain: [["id", "in", this.employeesInCycleIds]],
            views: [
                [false, "list"],
                [false, "form"],
            ],
            target: "current",
        });
    }
}
