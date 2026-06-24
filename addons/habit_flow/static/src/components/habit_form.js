import { Component, onMounted, props, proxy, signal, t } from "@odoo/owl";

const ICON_OPTIONS = ["😊", "📖", "🚶", "💧", "🌍", "🧘", "💪", "🎯", "📝", "☕"];

export class HabitForm extends Component {
    static template = "habit_flow.HabitForm";
    props = props({
        mode: t.string(),
        habit: t.object().optional(),
        onSave: t.function(),
        onCancel: t.function(),
    });

    setup() {
        this.nameRef = signal.ref(HTMLInputElement);
        this.iconOptions = ICON_OPTIONS;
        this.draft = proxy({
            name: this.props.habit?.name || "",
            icon: this.props.habit?.icon || "😊",
            tagsText: this.props.habit?.tags?.join(", ") || "",
        });
        this.nameError = signal("");

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

		const name = this.draft.name.trim();
		if (!name) {
			this.nameError.set("Name is required.");
			return;
		}

		this.nameError.set("");
		this.props.onSave({
			name,
			icon: this.draft.icon,
			tags: this.draft.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
		});
	}

    onCancel() {
        this.props.onCancel();
    }
}
