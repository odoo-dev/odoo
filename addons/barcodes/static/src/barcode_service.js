import { browser } from "@web/core/browser/browser";
import { registry } from "@web/core/registry";
import { session } from "@web/session";
import { EventBus, whenReady } from "@odoo/owl";

function makeScanInput() {
    const inputEl = document.createElement('input');
    inputEl.setAttribute("style", "position:fixed;top:50%;transform:translateY(-50%);z-index:-1;opacity:0");
    inputEl.setAttribute("autocomplete", "off");
    inputEl.setAttribute("inputmode", "none"); // magic! prevent native keyboard from popping
    inputEl.setAttribute('name', 'barcode');
    return inputEl;
}

const REGEX_END_CHARACTER = /[\n|\t|;]/;

export const barcodeService = {
    // Keys from a scanner are usually processed as quick as possible,
    // but some scanners can use an intercharacter delay (we support <= 50 ms)
    maxTimeBetweenKeysInMs: session.max_time_between_keys_in_ms || 150,

    start() {
        const bus = new EventBus();
        let timeout = null;
        let currentTarget = null;
        let scanInput = null;

        function handleScannedValue(scannedCode, target) {
            bus.trigger('barcode_scanned', {scannedCode, target});
            if (target.getAttribute('barcode_events') === "true") {
                target.dispatchEvent(new CustomEvent("barcode_scanned", {
                    detail: { scannedCode, target }
                }));
            }
        }

        /**
         * check if we have a scanned data, and trigger appropriate events
         */
        function checkScannedInputValue(ev) {
            let scannedData = scanInput.value;
            if (scannedData.length >= 3) {
                if (ev) {
                    ev.preventDefault();
                }
                for (let scannedCode of scannedData.split(RegExp(REGEX_END_CHARACTER)).filter(Boolean)) {
                    handleScannedValue(scannedCode, currentTarget);
                }
            }
            scanInput.value = "";
            currentTarget = null;
        }

        function keydownHandler(ev) {
            currentTarget = ev.target;
            if (document.activeElement && !document.activeElement.matches('input:not([type]), input[type="text"], textarea, [contenteditable], ' +
                '[type="email"], [type="number"], [type="password"], [type="tel"], [type="search"]')) {
                scanInput.focus();
                browser.requestAnimationFrame(() => scanInput.setAttribute("inputmode", "text"));
            }
        }

        function inputHandler() {
            scanInput.setAttribute("inputmode", "none");

            const isEndCharacter = scanInput.value.slice(-1).match(REGEX_END_CHARACTER);;

            clearTimeout(timeout);
            if (isEndCharacter) {
                checkScannedInputValue();
            } else {
                timeout = setTimeout(checkScannedInputValue, barcodeService.maxTimeBetweenKeysInMs);
            }
        }

        whenReady(() => {
            scanInput = makeScanInput();
            document.body.appendChild(scanInput);
            scanInput.addEventListener('input', inputHandler);

            document.body.addEventListener('keydown', keydownHandler);
        });

        return {
            bus,
        };
    },
};

registry.category("services").add("barcode", barcodeService);
