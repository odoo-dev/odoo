import { Component, plugin, providePlugins } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { ControlPanel } from "@web/search/control_panel/control_panel";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { HabitStorePlugin } from "../plugins/habit_store_plugin";
import { FilterBar } from "./filter_bar";
import { HabitCard } from "./habit_card";
import { HabitForm } from "./habit_form";

export class HabitFlowAction extends Component {
    static template = "habit_flow.HabitFlowAction";
    static components = {
        ControlPanel,
        HabitForm,
        FilterBar,
        HabitCard,
    };
    static props = { ...standardActionServiceProps };

    setup() {
        providePlugins([HabitStorePlugin]);
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
