import { uuidv4 } from "@point_of_sale/utils";
import { getService, makeDialogMockEnv } from "@web/../tests/web_test_helpers";

export const setupPosEnv = async () => {
    // Do not change these variables, they are in accordance with the demo data
    odoo.pos_session_id = 1;
    odoo.pos_config_id = 1;
    odoo.from_backend = 0;
    odoo.access_token = uuidv4(); // Avoid indexedDB conflicts
    odoo.info = {
        db: "pos",
        isEnterprise: true,
    };

    await makeDialogMockEnv();

    /** @type {import("@point_of_sale/app/services/pos_store").PosStore} */
    const store = getService("pos");
    store.setCashier(store.user);

    return store;
};
