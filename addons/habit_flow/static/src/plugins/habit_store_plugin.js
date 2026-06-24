import {
    computed,
    effect,
    onWillDestroy,
    plugin,
    Plugin,
    signal,
} from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { user } from "@web/core/user";
import { session } from "@web/session";
import {
    getGlobalStats,
    getHabitMetrics,
    isDoneToday,
} from "../utils/habit_calculations";
import { todayISO } from "../utils/date_helpers";
import { DEFAULT_HABIT_ICON, normalizeTags } from "../utils/validation";
import { StoragePlugin } from "./storage_plugin";
import { services } from "@web/core/services";

const FILTERS = ["all", "done", "pending", "archived"];

function makeStorageKey() {
    return `habit_flow:${session.db || browser.location.host}:${user.userId || "anonymous"}:v1`;
}

function makeHabitId() {
    return `hf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanDateList(dates) {
    return [...new Set(Array.isArray(dates) ? dates.filter(Boolean) : [])].sort();
}

function normalizeStoredHabit(habit) {
    if (!habit || typeof habit !== "object" || !String(habit.name || "").trim()) {
        return null;
    }
    return {
        id: String(habit.id || makeHabitId()),
        name: String(habit.name).trim(),
        icon: String(habit.icon || "").trim() || DEFAULT_HABIT_ICON,
        tags: normalizeTags(habit.tags),
        archived: Boolean(habit.archived),
        createdDate: habit.createdDate || todayISO(),
        completionDates: cleanDateList(habit.completionDates),
    };
}

function serializeHabit(habit) {
    return {
        id: habit.id,
        name: habit.name,
        icon: habit.icon,
        tags: [...habit.tags],
        archived: habit.archived,
        createdDate: habit.createdDate,
        completionDates: [...habit.completionDates],
    };
}

export class HabitStorePlugin extends Plugin {
    static id = "habit_flow.store";
    static sequence = 20;

    habits = signal.Array([]);
    filters = signal.Object({ search: "", status: "all" });
    today = signal(todayISO());
    isFormOpen = signal(false);
    editingHabitId = signal(null);
    isLoaded = signal(false);

    activeHabits = computed(() => this.habits().filter((habit) => !habit.archived));

    archivedHabits = computed(() => this.habits().filter((habit) => habit.archived));

    hasAnyHabits = computed(() => this.habits().length > 0);

    isFormVisible = computed(() => this.isFormOpen() || !this.hasAnyHabits());

    formMode = computed(() => (this.editingHabitId() ? "edit" : "create"));

    formKey = computed(() => this.editingHabitId() || `create-${this.isFormOpen()}`);

    editingHabit = computed(() => {
        const editingId = this.editingHabitId();
        return this.habits().find((habit) => habit.id === editingId);
    });

    visibleHabits = computed(() => {
        const { search, status } = this.filters();
        const term = search.trim().toLowerCase();
        const today = this.today();
        return this.habits()
            .filter((habit) => {
                if (status === "archived" && !habit.archived) {
                    return false;
                }
                if (status !== "archived" && habit.archived) {
                    return false;
                }
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
            })
            .map((habit) => habit);
    });

    visibleHabitViewModels = computed(() =>
        this.visibleHabits().map((habit) => ({
            habit,
            metrics: getHabitMetrics(habit, this.today()),
        }))
    );

    stats = computed(() => getGlobalStats(this.activeHabits(), this.today()));

    filterCounts = computed(() => {
        const today = this.today();
        const activeHabits = this.activeHabits();
        return {
            all: activeHabits.length,
            done: activeHabits.filter((habit) => isDoneToday(habit, today)).length,
            pending: activeHabits.filter((habit) => !isDoneToday(habit, today)).length,
            archived: this.archivedHabits().length,
        };
    });

    bestHabit = computed(() => {
        let best = null;
        for (const habit of this.activeHabits()) {
            const metrics = getHabitMetrics(habit, this.today());
            if (!best || metrics.bestStreak > best.metrics.bestStreak) {
                best = { habit, metrics };
            }
        }
        return best;
    });

    setup() {
        this.storage = plugin(StoragePlugin);
        this.storageKey = makeStorageKey();
        this.load();

        const stopAutosave = effect(() => {
            if (!this.isLoaded()) {
                return;
            }
            const habits = this.habits().map(serializeHabit);
            if (habits.length) {
                this.storage.writeJSON(this.storageKey, habits);
            } else {
                this.storage.remove(this.storageKey);
            }
        });
        onWillDestroy(stopAutosave);

        const interval = browser.setInterval(() => {
            const nextToday = todayISO();
            if (nextToday !== this.today()) {
                this.today.set(nextToday);
            }
        }, 60000);
        onWillDestroy(() => browser.clearInterval(interval));
    }

    load() {
        const storedHabits = this.storage.readJSON(this.storageKey, []);
        const habits = (Array.isArray(storedHabits) ? storedHabits : [])
            .map(normalizeStoredHabit)
            .filter(Boolean);
        this.habits().splice(0, this.habits().length, ...habits);
        this.isLoaded.set(true);
        this.isFormOpen.set(!habits.length);
    }

    setSearch(search) {
        this.filters().search = search;
    }

    setFilter(status) {
        this.filters().status = FILTERS.includes(status) ? status : "all";
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
        this.isFormOpen.set(!this.hasAnyHabits());
    }

    addHabit(values) {
        this.habits().unshift({
            id: makeHabitId(),
            name: values.name,
            icon: values.icon,
            tags: values.tags,
            archived: false,
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
        if (index === -1) {
            return;
        }
        const currentHabit = this.habits()[index];
        this.habits().splice(index, 1, { ...currentHabit, ...updates });
    }

    toggleToday(habitId) {
        const habit = this.habits().find((item) => item.id === habitId);
        if (!habit) {
            return;
        }
        if (isDoneToday(habit, this.today())) {
            this.undoToday(habitId);
        } else {
            this.markDoneToday(habitId);
        }
    }

    markDoneToday(habitId) {
        const habit = this.habits().find((item) => item.id === habitId);
        if (!habit || isDoneToday(habit, this.today())) {
            return;
        }
        this.replaceHabit(habitId, {
            completionDates: cleanDateList([...habit.completionDates, this.today()]),
        });
    }

    undoToday(habitId) {
        const habit = this.habits().find((item) => item.id === habitId);
        if (!habit) {
            return;
        }
        this.replaceHabit(habitId, {
            completionDates: habit.completionDates.filter((date) => date !== this.today()),
        });
    }

    archiveHabit(habitId) {
        this.replaceHabit(habitId, { archived: true });
        if (this.editingHabitId() === habitId) {
            this.closeForm();
        }
    }

    unarchiveHabit(habitId) {
        this.replaceHabit(habitId, { archived: false });
    }

    clearLocalData() {
        this.storage.remove(this.storageKey);
        this.habits().splice(0, this.habits().length);
        this.filters().search = "";
        this.filters().status = "all";
        this.editingHabitId.set(null);
        this.isFormOpen.set(true);
    }
}

services.add(HabitStorePlugin);
