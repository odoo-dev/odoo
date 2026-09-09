import { electronicPaymentRegistry, PaymentMethod } from "@pos_payment_method/payment_method";

class PaymentMethodViva extends PaymentMethod {
    get supportsRefunds() {
        return true;
    }

    get supportsReversals() {
        return true;
    }

    get pollingIntervalMs() {
        return 5000;
    }
}

electronicPaymentRegistry.add("viva_com", PaymentMethodViva);
