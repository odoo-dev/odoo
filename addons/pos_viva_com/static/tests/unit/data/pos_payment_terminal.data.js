import { PosPaymentTerminal } from "@point_of_sale/../tests/unit/data/pos_payment_terminal.data";

PosPaymentTerminal._records = [
    ...PosPaymentTerminal._records,
    {
        id: 9,
        payment_method_id: 9,
        sequence: 1,
    },
];
