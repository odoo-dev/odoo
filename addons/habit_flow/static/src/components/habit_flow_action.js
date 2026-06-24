import { Component, plugin } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { ControlPanel } from "@web/search/control_panel/control_panel";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { HabitStorePlugin } from "../plugins/habit_store_plugin";
import { FilterBar } from "./filter_bar";
import { HabitForm } from "./habit_form";
import { HabitList } from "./habit_list";
import { StatsPanel } from "./stats_panel";

export class HabitFlowAction extends Component {
    static template = "habit_flow.HabitFlowAction";
    static components = {
        ControlPanel,
        HabitForm,
        FilterBar,
        HabitList,
        StatsPanel,
    };
    static props = { ...standardActionServiceProps };

    setup() {
        this.store = plugin(HabitStorePlugin);
    }

    onAddHabit() {
        this.store.openCreate();
    }

    onSaveHabit(values) {
        const habit = this.store.editingHabit();
        if (habit) {
            this.store.updateHabit(habit.id, values);
        } else {
            this.store.addHabit(values);
        }
    }
}

registry.category("actions").add("habit_flow.action", HabitFlowAction);
