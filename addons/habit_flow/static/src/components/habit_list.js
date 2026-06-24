import { Component, props, t } from "@odoo/owl";
import { HabitCard } from "./habit_card";

export class HabitList extends Component {
    static template = "habit_flow.HabitList";
    static components = { HabitCard };
    props = props({
        habits: t.array(),
        activeFilter: t.string(),
        hasAnyHabits: t.boolean(),
        onCreate: t.function(),
        onToggleToday: t.function(),
        onEdit: t.function(),
        onArchive: t.function(),
        onUnarchive: t.function(),
    });

    get emptyTitle() {
        if (!this.props.hasAnyHabits) {
            return "Create your first habit";
        }
        if (this.props.activeFilter === "archived") {
            return "No archived habits";
        }
        return "No habits match this view";
    }

    get emptyBody() {
        if (!this.props.hasAnyHabits) {
            return "HabitFlow keeps your habits in this browser only. Add a habit to start tracking.";
        }
        return "Try another filter, clear the search, or add a new habit.";
    }
}
