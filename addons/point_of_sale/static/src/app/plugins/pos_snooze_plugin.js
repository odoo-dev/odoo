import { onWillStart, Plugin, proxy, usePlugin } from "@odoo/owl";
import { services } from "@web/core/services";
import { _t } from "@web/core/l10n/translation";
import { serializeDateTime } from "@web/core/l10n/dates";
import { AlertDialog, ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import { PosDataPlugin } from "@point_of_sale/app/plugins/pos_data_plugin";
import { SnoozeDialog } from "@point_of_sale/app/components/popups/product_info_popup/snooze_dialog/snooze_dialog";
import { logPosMessage } from "@point_of_sale/app/utils/pretty_console_log";

const { DateTime } = luxon;

const CONSOLE_COLOR = "#F5B427";
const REFRESH_DELAY = 1000;

export class PosSnoozePlugin extends Plugin {
    // After PosDataPlugin (20), so the PoS data is loaded on start
    static sequence = 30;

    data = usePlugin(PosDataPlugin);
    dialog = usePlugin(DialogPlugin);

    setup() {
        this.snoozes = [];
        this.refreshTimeout = null;
        this.state = proxy({ activeSnoozes: [], snoozedProductIds: new Set() });
        onWillStart(() => this.loadSnoozes());
    }

    get config() {
        return this.data.models?.["pos.config"]?.get(odoo.pos_config_id);
    }

    async loadSnoozes() {
        if (!this.config) {
            return;
        }
        this.setSnoozes(this.config.pos_snooze_ids);
        this.data.models["pos.config"].addEventListener("update", (data) => {
            if (data.fields?.includes("pos_snooze_ids")) {
                this.setSnoozes(this.config.pos_snooze_ids);
            }
        });
        if (this.data.dataLoadedFromCache()) {
            try {
                const snoozes = await this.data.searchRead("pos.snooze", [
                    ["pos_config_id", "=", this.config.id],
                ]);
                const snoozedIds = new Set(snoozes.map((s) => s.id));
                const snoozeModel = this.data.models["pos.snooze"];
                const snoozetoDelete = snoozeModel
                    .getAll()
                    .filter((snooze) => !snoozedIds.has(snooze.id));
                snoozeModel.deleteMany(snoozetoDelete);
            } catch (error) {
                logPosMessage(
                    "PosSnoozePlugin",
                    "loadSnoozes",
                    `Error reading snoozes from server: ${error.message}`,
                    CONSOLE_COLOR,
                    [error]
                );
            }
        }
    }

    setSnoozes(snoozes) {
        this.snoozes = (snoozes || []).filter(Boolean);
        this.refresh();
    }

    refresh() {
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = null;

        const now = DateTime.now();
        this.state.activeSnoozes = this.snoozes.filter(
            ({ start_time, end_time }) => start_time <= now && (!end_time || end_time >= now)
        );
        this.state.snoozedProductIds = new Set(
            this.state.activeSnoozes.map((snooze) => snooze.raw.product_template_id)
        );

        // Refresh again at the next boundary: the earliest end of an active snooze
        // or the earliest start of a future one.
        const nowMs = now.toMillis();
        let earliestUpdate = Infinity;
        for (const snooze of this.state.activeSnoozes) {
            const endMs = snooze.end_time?.toMillis();
            if (endMs && endMs < earliestUpdate) {
                earliestUpdate = endMs;
            }
        }
        for (const snooze of this.snoozes) {
            const startMs = snooze.start_time.toMillis();
            if (startMs > nowMs && startMs < earliestUpdate) {
                earliestUpdate = startMs;
            }
        }
        if (earliestUpdate !== Infinity) {
            const delay = Math.max(0, earliestUpdate - nowMs);
            this.refreshTimeout = setTimeout(() => this.refresh(), delay + REFRESH_DELAY);
        }
    }

    getActiveSnooze(type, data = {}) {
        if (type === "product") {
            if (!data.product || !this.isProductSnoozed(data.product)) {
                return null;
            }
            return (
                this.state.activeSnoozes.find(
                    (snooze) => snooze.product_template_id?.id === data.product.id
                ) || null
            );
        }
        return this.state.activeSnoozes.find((snooze) => snooze.type === type) || null;
    }

    isProductSnoozed(product) {
        return this.state.snoozedProductIds.has(product.id);
    }

    async canAddProductToOrder(product, order) {
        if (!this.isProductSnoozed(product)) {
            return true;
        }
        const alreadyAdded = order.lines.some(
            (line) => line.product_id.product_tmpl_id.id === product.id
        );

        if (alreadyAdded) {
            return true;
        }

        return new Promise((resolve) => {
            this.dialog.add(AlertDialog, {
                title: _t("Warning"),
                body: _t("You are trying to add a snoozed product. Would you like to continue?"),
                confirmLabel: _t("Continue"),
                confirm: () => resolve(true),
                cancel: () => resolve(false),
            });
        });
    }

    getSnoozeCountdown(activeSnooze) {
        // This function will calculate and return [countdown, activeSoozeRecord]
        const now = DateTime.now();
        const endTime = activeSnooze.end_time;
        if (!endTime) {
            return [_t("Next session"), activeSnooze];
        }
        const diff = endTime.diff(now, ["hours", "minutes", "seconds"]);
        if (diff.as("seconds") <= 0) {
            return ["", undefined];
        }
        return [diff.toFormat("hh:mm:ss"), activeSnooze];
    }

    snoozeItem(serviceType, onCreation, extraPayload = {}) {
        this.dialog.add(SnoozeDialog, {
            name: serviceType,
            onSave: async (hours) => {
                const start_time = DateTime.now();
                const end_time = hours
                    ? serializeDateTime(start_time.plus({ hours: hours }))
                    : null;
                const payload = {
                    start_time: serializeDateTime(start_time),
                    end_time: end_time,
                    pos_config_id: this.config.id,
                    type: serviceType,
                    ...extraPayload,
                };
                const snoozedRecord = (await this.data.create("pos.snooze", [payload]))[0];
                await onCreation?.(snoozedRecord);
            },
        });
    }

    unSnoozeItem(snoozedItem, onUnsnooze) {
        this.dialog.add(ConfirmationDialog, {
            title: _t("Stop Snooze"),
            body: _t(
                "Do you want to stop the snooze early and make the %s available again immediately?",
                snoozedItem.type
            ),
            confirmLabel: _t("Yes"),
            confirm: async () => {
                this.data.delete("pos.snooze", [snoozedItem.id]);
                await onUnsnooze?.();
            },
            cancelLabel: _t("Cancel"),
            cancel: () => {},
        });
    }
}

services.add(PosSnoozePlugin);
