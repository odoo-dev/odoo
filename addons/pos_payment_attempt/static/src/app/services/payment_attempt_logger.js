import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

/**
 * Sends payment attempt updates to the server one call at a time, in the order they happened.
 * Calls made while offline are queued by the data service and replayed on reconnection; the
 * server ignores updates that would move an attempt backwards, so replays are harmless.
 */
export class PaymentAttemptLogger {
    constructor(pos) {
        this.pos = pos;
        this.chain = Promise.resolve();
    }

    log(entry) {
        this.chain = this.chain.then(() => this._send([entry]));
        return this.chain;
    }

    async _send(entries) {
        try {
            await this.pos.data.call(
                "pos.payment.attempt",
                "log_attempts_from_ui",
                [entries],
                {},
                true
            );
        } catch (error) {
            // Logging must never get in the way of the payment itself.
            console.warn("Could not log the payment attempt", entries, error);
        }
    }
}

const loggers = new WeakMap();

patch(PosStore.prototype, {
    get paymentAttemptLogger() {
        if (!loggers.has(this.data)) {
            loggers.set(this.data, new PaymentAttemptLogger(this));
        }
        return loggers.get(this.data);
    },
});
