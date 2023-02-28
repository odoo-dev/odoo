/** @odoo-module **/

import { one, Patch } from "@mail/legacy/model";

Patch({
    name: "Throttle",
    fields: {
        duration: {
            compute() {
                if (this.qunitTestOwner1) {
                    return 0;
                }
                if (this.qunitTestOwner2) {
                    return 1000;
                }
                return this._super();
            },
        },
        qunitTestOwner1: one("QUnitTest", {
            identifying: true,
            inverse: "throttle1",
        }),
        qunitTestOwner2: one("QUnitTest", {
            identifying: true,
            inverse: "throttle2",
        }),
    },
});
