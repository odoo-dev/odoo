export const DEFAULT_HABIT_ICON = "😊";

export function normalizeTags(value) {
    const rawTags = Array.isArray(value) ? value : String(value || "").split(/[,\n]/);
    const seen = new Set();
    const tags = [];
    for (const rawTag of rawTags) {
        const tag = String(rawTag).trim();
        const key = tag.toLowerCase();
        if (!tag || seen.has(key)) {
            continue;
        }
        seen.add(key);
        tags.push(tag.slice(0, 24));
        if (tags.length === 6) {
            break;
        }
    }
    return tags;
}

export function validateHabitDraft(draft) {
    const name = String(draft.name || "").trim();
    const icon = String(draft.icon || "").trim() || DEFAULT_HABIT_ICON;
    const tags = normalizeTags(draft.tags ?? draft.tagsText);
    const errors = {};

    if (!name) {
        errors.name = "Habit name is required.";
    }

    return {
        isValid: !Object.keys(errors).length,
        errors,
        values: {
            name,
            icon,
            tags,
        },
    };
}
