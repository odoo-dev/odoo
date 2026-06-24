import { addDaysISO, diffDaysISO } from "./date_helpers";

function uniqueSortedDates(dates) {
    return [...new Set(dates || [])].filter(Boolean).sort();
}

export function isDoneToday(habit, today) {
    return Boolean(habit.completionDates?.includes(today));
}

export function currentStreak(habit, today) {
    const completed = new Set(uniqueSortedDates(habit.completionDates));
    let cursor = completed.has(today) ? today : addDaysISO(today, -1);
    let streak = 0;

    while (completed.has(cursor)) {
        streak += 1;
        cursor = addDaysISO(cursor, -1);
    }
    return streak;
}

export function bestStreak(habit) {
    const dates = uniqueSortedDates(habit.completionDates);
    if (!dates.length) {
        return 0;
    }

    let best = 1;
    let run = 1;
    for (let index = 1; index < dates.length; index++) {
        if (diffDaysISO(dates[index], dates[index - 1]) === 1) {
            run += 1;
        } else {
            run = 1;
        }
        best = Math.max(best, run);
    }
    return best;
}

export function getHabitMetrics(habit, today) {
    return {
        doneToday: isDoneToday(habit, today),
        currentStreak: currentStreak(habit, today),
        bestStreak: bestStreak(habit),
    };
}

export function getGlobalStats(activeHabits, today) {
    const metrics = activeHabits.map((habit) => getHabitMetrics(habit, today));
    const activeHabitCount = activeHabits.length;
    const completedTodayCount = metrics.filter((metric) => metric.doneToday).length;
    const pendingTodayCount = Math.max(0, activeHabitCount - completedTodayCount);
    const todayCompletionPercentage = activeHabitCount
        ? Math.round((completedTodayCount / activeHabitCount) * 100)
        : 0;

    return {
        activeHabitCount,
        completedTodayCount,
        pendingTodayCount,
        todayCompletionPercentage,
        longestCurrentStreak: Math.max(0, ...metrics.map((metric) => metric.currentStreak)),
        activeStreakCount: metrics.filter((metric) => metric.currentStreak > 0).length,
    };
}
