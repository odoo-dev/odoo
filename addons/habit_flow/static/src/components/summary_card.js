import { Component, props, t } from "@odoo/owl";

export class SummaryCard extends Component {
    static template = "habit_flow.SummaryCard";
    props = props({
        title: t.string(),
        icon: t.string(),
        slots: t.object().optional(),
    });
}
