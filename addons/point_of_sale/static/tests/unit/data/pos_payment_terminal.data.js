import { models } from "@web/../tests/web_test_helpers";

export class PosPaymentTerminal extends models.ServerModel {
    _name = "pos.payment.terminal";

    _load_pos_data_fields() {
        return ["id", "name", "payment_method_id", "sequence"];
    }
}
