/** @odoo-module **/

import { BasePrinter } from "@point_of_sale/app/utils/printer/base_printer";
import { _t } from "@web/core/l10n/translation";
import { getTemplate } from "@web/core/templates";
import { createElement, append, createTextNode } from "@web/core/utils/xml";

const STAR_ERRORS = {
    "1100": _t("The Star printer is offline or an error occurred."),
    "2001": _t("The Star printer is busy. Please retry."),
    '3000': _t("The printer is being used by another application, or the connection has timed out."),
    '3001': _t("The Star printer does not support the requested operation."),
    "PRINTER_NOT_REACHABLE": _t("The printer is not reachable. Please check the printer connection."),
};

/**
 * Transform a (potentially colored) canvas into a monochrome raster image.
 * Uses Floyd-Steinberg dithering (same as Epson printer).
 */
function canvasToRaster(canvas) {
    const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const errors = Array.from(Array(width), (_) => Array(height).fill(0));
    const rasterData = new Array(width * height).fill(0);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let oldColor, newColor;

            const idx = (y * width + x) * 4;
            oldColor =
                pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;

            oldColor += errors[x][y];
            oldColor = Math.min(255, Math.max(0, oldColor));

            if (oldColor < 128) {
                newColor = 0;
                rasterData[y * width + x] = 1;
            } else {
                newColor = 255;
                rasterData[y * width + x] = 0;
            }

            const error = oldColor - newColor;
            if (error) {
                if (x < width - 1) {
                    errors[x + 1][y] += (7 / 16) * error;
                }
                if (x > 0 && y < height - 1) {
                    errors[x - 1][y + 1] += (3 / 16) * error;
                }
                if (y < height - 1) {
                    errors[x][y + 1] += (5 / 16) * error;
                }
                if (x < width - 1 && y < height - 1) {
                    errors[x + 1][y + 1] += (1 / 16) * error;
                }
            }
        }
    }

    return rasterData.join('');
}

/**
 * Build Star webPRNT envelope from root children. Uses getTemplate + append + innerHTML
 * like ePOSPrint in epson_printer.js.
 * Body format: <buildStarWebPrintXml><Request>&lt;root&gt;...&lt;/root&gt;</Request></buildStarWebPrintXml>
 */
function buildStarWebPrintXml(rootChildren) {
    const layout = getTemplate('pos_star_printer.StarWebPrintLayout');
    if (!layout) {
        throw new Error("'StarWebPrintLayout' not loaded");
    }
    const layoutClone = layout.cloneNode(true);
    const [requestEl] = layoutClone.getElementsByTagName('Request');
    const rootEl = createElement('root');
    append(rootEl, rootChildren);
    const rootXml = rootEl.outerHTML;
    append(requestEl, createTextNode(rootXml));
    return layoutClone.innerHTML;
}

/**
 * Resize canvas to paper width (RECEIPT_WIDTH) keeping aspect ratio.
 * Returns a new canvas suitable for raster/bitimage.
 */
function resizeCanvasToPaperWidth(canvas, scaledWidth) {
    const canvasWidth = canvas.width || 1;
    const scaledHeight = Math.round((canvas.height * scaledWidth) / canvasWidth);
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = scaledWidth;
    resizedCanvas.height = scaledHeight;
    const ctx = resizedCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, scaledWidth, scaledHeight);
    return resizedCanvas;
}

/**
 * Base64 encode a raster image (1 bit per pixel, 8 pixels per byte).
 */
function encodeRaster(rasterData) {
    let encodedData = '';
    for (let i = 0; i < rasterData.length; i += 8) {
        const sub = rasterData.substr(i, 8);
        encodedData += String.fromCharCode(parseInt(sub, 2));
    }
    return btoa(encodedData);
}

/**
 * Create the raster data from a canvas and build Star webPRNT XML.
 * Resizes the canvas to paper width (RECEIPT_WIDTH) so the print matches the receipt.
 */
function processCanvas(canvas, scaledWidth) {
    if (canvas.width !== scaledWidth) {
        const resizedCanvas = resizeCanvasToPaperWidth(canvas, scaledWidth);
        canvas = resizedCanvas;
    }
    const rasterData = canvasToRaster(canvas);
    const encodedData = encodeRaster(rasterData);

    const initializationEl = createElement('initialization');
    const alignmentEl = createElement('alignment', { position: 'center' });
    const bitImageEl = createElement('bitimage', {
        width: String(canvas.width),
        height: String(canvas.height),
    });
    append(bitImageEl, createTextNode(encodedData));
    const cutpaperEl = createElement('cutpaper', { feed: 'true', type: 'partial' });
    return buildStarWebPrintXml([initializationEl, alignmentEl, bitImageEl, cutpaperEl]);
}

function parseStarResponse(responseContent) {
    const parseContent = new DOMParser().parseFromString(responseContent, 'application/xml');
    const success = parseContent.querySelector('success').textContent.trim() === 'true';
    const code   = parseContent.querySelector('code').textContent.trim() || '0';
    const status = parseContent.querySelector('status').textContent.trim() || '';
    return { traderSuccess: success, traderCode: code, traderStatus: status };
}

export class StarPrinter extends BasePrinter {
    setup({ printer }) {
        super.setup(...arguments);
        const protocol = printer.use_lna ? "http:" : "https:";
        this.url = `${protocol}//${printer.printer_ip}`;
        this.address = `${this.url}/StarWebPRNT/SendMessage`;
        this.receiptWidth = parseInt(printer.receipt_paper_width);
    }

    openCashbox() {
        const peripheralEl = createElement('Peripheral', { channel: '1', on: '200', off: '200' });
        this.sendPrintingJob(buildStarWebPrintXml([peripheralEl]));
    }

    /**
     * @override
     */
    async sendPrintingJob(payload) {
        // payload is either a HTMLCanvasElement or a string
        // if it is a HTMLCanvasElement, we need to process it to a string
        if (payload instanceof HTMLCanvasElement) {
            payload = processCanvas(payload, this.receiptWidth);
        }
        try {
            const result = await fetch(this.address, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml; charset=UTF-8',
                },
                body: payload,
                signal: AbortSignal.timeout(3000),
            });
            const body = await result.text();
            const parsedBody = new DOMParser().parseFromString(body, 'application/xml');
            const responseContent = parsedBody.querySelector('Response').textContent.trim();
            const { traderSuccess, traderCode, traderStatus } = parseStarResponse(responseContent);
            return {
                result: traderSuccess,
                errorCode: traderSuccess ? null : traderCode,
                status: traderStatus,
                canRetry: traderCode === '2001',
            };
        } catch {
            return {
                result: false,
                canRetry: true,
                errorCode: 'PRINTER_NOT_REACHABLE',
            };
        }
    }

    /**
     * @override
     */
    getActionError() {
        const printRes = super.getResultsError();
        if (window.location.protocol === 'https:') {
            printRes.message.body += _t(
                "If you are on a secure server (HTTPS) please make sure you manually accepted the certificate by accessing %s. ",
                this.url
            );
        }
        return printRes;
    }

    /**
     * Check if paper is near end per Star webPRNT SDK.
     * Status is a hex string; byte at chars 10-11, bit 4.
     */
    isPaperNearEnd(statusStr) {
        if (!statusStr || statusStr.length < 12) return false;
        const byte5 = parseInt(statusStr.substr(10, 2), 16);
        return (byte5 & 4) !== 0;
    }

    /**
     * Check if paper has run out per Star webPRNT SDK.
     * Status is a hex string; byte at chars 10-11, bit 8.
     */
    isPaperEnd(statusStr) {
        if (!statusStr || statusStr.length < 12) return false;
        const byte5 = parseInt(statusStr.substr(10, 2), 16);
        return (byte5 & 8) !== 0;
    }

    /**
     * @override
     */
    getResultsError(printResult) {
        const errorCode = printResult?.errorCode;
        const status = printResult?.status || "";
        let message;
        if (this.isPaperEnd(status)) {
            message = _t("The printer runs out of paper.");
        } else if (errorCode !== '0') {
            const errorMessage = STAR_ERRORS[errorCode] || _t(
                "Failed to print. Error code: %s. Check your printer.", errorCode
            );
            message = errorMessage;
        } else {
            message = _t("The Star printer returned an error with an unknown error.");
        }

        return {
            successful: false,
            errorCode: errorCode,
            status: status,
            message: {title: _t("Printing failed"), body: message},
            canRetry: printResult?.canRetry ?? false,
        };
    }

    getResultWarningCode(printResult) {
        const status = printResult?.status;
        if (!status) {
            return undefined;
        }
        if (this.isPaperNearEnd(status)) {
            return 'ROLL_PAPER_HAS_ALMOST_RUN_OUT';
        }
        return undefined;
    }
}
