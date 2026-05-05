import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";

export class PrintActionHandlerService {
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

    baseRequestParams(report) {
        return {
            method: "POST",
            body: this.base64Decode(report),
            signal: AbortSignal.timeout(30000),
        };
    }

    /**
     * Zebra printers host a web server that accepts print jobs
     * This server has not been updated to handle CORS preflight requests,
     * so we have to use "no-cors" mode and can't check the response status.
     */
    async zplPrint({ ip_address }, { report }, duplex) {
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

    async ePosPrint({ ip_address }, { report }, duplex) {
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

    getPrintMethod(type) {
        const map = {
            epos: this.ePosPrint.bind(this),
            zpl: this.zplPrint.bind(this),
        };
        return map[type];
    }

    async printJobs(printers, jobs, duplex) {
        const { notification } = this.services;
        let anySuccess = false;

        for (const job of jobs) {
            for (const printer of printers) {
                const print = this.getPrintMethod(job.type);
                const res = await print(printer, job, duplex);

                if (res.result) {
                    anySuccess = true;
                    break;
                }

                if (res.errorCode === "ERROR_WAIT_EJECT") {
                    await new Promise((r) => setTimeout(r, 1000));
                    continue;
                }
            }
        }

        if (!anySuccess) {
            notification.add(_t("Failed to print document. Falling back to default printing."), {
                type: "warning",
            });
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

        const success = await this.printJobs(printers, jobs, printerSettings.duplex);

        if (!success) {
            return false;
        }

        options.onClose?.();
        return true;
    }
}

function printActionHandler(action, options, { services }) {
    const service = new PrintActionHandlerService(services);
    return service.handle(action, options);
}

registry.category("ir.actions.report handlers").add("print_action_handler", printActionHandler);
