import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";

const LOCAL_STORAGE_KEY = "printer_settings";

const deliveryMethods = {
    async proxy(ip, payload, printerType) {
        const endpoints = {
            label_printer: "/print/label",
            office_printer: "/print/pdf",
        };

        const binary = atob(payload);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        const response = await fetch(`http://${ip}${endpoints[printerType]}`, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: bytes,
            signal: AbortSignal.timeout(15000),
            targetAddressSpace: "loopback",
        });

        if (!response.ok) {
            throw new Error(`Print failed for printer at ${ip}`);
        }
    },

    async directIp(ip, payload, printerType) {
        // for the direct IP print
        throw new Error("Direct IP printing not yet implemented");
    },
};

function getDeliveryMethod(printerType) {
    // for the direct IP add condition over here
    return deliveryMethods.proxy;
}

async function executePrint(env, reportId, printerIds, recordIds, reportData) {
    const { orm, notification, ui } = env.services;

    ui.block();
    try {
        const jobs = await orm.call("ir.actions.report", "generate_print_data", [
            reportId,
            printerIds,
            recordIds,
            reportData,
        ]);

        for (const job of jobs) {
            const deliver = getDeliveryMethod(job.printer.printer_type);
            await deliver(job.printer.ip, job.payload, job.printer.printer_type);
        }

        notification.add(_t("Printing completed"), { type: "success" });
        return true;
    } catch (error) {
        console.error(error);
        localStorage.removeItem(LOCAL_STORAGE_KEY + "_" + reportId);
        notification.add(_t("Printing failed: %s", error.message), { type: "danger" });
        return false;
    } finally {
        ui.unblock();
    }
}

async function selectPrinters(reportId, env, availablePrinterIds) {
    const { orm, action, ui } = env.services;

    const saved = localStorage.getItem(LOCAL_STORAGE_KEY + "_" + reportId);
    let selectedDevices = null;

    if (saved) {
        try {
            const { selectedDevices: savedIds, skipDialog } = JSON.parse(saved);
            if (savedIds?.every((id) => availablePrinterIds.includes(id))) {
                if (skipDialog) {
                    return savedIds;
                }
                selectedDevices = savedIds;
            }
        } catch {
            localStorage.removeItem(LOCAL_STORAGE_KEY + "_" + reportId);
        }
    }

    const wizard = await orm.call("ir.actions.report", "get_action_wizard_printers", [
        reportId,
        selectedDevices,
    ]);

    await action.doAction(wizard);

    const wasBlocked = ui.isBlocked;
    if (wasBlocked) {
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
                env.bus.removeEventListener("report-printer-selected", handler);
                if (wasBlocked) {
                    ui.block();
                }
            }
        };
        env.bus.addEventListener("report-printer-selected", handler);
    });
}

async function printReportHandler(action, options, env) {
    if (!action.printer_ids?.length) {
        return false;
    }

    const printerIds = await selectPrinters(action.id, env, action.printer_ids);
    if (!printerIds?.length) {
        return false;
    }

    const success = await executePrint(
        env,
        action.id,
        printerIds,
        action.context.active_ids.filter((e) => typeof e === "number"),
        action.data || {}
    );

    if (success) {
        options.onClose?.();
    }
    return success;
}

registry.category("ir.actions.report handlers").add("print_handler", printReportHandler);
