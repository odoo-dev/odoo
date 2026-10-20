import { PosPaymentTerminal } from "@point_of_sale/../tests/unit/data/pos_payment_terminal.data";

PosPaymentTerminal._records = [
    ...PosPaymentTerminal._records,
    {
        id: 71,
        payment_method_id: 7,
        sequence: 1,
    },
];
