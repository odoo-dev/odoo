import { registry } from "@web/core/registry";
import { Base } from "@point_of_sale/app/models/related_models";
import { uuidv4 } from "@point_of_sale/utils";

const { DateTime } = luxon;

const _generateCode = () =>
    // In sync with `_generate_code` method of loyalty.card model
    "044" + uuidv4().slice(7, -18);

export class LoyaltyCard extends Base {
    static pythonModel = "loyalty.card";

    isExpired() {
        // If no expiration date is set, the card is not expired
        if (!this.expiration_date) {
            return false;
        }

        return DateTime.fromISO(this.expiration_date).toMillis() < DateTime.now().toMillis();
    }

    setup() {
        super.setup();
        if (!this.code) {
            this.code = _generateCode();
        }
    }
}

registry.category("pos_available_models").add(LoyaltyCard.pythonModel, LoyaltyCard);
