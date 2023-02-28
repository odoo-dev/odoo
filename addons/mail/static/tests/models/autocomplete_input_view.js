/** @odoo-module **/

import { Patch } from "@mail/legacy/model";

Patch({
    name: "AutocompleteInputView",
    recordMethods: {
        onSource(req, res) {
            this._super(req, res);
            this.messaging.messagingBus.trigger("o-AutocompleteInput-source");
        },
    },
});
