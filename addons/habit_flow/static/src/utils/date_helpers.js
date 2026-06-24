export function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function todayISO() {
    return toISODate(new Date());
}

export function parseISODate(isoDate) {
    const [year, month, day] = isoDate.split("-").map(Number);
    return new Date(year, month - 1, day);
}

export function addDaysISO(isoDate, days) {
    const date = parseISODate(isoDate);
    date.setDate(date.getDate() + days);
    return toISODate(date);
}

export function diffDaysISO(leftISO, rightISO) {
    const left = parseISODate(leftISO);
    const right = parseISODate(rightISO);
    return Math.round((left - right) / 86400000);
}
