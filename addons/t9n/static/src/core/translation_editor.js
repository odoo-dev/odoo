import { useState, Component } from "@odoo/owl";

import { MessageForm } from "@t9n/core/message_form";

import { useService } from "@web/core/utils/hooks";

export class TranslationEditor extends Component {
    static props = {};
    static components = { MessageForm };
    static template = "t9n.TranslationEditor";

    setup() {
        this.store = useState(useService("mail.store"));
    }

    get messages() {
        return this.store.t9n.activeResource.message_ids;
    }

    onClickMessage(message) {
        this.store.t9n.activeMessage = message;
    }
}
