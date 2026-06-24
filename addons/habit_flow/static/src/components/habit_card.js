import { Component, props, t } from "@odoo/owl";

export class HabitCard extends Component {
    static template = "habit_flow.HabitCard";
    props = props({
        habit: t.object(),
        metrics: t.object(),
        onToggleToday: t.function(),
        onEdit: t.function(),
        onArchive: t.function(),
        onUnarchive: t.function(),
    });

    get streakClass() {
        if (this.props.metrics.currentStreak >= 7) {
            return "text-success";
        }
        if (this.props.metrics.currentStreak === 0) {
            return "text-danger";
        }
        return "text-primary";
    }
}
