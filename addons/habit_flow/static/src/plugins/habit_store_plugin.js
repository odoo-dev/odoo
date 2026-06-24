import {
    computed,
    effect,
    onWillDestroy,
    Plugin,
    signal,
} from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import {
    getHabitMetrics,
    isDoneToday,
} from "../utils/habit_calculations";
import { todayISO } from "../utils/date_helpers";

const HABIT_FLOW_LOCAL_STORAGE_KEY = "habit_flow.habits";

export class HabitStorePlugin extends Plugin {
    habits = signal.Array([]);
    filters = signal.Object({ search: "", status: "all" });
    today = signal(todayISO());

    isFormOpen = signal(false);
    editingHabitId = signal(null);
    formMode = computed(() => (this.editingHabitId() ? "edit" : "create"));

    editingHabit = computed(() => {
        const editingId = this.editingHabitId();
        return this.habits().find((habit) => habit.id === editingId);
    });

    visibleHabits = computed(() => {
        const { search, status } = this.filters();
        const term = search.trim().toLowerCase();
        const today = this.today();
        return this.habits().filter((habit) => {
            if (status === "done" && !isDoneToday(habit, today)) {
                return false;
            }
            if (status === "pending" && isDoneToday(habit, today)) {
                return false;
            }
            if (!term) {
                return true;
            }
            const tagText = habit.tags.join(" ").toLowerCase();
            return habit.name.toLowerCase().includes(term) || tagText.includes(term);
        });
    });

    visibleHabitViewModels = computed(() =>
        this.visibleHabits().map((habit) => ({
            habit,
            metrics: getHabitMetrics(habit, this.today()),
        }))
    );

    setup() {
        this.load();

        // Auto-save habits whenever the habits array changes.
        const stopAutosave = effect(() => {
            const habits = [...this.habits()];
            if (habits.length) {
                browser.localStorage.setItem(HABIT_FLOW_LOCAL_STORAGE_KEY, JSON.stringify(habits));
            } else {
                browser.localStorage.removeItem(HABIT_FLOW_LOCAL_STORAGE_KEY);
            }
        });
        onWillDestroy(stopAutosave);

        // Keep "today" fresh when the app stays open past midnight.
        const interval = browser.setInterval(() => {
            const nextToday = todayISO();
            if (nextToday !== this.today()) {
                this.today.set(nextToday);
            }
        }, 60000);
        onWillDestroy(() => browser.clearInterval(interval));
    }

    load() {
        const habits = JSON.parse(browser.localStorage.getItem(HABIT_FLOW_LOCAL_STORAGE_KEY) || "[]");
        this.habits().splice(0, this.habits().length, ...habits);
    }

    setSearch(search) {
        this.filters().search = search;
    }

    setFilter(status) {
        this.filters().status = status;
    }

    openCreate() {
        this.editingHabitId.set(null);
        this.isFormOpen.set(true);
    }

    openEdit(habitId) {
        this.editingHabitId.set(habitId);
        this.isFormOpen.set(true);
    }

    closeForm() {
        this.editingHabitId.set(null);
        this.isFormOpen.set(false);
    }

    addHabit(values) {
        this.habits().unshift({
            id: window.crypto.randomUUID(),
            name: values.name,
            icon: values.icon,
            tags: values.tags,
            createdDate: this.today(),
            completionDates: [],
        });
        this.closeForm();
    }

    updateHabit(habitId, values) {
        this.replaceHabit(habitId, {
            name: values.name,
            icon: values.icon,
            tags: values.tags,
        });
        this.closeForm();
    }

    replaceHabit(habitId, updates) {
        const index = this.habits().findIndex((habit) => habit.id === habitId);
        const currentHabit = this.habits()[index];
        this.habits().splice(index, 1, { ...currentHabit, ...updates });
    }

    toggleToday(habitId) {
        const habit = this.habits().find((item) => item.id === habitId);
        const today = this.today();
        const completionDates = isDoneToday(habit, today)
            ? habit.completionDates.filter((date) => date !== today)
            : [...habit.completionDates, today];
        this.replaceHabit(habitId, { completionDates });
    }

    deleteHabit(habitId) {
        const index = this.habits().findIndex((habit) => habit.id === habitId);
        this.habits().splice(index, 1);
        if (this.editingHabitId() === habitId) {
            this.closeForm();
        }
    }
}
