import { PosPaymentMethod } from "@point_of_sale/../tests/unit/data/pos_payment_method.data";

PosPaymentMethod._records = [
    ...PosPaymentMethod._records,
    {
        id: 9,
        name: "Viva.com",
        type: "bank",
        image: false,
        sequence: 1,
        payment_method_type: "terminal",
        payment_provider: "viva_com",
        default_qr: false,
    },
];
