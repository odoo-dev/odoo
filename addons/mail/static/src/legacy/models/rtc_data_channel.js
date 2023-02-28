/** @odoo-module **/

import { attr, one, Model } from "@mail/legacy/model";

Model({
    name: "RtcDataChannel",
    lifecycleHooks: {
        _willDelete() {
            this.dataChannel.close();
        },
    },
    fields: {
        dataChannel: attr({ required: true, readonly: true }),
        rtcSession: one("RtcSession", { identifying: true, inverse: "rtcDataChannel" }),
    },
});
