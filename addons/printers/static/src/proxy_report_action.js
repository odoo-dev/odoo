import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";

const LOCAL_STORAGE_KEY = "proxy_printer_settings";

async function fetchData(orm, args) {
    return await orm.call("ir.actions.report", "get_pdf_bytes", args);
}

async function sendToProxy(job) {
    const { printer_type } = job.printer;
    switch (printer_type) {
        // add case for different printer types when needed, for now we only have one type
        default:
            throw new Error("Unsupported printer type: " + printer_type);
    }
}

/*
 *   Main Print Flow
 */
async function proxyPrintHandler(env, args) {
    const { orm, notification, ui } = env.services;
    const { reportId, activeRecordIds, reportData, printerId } = args;

    try {
        ui.block();

        const result = await fetchData(orm, [reportId, printerId, activeRecordIds, reportData]);

        for (const job of result) {
            await sendToProxy(job);
        }

        notification.add(_t("Printing started via local service"), {
            type: "success",
        });

        return true;
    } catch (error) {
        console.error(error);

        localStorage.removeItem(LOCAL_STORAGE_KEY + "_" + reportId);

        notification.add(_t("Printing failed via proxy"), {
            type: "danger",
        });

        return false;
    } finally {
        ui.unblock();
    }
}

export async function getSelectedPrinterForReport(reportId, env, printerIds) {
    const { orm, action, ui } = env.services;

    const data = localStorage.getItem(LOCAL_STORAGE_KEY + "_" + reportId);
    let printerId = null;

    if (data) {
        try {
            const { selectedDevices, skipDialog } = JSON.parse(data);
            if (skipDialog && printerIds.includes(selectedDevices)) {
                return selectedDevices;
            }
            printerId = selectedDevices;
        } catch {
            localStorage.removeItem(LOCAL_STORAGE_KEY + "_" + reportId);
        }
    }

    const wizard = await orm.call("ir.actions.report", "get_action_wizard_printers", [
        reportId,
        printerId,
    ]);

    await action.doAction(wizard);

    const uiWasBlocked = ui.isBlocked;
    if (uiWasBlocked) {
        ui.unblock();
    }

    return new Promise((resolve) => {
        const handler = (event) => {
            if (event.detail.reportId === reportId) {
                const settings = event.detail.deviceSettings;

                if (settings) {
                    localStorage.setItem(
                        LOCAL_STORAGE_KEY + "_" + reportId,
                        JSON.stringify(settings)
                    );
                }

                resolve(settings ? settings.selectedDevices : null);
                env.bus.removeEventListener("printer-selected-proxy", handler);

                if (uiWasBlocked) {
                    ui.block();
                }
            }
        };

        env.bus.addEventListener("printer-selected-proxy", handler);
    });
}

async function proxyReportActionHandler(action, options, env) {
    if (!action.printer_ids?.length) {
        return false;
    }

    const reportId = action.id;

    const printerId = await getSelectedPrinterForReport(reportId, env, action.printer_ids);

    if (!printerId) {
        return false;
    }

    const args = {
        reportId,
        activeRecordIds: action.context.active_ids.filter((e) => typeof e === "number"),
        reportData: action.data || {},
        printerId,
    };

    await proxyPrintHandler(env, args);

    options.onClose?.();
    return true;
}

registry
    .category("ir.actions.report handlers")
    .add("proxy_print_handler", proxyReportActionHandler);
