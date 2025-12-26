import { browser } from "@web/core/browser/browser";
import { registry } from "@web/core/registry";
import { session } from "@web/session";
import { EventBus, whenReady } from "@odoo/owl";

function makeBarcodeInput() {
    const inputEl = document.createElement('input');
    inputEl.setAttribute("style", "position:fixed;top:50%;transform:translateY(-50%);z-index:-1;opacity:0");
    inputEl.setAttribute("autocomplete", "off");
    inputEl.setAttribute("inputmode", "none"); // magic! prevent native keyboard from popping
    inputEl.setAttribute('name', 'barcode');
    return inputEl;
}

const REGEX_END_CHARACTER = /[\n|\t|;]/;

export const barcodeService = {
    // Keys from a barcode scanner are usually processed as quick as possible,
    // but some scanners can use an intercharacter delay (we support <= 50 ms)
    maxTimeBetweenKeysInMs: session.max_time_between_keys_in_ms || 150,

    cleanBarcode: function(barcode) {
        return barcode;
    },

    start() {
        const bus = new EventBus();
        let timeout = null;

        let barcodeInput = makeBarcodeInput();

        /**
         * check if we have a barcode, and trigger appropriate events
         */
        function checkBarcode() {
            let str = barcodeService.cleanBarcode(barcodeInput.value);
            for (let barcode of str.split(RegExp(REGEX_END_CHARACTER)).filter(Boolean)) {
                bus.trigger('barcode_scanned', {barcode});
            }
            barcodeInput.value = "";
        }

        function keydownHandler(ev) {
            // Ignore 'Shift', 'Escape', 'Backspace', 'Insert', 'Delete', 'Home', 'End', Arrow*, F*, Page*, ...
            // meta is often used for UX purpose (like shortcuts)
            // Notes:
            // - shiftKey is not ignored because it can be used by some barcode scanner for digits.
            // - altKey/ctrlKey are not ignored because it can be used in some barcodes (e.g. GS1 separator)
            const isSpecialKey = !['Control', 'Alt'].includes(ev.key) && (ev.key.length > 1 || ev.metaKey);
            // Don't catch non-printable keys
            if (isSpecialKey) {
                return;
            }

            if (document.activeElement && !document.activeElement.matches('input:not([type]), input[type="text"], textarea, [contenteditable], ' +
                '[type="email"], [type="number"], [type="password"], [type="tel"], [type="search"]')) {
                barcodeInput.focus();
                browser.requestAnimationFrame(() => barcodeInput.setAttribute("inputmode", "text"));
            }
        }

        function scanKeydownHandler(ev) {
            if (ev.key.match(/(Enter|Tab)/)) {
                clearTimeout(timeout);
                checkBarcode();
            };
        }

        function scanInputHandler() {
            barcodeInput.setAttribute("inputmode", "none");

            clearTimeout(timeout);
            timeout = setTimeout(checkBarcode, barcodeService.maxTimeBetweenKeysInMs);
        }

        whenReady(() => {
            document.body.appendChild(barcodeInput);

            document.body.addEventListener('keydown', keydownHandler);

            barcodeInput.addEventListener('keydown', scanKeydownHandler);
            barcodeInput.addEventListener('input', scanInputHandler);
        });

        return {
            bus,
        };
    },
};

registry.category("services").add("barcode", barcodeService);
