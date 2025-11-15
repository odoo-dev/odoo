import { formatDuration } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { statusBarField, StatusBarField } from "@web/views/fields/statusbar/statusbar_field";

export class StatusBarDurationField extends StatusBarField {
    static template = "mail.StatusBarDurationField";

    getAllItems() {
        const items = super.getAllItems();
        const durationTracking = this.props.record.data.duration_tracking || {};
        if (Object.keys(durationTracking).length && durationTracking.d) {
            const { s: activeStageValue, d: activeStageStartDate } = durationTracking;
            const oldDateUTC = new Date(activeStageStartDate.replace(" ", "T") + "Z");
            const nowUTC = new Date(new Date().toISOString());
            const currentElapsedSeconds = Math.floor((nowUTC - oldDateUTC) / 1000);

            for (const item of items) {
                let duration = durationTracking[item.value] || 0;
                if (activeStageValue === item.value) {
                    duration += currentElapsedSeconds;
                }
                if (duration > 0) {
                    item.shortTimeInStage = formatDuration(duration, false);
                    item.fullTimeInStage = formatDuration(duration, true);
                }
            }
        }
        return items;
    }
}

export const statusBarDurationField = {
    ...statusBarField,
    component: StatusBarDurationField,
    displayName: _t("Status with time"),
    supportedTypes: ["many2one"],
    fieldDependencies: [{ name: "duration_tracking", type: "JSON" }],
};

registry.category("fields").add("statusbar_duration", statusBarDurationField);
