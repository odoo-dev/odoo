/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { AttendeeCalendarController } from "@calendar/views/attendee_calendar/attendee_calendar_controller";
import { user } from "@web/core/user";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { ConfirmationDialog, AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { onMounted } from "@odoo/owl";


patch(AttendeeCalendarController.prototype, {
    setup() {
        super.setup(...arguments);
        this.dialog = useService("dialog");
        this.notification = useService("notification");
        onMounted(() => {
                this.addCustomPillAndTooltip();
        });
    },

    addCustomPillAndTooltip() {
        const eventElements = document.querySelectorAll('.fc-event');
        eventElements.forEach(eventElement => {
            // Create a warning icon
            const warningIcon = document.createElement('span');
            warningIcon.className = 'warning-icon';
            warningIcon.style.cssText = 'position: absolute; top: 5px; right: 5px; color: red;'; // Adjust as needed
            warningIcon.innerHTML = '⚠️'; // You can use an SVG or an image instead

            // Append the warning icon to the event element
            eventElement.appendChild(warningIcon);

            // Ensure the tooltip is set for the entire event
            eventElement.setAttribute('title', "This event was created before you started synchronizing your calendar and therefore is not synchronized to avoid spamming attendees");
        });
    },

    async onMicrosoftSyncCalendar() {
        await this.orm.call(
            "res.users",
            "restart_microsoft_synchronization",
            [[user.userId]],
        );
        const syncResult = await this.model.syncMicrosoftCalendar();
        if (syncResult.status === "need_auth") {
            window.location.assign(syncResult.url);
        } else if (syncResult.status === "need_config_from_admin") {
            if (this.isSystemUser) {
                this.dialog.add(ConfirmationDialog, {
                    title: _t("Configuration"),
                    body: _t("The Outlook Synchronization needs to be configured before you can use it, do you want to do it now?"),
                    confirm: this.actionService.doAction.bind(this.actionService, syncResult.action),
                    confirmLabel: _t("Configure"),
                    cancel: () => {},
                    cancelLabel: _t("Discard"),
                });
            } else {
                this.dialog.add(AlertDialog, {
                    title: _t("Configuration"),
                    body: _t("An administrator needs to configure Outlook Synchronization before you can use it!"),
                });
            }
        } else {
            await this.model.load();
            this.render(true);
        }
    },

    async onStopMicrosoftSynchronization() {
        await this.orm.call(
            "res.users",
            "stop_microsoft_synchronization",
            [[user.userId]],
        );
        await this.model.load();
        this.render(true);
    },

    async onUnpauseMicrosoftSynchronization() {
        await this.orm.call(
            "res.users",
            "unpause_microsoft_synchronization",
            [[user.userId]],
        );
        await this.onStopMicrosoftSynchronization();
        this.render(true);
    }
});
