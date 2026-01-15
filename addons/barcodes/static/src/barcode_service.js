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

        let currentTarget = null;
        let barcodeInput = makeBarcodeInput();

        function handleBarcode(barcode, target) {
            bus.trigger('barcode_scanned', {barcode,target});
            if (target.getAttribute('barcode_events') === "true") {
                const barcodeScannedEvent = new CustomEvent("barcode_scanned", { detail: { barcode, target } });
                target.dispatchEvent(barcodeScannedEvent);
            }
        }

        /**
         * check if we have a barcode, and trigger appropriate events
         */
        function checkBarcode() {
            let str = currentTarget?.value || barcodeInput.value;
            str = barcodeService.cleanBarcode(str);
            for (let scannedCode of str.split(RegExp(REGEX_END_CHARACTER)).filter(Boolean)) {
                handleBarcode(scannedCode, currentTarget);
            }
            barcodeInput.value = "";
            currentTarget = null;
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

            currentTarget = ev.target;
            if (currentTarget.getAttribute("barcode_events") === "true") {
                currentTarget.addEventListener('input', inputHandler);
            }

            if (document.activeElement && !document.activeElement.matches('input:not([type]), input[type="text"], textarea, [contenteditable], ' +
                '[type="email"], [type="number"], [type="password"], [type="tel"], [type="search"]')) {
                barcodeInput.focus();
                browser.requestAnimationFrame(() => barcodeInput.setAttribute("inputmode", "text"));
            }
        }

        function inputHandler(ev) {
            barcodeInput.setAttribute("inputmode", "none");

            clearTimeout(timeout);
            timeout = setTimeout(checkBarcode, barcodeService.maxTimeBetweenKeysInMs);

            if (ev.key.match(/(Enter|Tab)/)) {
                checkBarcode();
            };
        }

        whenReady(() => {
            document.body.appendChild(barcodeInput);
            barcodeInput.addEventListener('input', inputHandler);

            document.body.addEventListener('keydown', keydownHandler);
        });

        return {
            bus,
        };
    },
};

registry.category("services").add("barcode", barcodeService);
