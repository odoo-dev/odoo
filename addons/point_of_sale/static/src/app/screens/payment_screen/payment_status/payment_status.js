import { Component } from "@odoo/owl";
import { PriceFormatter } from "@point_of_sale/app/components/price_formatter/price_formatter";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { _t } from "@web/core/l10n/translation";
import { convertCurrency } from "@point_of_sale/app/models/utils/currency";

export class PaymentScreenStatus extends Component {
    static template = "point_of_sale.PaymentScreenStatus";
    static props = {
        order: Object,
    };
    static components = { PriceFormatter };

    setup() {
        this.pos = usePos();
    }

    get currentTip() {
        return this.pos.getTip();
    }

    get tipLabel() {
        let label = "Tip";
        if (this.currentTip.type === "percent") {
            label = _t(`Tip (%s%)`, this.currentTip.value);
        }
        return label;
    }

    get tipText() {
        return this.env.utils.formatCurrency(this.currentTip.amount);
    }

    get changeText() {
        return this.env.utils.formatCurrency(this.props.order.getChange());
    }

    get isComplete() {
        return this.isRemaining && this.order.orderHasZeroRemaining;
    }

    get isIncompleteAndPositive() {
        return !this.isComplete && this.order.remainingDue > 0;
    }

    get order() {
        return this.props.order;
    }

    get isRemaining() {
        const isNegative = this.order.totalDue < 0;
        const remainingDue = this.order.remainingDue;

        if ((isNegative && remainingDue > 0) || (!isNegative && remainingDue <= 0)) {
            return false;
        } else {
            return true;
        }
    }

    get statusText() {
        return this.isRemaining ? _t("Remaining") : _t("Change");
    }

    get showStatus() {
        return Boolean(this.order.remainingDue || this.order.change);
    }

    get paymentMethodsCurrency() {
        let currencyId = this.order.payment_ids?.[0]?.currency_id || this.pos.currency;
        const allSameCurrency = this.order.payment_ids.every(
            (line) => line.currency_id.id === currencyId.id
        );

        if (!allSameCurrency) {
            console.error("Not all payment lines share the same currency ID!");
            currencyId = this.order.currency;
            //empty the payment line ?
        }
        return currencyId;
    }

    get amountText() {
        const currency = this.paymentMethodsCurrency;
        if (!this.isRemaining) {
            return this.env.utils.formatCurrency(this.order.change, currency.id);
        } else {
            const remainingDue = convertCurrency(this.order.remainingDue, currency);
            return this.env.utils.formatCurrency(remainingDue, currency.id);
        }
    }
}
