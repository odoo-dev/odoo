import { electronicPaymentRegistry, PaymentMethod } from "@pos_payment_method/payment_method";

class PaymentMethodAdyen extends PaymentMethod {
    get supportsRefunds() {
        return false;
    }

    get supportsReversals() {
        return true;
    }

    get pollingIntervalMs() {
        return 5000;
    }
}

electronicPaymentRegistry.add("adyen", PaymentMethodAdyen);
