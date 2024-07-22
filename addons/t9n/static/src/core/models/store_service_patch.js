import { Record } from "@mail/core/common/record";
import { Store } from "@mail/core/common/store_service";

import { patch } from "@web/core/utils/patch";

patch(Store.prototype, {
    setup() {
        super.setup(...arguments);
        this.t9n = Record.one("t9n.App", {
            compute() {
                return {};
            },
        });
    },
});
