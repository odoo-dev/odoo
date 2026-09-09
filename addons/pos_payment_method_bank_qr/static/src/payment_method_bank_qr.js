import { electronicPaymentRegistry, PaymentMethod } from "@pos_payment_method/payment_method";

class PaymentMethodBankQr extends PaymentMethod {
    get supportsRefunds() {
        return false;
    }

    get supportsReversals() {
        return false;
    }

    get pollingIntervalMs() {
        return 0;
    }
}

electronicPaymentRegistry.add("bank_qr", PaymentMethodBankQr);
