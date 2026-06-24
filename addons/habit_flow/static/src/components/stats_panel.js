import { Component, props, t } from "@odoo/owl";
import { SummaryCard } from "./summary_card";

export class StatsPanel extends Component {
    static template = "habit_flow.StatsPanel";
    static components = { SummaryCard };
    props = props({
        stats: t.object(),
        bestHabit: t.or([t.object(), t.literal(null)]),
    });
}
