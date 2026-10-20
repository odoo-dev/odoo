import { PosPaymentTerminal } from "@point_of_sale/../tests/unit/data/pos_payment_terminal.data";

PosPaymentTerminal._records = [
    ...PosPaymentTerminal._records,
    {
        id: 4,
        payment_method_id: 4,
        sequence: 1,
    },
];
