/** @odoo-module **/

import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";

export class PrinterService {
    constructor(services) {
        this.services = services;
    }

    base64Decode(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder("utf-8").decode(bytes);
    }

    baseRequestParams(report, params = {}) {
        return {
            params,
            method: "POST",
            body: this.base64Decode(report),
            targetAddressSpace: "loopback",
            signal: AbortSignal.timeout(30000),
        };
    }

    async zplPrint({ ip_address }, duplex, { report }) {
        const params = {
            ...this.baseRequestParams(report),
            headers: {
                "Content-Length": report.length,
                "Content-Type": "text/plain; charset=utf-8",
            },
            mode: "no-cors",
        };

        try {
            await fetch(`http://${ip_address}/pstprnt`, params);
            return { result: true };
        } catch {
            return { result: false };
        }
    }

    async ePosPrint({ ip_address }, duplex, { report }) {
        try {
            const res = await fetch(
                `http://${ip_address}/cgi-bin/epos/service.cgi?devid=local_printer`,
                this.baseRequestParams(report)
            );
            const body = await res.text();
            const parser = new DOMParser();
            const parsedBody = parser.parseFromString(body, "application/xml");
            const response = parsedBody.querySelector("response");
            return {
                result: response.getAttribute("success") === "true",
                errorCode: response.getAttribute("code"),
            };
        } catch {
            return { result: false, errorCode: "" };
        }
    }

    async sendToPdfProxy({ ip_address }, duplex, { report }) {
        try {
            const response = await fetch(`http://${ip_address}/print/pdf`, {
                ...this.baseRequestParams(report, { duplex }),
                headers: { "Content-Type": "application/octet-stream" },
            });
            return { result: response.ok };
        } catch (error) {
            console.error(error);
            return { result: false };
        }
    }

    getPrintMethod(type) {
        const map = {
            epos: this.ePosPrint.bind(this),
            pdf: this.sendToPdfProxy.bind(this),
            zpl: this.zplPrint.bind(this),
        };
        return map[type];
    }

    async printJobs(printers, duplex, jobs) {
        const { notification } = this.services;
        let anySuccess = false;

        for (const job of jobs) {
            let jobPrinted = false;

            for (const printer of printers) {
                if (printer.type !== job.type) {
                    continue;
                }

                const print = this.getPrintMethod(job.type);
                const res = await print(printer, duplex, job, this.services);

                if (res.result) {
                    anySuccess = true;
                    jobPrinted = true;
                    break;
                }

                if (res.errorCode === "ERROR_WAIT_EJECT") {
                    await new Promise((r) => setTimeout(r, 1000));
                    continue;
                }
            }

            if (!jobPrinted) {
                notification.add(
                    _t("Failed to print one document. Falling back to default printing."),
                    { type: "warning" }
                );
                return false;
            }
        }

        return anySuccess;
    }

    async handle(action, options) {
        const printersCache = this.services.report_printers_cache;
        const { report_id, jobs } = action.context;

        if (!jobs?.length) {
            return false;
        }

        const printerSettings = await printersCache.getPrinterSettingsForReport(report_id);

        const printers = printerSettings?.selectedPrinters;

        if (!printers?.length) {
            return false;
        }

        const success = await this.printJobs(printers, printerSettings.duplex, jobs);

        if (!success) {
            return false;
        }

        options.onClose?.();
        return true;
    }
}

function printActionHandler(action, options, { services }) {
    const service = new PrinterService(services);
    return service.handle(action, options);
}

registry.category("ir.actions.report handlers").add("print_action_handler", printActionHandler);
