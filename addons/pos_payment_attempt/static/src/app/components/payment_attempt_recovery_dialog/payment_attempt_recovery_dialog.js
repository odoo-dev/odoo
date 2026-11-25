import { Component, proxy, t, useProps } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { deserializeDateTime, formatDateTime } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

const PAID_STATES = ["success", "force_done"];

/**
 * Lists the terminal payments started on the order whose outcome never reached the POS
 * (e.g. the browser crashed while the customer was paying), so that the cashier checks them
 * instead of charging the customer a second time.
 */
export class PaymentAttemptRecoveryDialog extends Component {
    static template = "pos_payment_attempt.PaymentAttemptRecoveryDialog";
    static components = { Dialog };
    props = useProps({
        order: t.object(),
        attempts: t.array(),
        close: t.function(),
    });

    setup() {
        this.pos = usePos();
        this.state = proxy({
            attempts: this.props.attempts.map((attempt) => ({ ...attempt })),
            busy: {},
        });
    }

    isPaid(attempt) {
        return PAID_STATES.includes(attempt.state);
    }

    formatDate(value) {
        return value ? formatDateTime(deserializeDateTime(value)) : "";
    }

    formatAmount(amount) {
        return this.pos.formatCurrency(amount);
    }

    async run(attempt, method, args = []) {
        this.state.busy[attempt.id] = true;
        try {
            const [updated] = await this.pos.data.call("pos.payment.attempt", method, [
                [attempt.id],
                ...args,
            ]);
            Object.assign(attempt, updated);
            return updated;
        } finally {
            this.state.busy[attempt.id] = false;
        }
    }

    async checkStatus(attempt) {
        await this.run(attempt, "check_status_from_ui");
    }

    async dismiss(attempt) {
        await this.run(attempt, "mark_reviewed_from_ui");
        this.removeAttempt(attempt);
    }

    addAsPaid(attempt) {
        const order = this.props.order;
        const paymentMethod = this.pos.models["pos.payment.method"].get(attempt.payment_method_id);
        if (!paymentMethod || order.finalized) {
            return;
        }
        // Reuse the original line uuid so the server links the attempt to this payment.
        let line = order.payment_ids.find((payment) => payment.uuid === attempt.payment_uuid);
        if (!line) {
            line = this.pos.models["pos.payment"].create({
                uuid: attempt.payment_uuid,
                pos_order_id: order,
                payment_method_id: paymentMethod,
            });
        }
        line.update({
            transaction_id: attempt.name,
            card_no: attempt.card_no,
            card_brand: attempt.card_brand,
            payment_method_authcode: attempt.authcode,
        });
        line.setAmount(attempt.amount);
        line.setPaymentStatus("done");
        order.selectPaymentline(line);
        this.removeAttempt(attempt);
    }

    removeAttempt(attempt) {
        this.state.attempts = this.state.attempts.filter((a) => a.id !== attempt.id);
        if (!this.state.attempts.length) {
            this.props.close();
        }
    }

    get title() {
        return _t("Unfinished terminal payments");
    }
}
