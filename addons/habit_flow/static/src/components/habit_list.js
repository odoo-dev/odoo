import { Component, props, t } from "@odoo/owl";
import { HabitCard } from "./habit_card";

export class HabitList extends Component {
    static template = "habit_flow.HabitList";
    static components = { HabitCard };
    props = props({
        habits: t.array(),
        onToggleToday: t.function(),
        onEdit: t.function(),
        onArchive: t.function(),
        onUnarchive: t.function(),
    });
}
