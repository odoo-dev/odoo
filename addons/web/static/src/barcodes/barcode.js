/** @odoo-module **/
import { registry } from "@web/core/registry";
// ======= LEGACY =======
import { legacySetupProm } from "@web/legacy/legacy_setup";
import * as BarcodeEvents from "barcodes.BarcodeEvents";
// ----------------------

// TODO make configurable the termination suffix of the barcode scanner.
// FIXME For instance, if a barcode scanner uses "\r\n" as a suffix, we should
//       be able to comply with the fact that scanner would keydown "enter enter" in this case.
//       While support for this is not implemented, a barcode scanner that suffixes e.g. \r\n
//       would make this service intercept the first "enter" but the 2nd would get dispatched
//       by the hotkey service (unless other interception/reason).
// IDEA BOI : Do the same with a prefix ?
//            We would then be able to reject hotkey interception
//            immediately (only with a single keydown prefix) for
//            any other hotkey (obviously only if buffer is empty).
const TERMINATION_KEYS = [
    "enter", // \n or \r suffix would both send a "enter" keydown
    "tab", // \t suffix
];

export const barcodeService = {
    dependencies: ["hotkey"],
    start(env, { hotkey }) {
        const buffer = [];
        const maxTimeBetweenKeys = odoo.session_info.max_time_between_keys_in_ms || 55;
        // Regexp to match a barcode input and extract its payload
        // Note: to build in init() if prefix/suffix can be configured
        const regexp = /(.{3,})/;
        let promise;
        let resolver;
        let started = false;
        let timerHandler;

        hotkey.attachCapturer(hotkeyCapture);
        function hotkeyCapture(infos) {
            if (!started) {
                return { captured: false };
            }

            // Clear any pending timeout as we captured a new hotkey
            odoo.browser.clearTimeout(timerHandler);

            // Buffer is new ? Make a new promise.
            if (buffer.length === 0) {
                promise = new Promise((resolve) => (resolver = resolve));
                promise.then(cleanUp);
            }

            check(infos);

            return promise;
        }

        function check(infos) {
            const ev = infos._originalEvent;
            const isTerminationKey = TERMINATION_KEYS.includes(ev.key.toLowerCase());
            if (isTerminationKey) {
                // Verify buffer immediately
                verifyBuffer();
            } else {
                if (ev.key.length === 1) {
                    // Push onto buffer
                    buffer.push(ev);
                }
                // Wait a bit to see if further keys will arrive in buffer before verifying.
                timerHandler = odoo.browser.setTimeout(verifyBuffer, maxTimeBetweenKeys);
            }
        }

        function verifyBuffer() {
            const bufferStr = buffer.map((buf) => buf.key).join("");
            const match = bufferStr.match(regexp);
            if (match) {
                env.bus.trigger("barcode_scanned", match[1], buffer[0].target);
                resolver({ captured: true });
            } else {
                resolver({ captured: false });
            }
        }

        function cleanUp() {
            resolver = null;
            buffer.splice(0, buffer.length);
        }

        // ======= LEGACY =======
        legacySetupProm.then((legacyEnv) => {
            // Make sure the legacy barcode listener is stopped
            BarcodeEvents.BarcodeEvents.start = () => {
                console.log("I am disabled");
            };
            BarcodeEvents.BarcodeEvents.stop(); // fixme boi: find a proper way to block legacy barcodes
            env.bus.on("barcode_scanned", null, (barcode, target) => {
                // Forward barcode_scanned event to legacy core bus
                legacyEnv.bus.trigger("barcode_scanned", barcode, target);
            });
        });
        // ----------------------

        return {
            start: () => (started = true),
            stop: () => (started = false),
        };
    },
};

registry.category("services").add("barcode", barcodeService);
