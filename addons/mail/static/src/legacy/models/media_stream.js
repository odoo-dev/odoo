/** @odoo-module **/

import { attr, Model } from "@mail/legacy/model";

Model({
    name: "MediaStream",
    lifecycleHooks: {
        _willDelete() {
            for (const track of this.webMediaStream.getTracks()) {
                track.stop();
            }
        },
    },
    fields: {
        id: attr({ identifying: true }),
        webMediaStream: attr({ required: true, readonly: true }),
    },
});
