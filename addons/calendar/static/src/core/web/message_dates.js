import { localization } from "@web/core/l10n/localization";

const { DateTime } = luxon;

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAY = String.raw`(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs?(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)`;
const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const ORD = "(?:st|nd|rd|th)";
// "today", "Friday", "the 28th", "Nov 28", "28 November", "28/11", "Friday 28th"
const WHEN = [
    String.raw`(?:${WEEKDAY},?\s+)?(?:the\s+)?(?:${MONTH}\s+\d{1,2}${ORD}?|\d{1,2}${ORD}?\s+(?:of\s+)?${MONTH})`,
    String.raw`(?:${WEEKDAY},?\s+)?\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?`,
    String.raw`(?:${WEEKDAY},?\s+)?(?:the\s+)?\d{1,2}${ORD}`,
    `today|tomorrow|tmrw|${WEEKDAY}`,
].join("|");
// "4:30 pm", "4.30pm", "10am", "16:30", "noon" (not "version 4.30pm")
const TIME = String.raw`(?<![\d.:])(?:(?:1[0-2]|0?[1-9])(?:[:.][0-5]\d)?\s*(?:am|pm)|(?:[01]?\d|2[0-3]):[0-5]\d|noon|midnight)`;
// "<when> [[at] <time>]" or "<time> [[on] <when>]"
const DATE_REGEX = new RegExp(
    String.raw`\b(?:(${WHEN})(?:\s*,?\s+(?:at\s+)?(${TIME}))?|(${TIME})(?:\s*,?\s+(?:on\s+)?(${WHEN}))?)\b`,
    "gi"
);
// without a time, only clear dates count (not "I sat down", "3rd attempt", "version 1.2")
const CLEAR_DATE_REGEX = new RegExp(
    String.raw`^(?:today|tomorrow|${WEEKDAYS.join("|")}|${WEEKDAY},?\s.*|the\s.*|.*${MONTH}.*|.*\d[/.]\d{2,4})$`,
    "i"
);

/**
 * Finds the dates written in `text` ("Friday 4:30 pm", "28th 5pm", "Nov 28", "tomorrow"...).
 *
 * @param {string} text
 * @param {DateTime} now the dates are relative to it, and in its timezone
 * @returns {{ index: number, text: string, date: DateTime }[]}
 */
export function findDates(text, now) {
    const dates = [];
    for (const match of text.matchAll(DATE_REGEX)) {
        const [, whenBefore, timeAfter, timeBefore, whenAfter] = match;
        const when = whenBefore || whenAfter;
        const time = timeAfter || timeBefore;
        const date = (time || CLEAR_DATE_REGEX.test(when)) && parseDate(when, time, now);
        if (date) {
            dates.push({ index: match.index, text: match[0], date });
        }
    }
    return dates;
}

/**
 * Returns the next occurrence, from `now`, of the day `when` at the time `time`.
 *
 * @param {string} [when] "Friday", "28th", "Nov 28", "28/11"... (default: today)
 * @param {string} [time] "4:30 pm", "16:30", "noon"... (default: now, rounded up to the half hour)
 * @param {DateTime} [now]
 * @returns {DateTime|null} null for an invalid date like "31/02"
 */
export function parseDate(when = "today", time = "", now = DateTime.now()) {
    let hour, minute;
    if (time) {
        const [, h, m = 0, meridiem] = time
            .toLowerCase()
            .replace("noon", "12:00")
            .replace("midnight", "0:00")
            .match(/(\d+)(?:[:.](\d+))?\s*(am|pm)?/);
        hour = meridiem ? (h % 12) + (meridiem === "pm" ? 12 : 0) : +h;
        minute = +m;
    } else {
        const clock = DateTime.now().setZone(now.zone);
        ({ hour, minute } = clock
            .startOf("hour")
            .plus({ minutes: Math.ceil(clock.minute / 30) * 30 }));
    }
    const base = now.set({ hour, minute, second: 0, millisecond: 0 });
    // "Friday, the 28th of Nov." -> "28 nov", "28.11" -> "28/11"
    const day = when
        .toLowerCase()
        .replace(new RegExp(String.raw`^${WEEKDAY},?\s+(?=.*\d)`), "")
        .replace(/(\d)(?:st|nd|rd|th)\b/, "$1")
        .replace(/(\d)\.(\d)/g, "$1/$2")
        .replace(/\b(?:the|of)\b|[,.]/g, " ")
        .replace("sept", "sep")
        .replace(/\s+/g, " ")
        .trim();
    if (day === "today") {
        return base;
    }
    if (day === "tomorrow" || day === "tmrw") {
        return base.plus({ days: 1 });
    }
    const weekday =
        /^[a-z]+$/.test(day) && WEEKDAYS.findIndex((name) => name.startsWith(day.slice(0, 3))) + 1;
    if (weekday) {
        // today only if the time is still ahead
        return base.plus({ days: (weekday - now.weekday + 7) % 7 || (base > now ? 0 : 7) });
    }
    if (/^\d+$/.test(day)) {
        // "28th": this month, or the next one having a 28th
        for (let i = 0; i < 3; i++) {
            const month = base.set({ day: 1 }).plus({ months: i });
            const date = month.set({ day: +day });
            if (date.month === month.month && date >= now) {
                return date;
            }
        }
        return null;
    }
    // "28 nov", "nov 28", "28/11", "28/11/2026": numeric order of the user's language first
    const { dateFormat } = localization;
    const numeric =
        dateFormat.indexOf("d") < dateFormat.indexOf("M") ? ["d/M", "M/d"] : ["M/d", "d/M"];
    const formats = ["d LLL", "d LLLL", "LLL d", "LLLL d"].concat(
        numeric.flatMap((format) => [format, `${format}/yyyy`, `${format}/yy`])
    );
    for (const format of formats) {
        const date = DateTime.fromFormat(day, format, { locale: "en", zone: now.zone });
        if (date.isValid) {
            const result = date.set({ hour, minute });
            return !format.includes("y") && result < now ? result.plus({ years: 1 }) : result;
        }
    }
    return null;
}
