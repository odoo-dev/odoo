/** @odoo-module **/

import { TestEPos } from "@point_of_sale/backend/test_epos/test_epos";
import { _t } from "@web/core/l10n/translation";
import { getTemplate } from "@web/core/templates";
import { createElement, append, createTextNode } from "@web/core/utils/xml";
import { patch } from "@web/core/utils/patch";

/**
 * Star webPRNT error codes per Star webPRNT documentation.
 * @see https://star-m.jp/products/s_print/sdk/webprnt/manual/en/_StarWebPrintResponseElement.htm
 */
const STAR_ERRORS = {
    "1100": _t("The Star printer is offline or an error occurred."),
    "2001": _t("The Star printer is busy. Please retry."),
    '3000': _t("The printer is being used by another application, or the connection has timed out."),
    '3001': _t("The Star printer does not support the requested operation."),
};

/**
 * Build Star webPRNT SendMessage request body using the same approach as
 * StarPrinter.starWebPrint in star_printer.js: layout template + root children
 * (initialization, text, cutpaper). Format:
 * <StarWebPrint><Request>&lt;root&gt;...&lt;/root&gt;</Request></StarWebPrint>
 */
function buildTestReceiptPayload() {
    const layout = getTemplate('pos_star_printer.StarWebPrintLayout');
    const layoutClone = layout.cloneNode(true);
    const [requestEl] = layoutClone.getElementsByTagName('Request');
    const root = createElement('root');
    const initializationEl = createElement('initialization');
    const textEl = createElement('text');
    append(textEl, createTextNode("This is a test receipt\n"));
    const cutpaperEl = createElement('cutpaper', {feed: 'true', type: 'partial'});
    append(root, [initializationEl, textEl, cutpaperEl]);
    const rootXml = root.outerHTML;
    append(requestEl, rootXml);
    return layoutClone.innerHTML;
}

function parseStarResponse(inner) {
    const parseContent = new DOMParser().parseFromString(inner, 'application/xml');
    const success = parseContent.querySelector('success').textContent.trim() === 'true';
    const code   = parseContent.querySelector('code').textContent.trim() || '0';
    const status = parseContent.querySelector('status').textContent.trim() || '';
    return { traderSuccess: success, traderCode: code, traderStatus: status };
}

patch(TestEPos.prototype, {
    async _printTo(printer_id = null) {
        const printer = await this.getPrinterDataEPos(printer_id);
        if (printer.printer_type === 'star_epos') {
            try {
                const protocol = printer.use_lna ? "http:" : "https:";
                const address = `${protocol}//${printer.printer_ip}/StarWebPRNT/SendMessage`;

                const result = await fetch(address, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'text/xml; charset=UTF-8',
                    },
                    body: buildTestReceiptPayload(),
                    signal: AbortSignal.timeout(3000),
                });
                const body = await result.text();
                const parsedBody = new DOMParser().parseFromString(body, 'application/xml');
                const responseContent = parsedBody.querySelector('Response').textContent.trim();
                const { traderSuccess, traderCode, traderStatus } = parseStarResponse(responseContent);
                if (!traderSuccess || traderCode !== '0') {
                    const errorMessage = STAR_ERRORS[traderCode] || _t("Failed to print a test receipt. Error code: %s. Check your printer.", traderCode);
                    this.notification.add(errorMessage, { type: 'warning' });
                } else {
                    this.notification.add(_t("Successfully printed a test receipt"), { type: 'info' });
                }
            } catch {
                this.notification.add(
                    _t(
                        "Failed to reach the printer. Check the configured IP. Make sure that the printer is online and you are on the same network. If using HTTPS, you may need to accept the printer certificate by visiting the printer URL in your browser."
                    ),
                    { type: 'danger' }
                );
            }
        }
        return await super._printTo(...arguments);
    },
});
