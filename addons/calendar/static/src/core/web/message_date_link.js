/**
 * POC: dates written in a chatter message ("Friday 4:30 pm", "28th 5pm", "Nov 28 at 5pm",
 * "28/11 17:00", "tomorrow 10am", "16:30") become
 * clickable. A click opens the calendar quick create prefilled with the date, the mentioned
 * partners and the record the message is posted on. Saving just closes the dialog.
 * Every message also gets a "Schedule Meeting" action doing the same without a prefilled date.
 */
import { Message } from "@mail/core/common/message";
import { registerMessageAction } from "@mail/core/common/message_actions";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { deserializeDateTime, serializeDateTime } from "@web/core/l10n/dates";
import { localization } from "@web/core/l10n/localization";
import { CalendarEventQuickCreateFormViewDialog } from "@calendar/views/calendar_form/calendar_event_quick_create";

const { DateTime } = luxon;

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAY = `(?:${DAYS.join("|")})`;
const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const ORD = "(?:st|nd|rd|th)";
// the "when" part: "today", "Friday", "28th", "the 28th", "Nov 28", "28 November", "28/11", "Friday 28th"
const WHEN = [
    String.raw`(?:${WEEKDAY},?\s+)?(?:the\s+)?(?:${MONTH}\s+\d{1,2}${ORD}?|\d{1,2}${ORD}?\s+(?:of\s+)?${MONTH})`,
    String.raw`(?:${WEEKDAY},?\s+)?\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?`,
    String.raw`(?:${WEEKDAY},?\s+)?(?:the\s+)?\d{1,2}${ORD}`,
    `today|tomorrow|${WEEKDAY}`,
].join("|");
const TIME = String.raw`\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)|(?:[01]?\d|2[0-3]):[0-5]\d`;
// "<when> [at] <time>" or "<time> [on] <when>" or "<time>" alone (a time is mandatory)
const DATE_REGEX = new RegExp(
    String.raw`\b(?:(${WHEN})\s*,?\s+(?:at\s+)?)?(${TIME})(?:\s*,?\s+(?:on\s+)?(${WHEN}))?\b`,
    "gi"
);
const LINK_CLASS = "o-calendar-DateLink";

/**
 * @param {string} when e.g. "Friday", "28th", "Nov 28", "28/11", or undefined (= the day of `now`)
 * @param {string} time e.g. "4:30 pm", "16:30", "10am"
 * @param {DateTime} now reference date (when the message was posted)
 * @returns {DateTime|null} null when the text is not a valid date (e.g. "31/02")
 */
export function resolveDate(when, time, now = DateTime.now()) {
    const [, hourStr, minuteStr, meridiem] = time.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    let hour = parseInt(hourStr);
    if (meridiem) {
        hour = (hour % 12) + (meridiem.toLowerCase() === "pm" ? 12 : 0);
    }
    const base = now.set({ hour, minute: parseInt(minuteStr || 0), second: 0, millisecond: 0 });
    when = (when || "today").toLowerCase();
    let match;
    // explicit day + month: "Nov 28", "28th of November", "28/11" -> next occurrence of it
    let day, month, year;
    if ((match = when.match(/([a-z]+)\.?\s+(\d{1,2})/)) && MONTHS.includes(match[1].slice(0, 3))) {
        [month, day] = [MONTHS.indexOf(match[1].slice(0, 3)) + 1, match[2]];
    } else if ((match = when.match(/(\d{1,2})[a-z]*\s+(?:of\s+)?([a-z]+)/)) && MONTHS.includes(match[2].slice(0, 3))) {
        [day, month] = [match[1], MONTHS.indexOf(match[2].slice(0, 3)) + 1];
    } else if ((match = when.match(/(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?/))) {
        // day/month order follows the user's language date format
        const dayFirst = localization.dateFormat.indexOf("d") < localization.dateFormat.indexOf("M");
        [day, month] = dayFirst ? [match[1], match[2]] : [match[2], match[1]];
        if (parseInt(month) > 12 && parseInt(day) <= 12) {
            [day, month] = [month, day]; // "28/11" is unambiguous whatever the language
        }
        year = match[3] && (match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3]));
    }
    if (month) {
        let date = base.set({ year: year || base.year, month: parseInt(month), day: parseInt(day) });
        if (date.month !== parseInt(month) || date.day !== parseInt(day)) {
            return null; // e.g. 31/02
        }
        if (!year && date < now) {
            date = date.plus({ years: 1 });
        }
        return date;
    }
    // day of month only: "28th" -> next 28th (this month, or the next one having it)
    if ((match = when.match(/(\d{1,2})(?:st|nd|rd|th)/))) {
        day = parseInt(match[1]);
        for (let i = 0; i < 13; i++) {
            const monthStart = base.startOf("month").plus({ months: i });
            if (day <= monthStart.daysInMonth) {
                const date = monthStart.set({ day, hour: base.hour, minute: base.minute });
                if (date >= now) {
                    return date;
                }
            }
        }
        return null;
    }
    if (when === "tomorrow") {
        return base.plus({ days: 1 });
    }
    const weekday = DAYS.indexOf(when);
    if (weekday !== -1) {
        // upcoming occurrence of that weekday (same day only if the time is still ahead)
        let delta = (weekday + 1 - now.weekday + 7) % 7;
        if (delta === 0 && base <= now) {
            delta = 7;
        }
        return base.plus({ days: delta });
    }
    return base; // "today" or time only
}

/** Wraps every date found in the text of `bodyEl` into a clickable span. */
function linkifyDates(bodyEl, now) {
    const walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.parentElement.closest(`a, code, pre, blockquote, .${LINK_CLASS}`)) {
            textNodes.push(node);
        }
    }
    for (const node of textNodes) {
        const text = node.textContent;
        const matches = [...text.matchAll(DATE_REGEX)];
        if (!matches.length) {
            continue;
        }
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        for (const match of matches) {
            const [full, whenBefore, time, whenAfter] = match;
            const date = resolveDate(whenBefore || whenAfter, time, now);
            if (!date) {
                continue;
            }
            fragment.append(text.slice(lastIndex, match.index));
            const span = document.createElement("span");
            span.className = `${LINK_CLASS} text-primary text-decoration-underline cursor-pointer`;
            span.setAttribute("role", "button");
            span.title = _t("Create a calendar event");
            span.dataset.start = serializeDateTime(date);
            span.textContent = full;
            fragment.append(span);
            lastIndex = match.index + full.length;
        }
        fragment.append(text.slice(lastIndex));
        node.replaceWith(fragment);
    }
}

/**
 * Opens the calendar quick create prefilled from `message`: record name as title, author +
 * mentioned partners as attendees, and the record as related document (which auto-creates
 * a Meeting activity on it).
 */
function openEventQuickCreate(env, message, start = false) {
    const thread = message.thread;
    const isRecord = thread && thread.model !== "discuss.channel";
    const store = message.store;
    const partnerIds = new Set([
        ...(store.self_user ? [store.self_user.partner_id.id] : []),
        ...message.partner_ids.map((partner) => partner.id),
    ]);
    env.services.dialog.add(CalendarEventQuickCreateFormViewDialog, {
        resModel: "calendar.event",
        title: _t("New Event"),
        size: "md",
        context: {
            form_view_ref: "calendar.view_calendar_event_form_quick_create",
            is_quick_create_form: true,
            default_name: isRecord ? thread.display_name : "",
            // stop must be given too: the form does not recompute it from a default start
            ...(start && {
                default_start: start,
                default_stop: serializeDateTime(deserializeDateTime(start).plus({ hours: 1 })),
            }),
            default_partner_ids: [...partnerIds],
            ...(isRecord && {
                default_res_model: thread.model,
                default_res_id: thread.id,
            }),
        },
    });
}

registerMessageAction("calendar-schedule-meeting", {
    // internal users, on messages/notes posted in a record chatter
    condition: ({ message, store }) =>
        !!store.self_user &&
        !!message.thread?.model &&
        message.thread.model !== "discuss.channel" &&
        (message.isNote || message.isDiscussion),
    icon: "calendar_add_on",
    name: _t("Schedule Meeting"),
    onSelected: ({ message, store }) => openEventQuickCreate(store.env, message),
    sequence: 80,
});

patch(Message.prototype, {
    prepareMessageBody(bodyEl) {
        if (bodyEl) {
            // relative words ("tomorrow", "Friday") are relative to when the message was posted
            linkifyDates(bodyEl, this.message.datetime || DateTime.now());
        }
        return super.prepareMessageBody(...arguments);
    },

    async onClick(ev) {
        const link = ev.target.closest(`.${LINK_CLASS}`);
        if (!link) {
            return super.onClick(...arguments);
        }
        ev.preventDefault();
        ev.stopPropagation();
        openEventQuickCreate(this.env, this.message, link.dataset.start);
    },
});
