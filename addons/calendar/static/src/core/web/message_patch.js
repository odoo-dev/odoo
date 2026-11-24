import { findDates } from "@calendar/core/web/message_dates";
import { CalendarEventQuickCreateFormViewDialog } from "@calendar/views/calendar_form/calendar_event_quick_create";
import { Message } from "@mail/core/common/message";
import { registerMessageAction } from "@mail/core/common/message_actions";
import { resolveTimeZoneName } from "@mail/utils/common/dates";
import { serializeDateTime } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { user } from "@web/core/user";
import { renderToFragment } from "@web/core/utils/render";
import { patch } from "@web/core/utils/patch";

const { DateTime } = luxon;

/**
 * Opens the calendar quick create of an event about `message`: on its record (which then gets a
 * Meeting activity), with the current user, the author and the mentioned partners as attendees.
 *
 * @param {import("@web/env").OdooEnv} env
 * @param {import("models").Message} message
 * @param {Object} [defaults] e.g. default_start and default_stop
 */
function openEventQuickCreate(env, message, defaults = {}) {
    const thread = message.thread;
    const partnerIds = [
        user.partnerId,
        message.author_id?.id,
        ...message.partner_ids.map((partner) => partner.id),
    ];
    env.services.dialog.add(CalendarEventQuickCreateFormViewDialog, {
        resModel: "calendar.event",
        title: _t("New Event"),
        size: "md",
        context: {
            ...defaults,
            form_view_ref: "calendar.view_calendar_event_form_quick_create",
            is_quick_create_form: true,
            default_partner_ids: [...new Set(partnerIds.filter(Boolean))],
            ...(thread && thread.model !== "discuss.channel" && {
                default_name: thread.display_name,
                default_res_model: thread.model,
                default_res_id: thread.id,
            }),
        },
    });
}

registerMessageAction("schedule-meeting", {
    condition: ({ message, store, thread }) =>
        store.self_user &&
        thread?.model &&
        thread.model !== "discuss.channel" &&
        (message.isNote || message.isDiscussion),
    icon: "calendar_add_on",
    name: _t("Schedule Meeting"),
    onSelected: ({ message, owner }) => openEventQuickCreate(owner.env, message),
    sequence: 80,
});

patch(Message.prototype, {
    prepareMessageBody(bodyEl) {
        if (bodyEl && /\d|day\b|tomorrow|tmrw/i.test(bodyEl.textContent)) {
            this.linkifyDates(bodyEl);
        }
        return super.prepareMessageBody(...arguments);
    },

    /**
     * Makes the dates written in the message clickable. They are relative to when the message
     * was posted, and in the author's timezone when both the author and the reader are internal
     * users with different timezones: the reader's time is then shown next to the date.
     *
     * @param {HTMLElement} bodyEl
     */
    linkifyDates(bodyEl) {
        const author = this.message.author_id;
        const authorTz = author && !author.partner_share && resolveTimeZoneName(author.tz);
        const readerTz = resolveTimeZoneName(this.store.self?.tz);
        const authorNow = authorTz && this.message.datetime.setZone(authorTz);
        const convert =
            authorNow?.isValid && authorTz !== readerTz && ![authorTz, readerTz].includes("local");
        const now = convert ? authorNow : this.message.datetime;
        const walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        while (walker.nextNode()) {
            if (!walker.currentNode.parentElement.closest("a, code, pre, blockquote")) {
                textNodes.push(walker.currentNode);
            }
        }
        for (const node of textNodes) {
            const text = node.textContent;
            const dates = findDates(text, now);
            if (!dates.length) {
                continue;
            }
            const parts = [];
            let lastIndex = 0;
            for (const { index, text: dateText, date } of dates) {
                const readerDate = date.setZone(convert ? readerTz : "default");
                const sameDay = readerDate.toISODate() === date.toISODate();
                parts.push(
                    text.slice(lastIndex, index),
                    renderToFragment("calendar.MessageDateLink", {
                        text: dateText,
                        start: serializeDateTime(date),
                        stop: serializeDateTime(date.plus({ hours: 1 })),
                        title: _t(
                            "Schedule a meeting on %s",
                            readerDate.toLocaleString(DateTime.DATETIME_MED)
                        ),
                        readerTime:
                            convert &&
                            readerDate.toLocaleString(
                                sameDay ? DateTime.TIME_SIMPLE : DateTime.DATETIME_MED
                            ),
                    })
                );
                lastIndex = index + dateText.length;
            }
            node.replaceWith(...parts, text.slice(lastIndex));
        }
    },

    async onClick(ev) {
        const link = ev.target.closest(".o-calendar-MessageDateLink");
        if (!link) {
            return super.onClick(...arguments);
        }
        ev.stopPropagation();
        openEventQuickCreate(this.env, this.message, {
            default_start: link.dataset.start,
            default_stop: link.dataset.stop,
        });
    },
});
