import { addDaysISO, diffDaysISO } from "./date_helpers";

function uniqueSortedDates(dates) {
    return [...new Set(dates || [])].filter(Boolean).sort();
}

export function isDoneToday(habit, today) {
    return Boolean(habit.completionDates?.includes(today));
}

// Calculates the current streak of completed days for a habit, including today if it's completed.
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

// Calculates the best streak of completed days for a habit.
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
