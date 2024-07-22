import { Component, useState } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";

export class MessageForm extends Component {
    static props = {};
    static template = "t9n.MessageForm";

    setup() {
        this.state = useState({
            suggestedTranslationText: "",
        });
        this.store = useState(useService("mail.store"));
        this.orm = useService("orm");
        this.notification = useService("notification");
    }

    get message() {
        return this.store.t9n.activeMessage;
    }

    get translations() {
        return this.message.translationsInCurrentLanguage;
    }

    onClickClear() {
        this.state.suggestedTranslationText = "";
    }

    async onClickCopy(ev) {
        try {
            await navigator.clipboard.writeText(this.message.body.trim());
            this.notification.add(
                _t("Copied to clipboard!"),
                { type: "info" }
            );
        } catch (error) {
            console.error("Error copying text:", error);
        }
    }

    async onClickSuggest() {
        const data = await this.orm.call("t9n.translation", "create_and_format", [], 
            {
                body: this.state.suggestedTranslationText.trim(),
                source_id: this.store.t9n.activeMessage.id,
                lang_id: this.store.t9n.activeLanguage.id,
            },
        );

        this.store["t9n.translation"].insert(data);
        this.state.suggestedTranslationText = "";
    }
}
