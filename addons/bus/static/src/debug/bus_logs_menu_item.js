import { Component, signal, usePlugin } from "@odoo/owl";

import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { BusLogsPlugin } from "@bus/debug/bus_logs_plugin";
import { BusPlugin } from "@bus/services/bus_plugin";

export class BusLogsMenuItem extends Component {
    static components = { DropdownItem };
    static template = "bus.BusLogsMenuItem";

    downloadButtonRef = signal.ref();

    busLogs = usePlugin(BusLogsPlugin);
    bus = usePlugin(BusPlugin);

    setup() {
        this.dialog = usePlugin(DialogPlugin);
    }

    onClickToggleLogging() {
        this.busLogs.toggleLogging();
    }

    onClickDownload() {
        this.dialog.add(ConfirmationDialog, {
            body: _t(
                "Bus logs contain confidential information and must only be shared with trusted recipients."
            ),
            title: _t("You're about to download the bus logs"),
            confirm: () => this.bus.downloadLogs(),
            cancel() {},
            confirmLabel: _t("Download"),
        });
    }
}

registry
    .category("debug")
    .category("default")
    .add("bus.download_logs", () => ({
        Component: BusLogsMenuItem,
        sequence: 550,
        section: "tools",
        type: "component",
    }));
