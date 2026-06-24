import { Component, onMounted, props, proxy, signal, t } from "@odoo/owl";
import { validateHabitDraft } from "../utils/validation";

const ICON_OPTIONS = ["😊", "📖", "🚶", "💧", "🌍", "🧘", "💪", "🎯", "📝", "☕"];

export class HabitForm extends Component {
    static template = "habit_flow.HabitForm";
    props = props({
        mode: t.string(),
        habit: t.object().optional(),
        hasHabits: t.boolean(),
        onSave: t.function(),
        onCancel: t.function(),
    });

    setup() {
        const habit = this.props.habit;
        this.nameRef = signal.ref(HTMLInputElement);
        this.iconOptions = ICON_OPTIONS;
        this.draft = proxy({
            name: habit?.name || "",
            icon: habit?.icon || "😊",
            tagsText: habit?.tags?.join(", ") || "",
        });
        this.errors = proxy({});

        onMounted(() => {
            this.nameRef()?.focus();
        });
    }

    get title() {
        return this.props.mode === "edit" ? "Edit Habit" : "New Habit";
    }

    get submitLabel() {
        return this.props.mode === "edit" ? "Update Habit" : "Save Habit";
    }

    onSubmit(ev) {
        ev.preventDefault();
        const result = validateHabitDraft(this.draft);
        Object.keys(this.errors).forEach((key) => delete this.errors[key]);
        Object.assign(this.errors, result.errors);
        if (!result.isValid) {
            return;
        }
        this.props.onSave(result.values);
    }

    onCancel() {
        this.props.onCancel();
    }
}
