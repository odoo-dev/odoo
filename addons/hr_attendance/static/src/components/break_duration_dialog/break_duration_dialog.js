import { Component, props, proxy, t, usePlugin } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { sprintf } from "@web/core/utils/strings";
import { NotificationPlugin } from "@web/core/notifications/notification_plugin";

export class BreakDurationDialog extends Component {
    static template = "hr_attendance.BreakDurationDialog";
    static components = { Dialog };
    props = props({
        employeeName: t.string().optional(),
        maxMinutes: t.number().optional(),
        // Returning false keeps the dialog open, for a duration the employee can correct.
        onConfirm: t.function(),
        close: t.function(),
    });

    setup() {
        this.notification = usePlugin(NotificationPlugin);
        this.state = proxy({ minutes: 0 });
        this.dialogTitle = _t("Break Duration");
        this.promptText = this.props.employeeName
            ? sprintf(
                  _t("Enter the total break duration (in minutes) for %s."),
                  this.props.employeeName
              )
            : _t("Enter the total break duration in minutes.");
    }

    async confirm() {
        const rawMinutes = this.state.minutes;
        const minutes = Number(rawMinutes);
        if (
            rawMinutes === "" ||
            !Number.isFinite(minutes) ||
            !Number.isInteger(minutes) ||
            minutes < 0
        ) {
            this.notification.add(_t("Enter a valid break duration in whole minutes."), {
                type: "danger",
            });
            return;
        }
        if (this.props.maxMinutes !== undefined && minutes > this.props.maxMinutes) {
            this.notification.add(_t("Breaks cannot be longer than the attendance time"), {
                type: "danger",
            });
            return;
        }
        if ((await this.props.onConfirm(minutes)) === false) {
            return;
        }
        this.props.close();
    }
}
