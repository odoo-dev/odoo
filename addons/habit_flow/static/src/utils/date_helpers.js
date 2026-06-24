// Converts a Date object to an ISO date string (YYYY-MM-DD).
export function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

// Returns the current date in ISO format (YYYY-MM-DD).
export function todayISO() {
    return toISODate(new Date());
}

export function parseISODate(isoDate) {
    const [year, month, day] = isoDate.split("-").map(Number);
    return new Date(year, month - 1, day);
}

// Adds a specified number of days to an ISO date string and returns the new date in ISO format.
export function addDaysISO(isoDate, days) {
    const date = parseISODate(isoDate);
    date.setDate(date.getDate() + days);
    return toISODate(date);
}

// Calculates the difference in days between two ISO date strings.
export function diffDaysISO(leftISO, rightISO) {
    const left = parseISODate(leftISO);
    const right = parseISODate(rightISO);
    return Math.round((left - right) / 86400000);
}
