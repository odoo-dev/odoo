/** @odoo-module **/

import { TextField, textField } from "@web/views/fields/text/text_field";
import { patch } from "@web/core/utils/patch";
import { EmojisFieldCommon } from "@mail/views/fields/emojis_field_common/emojis_field_common";
import { emojiMixin } from "@mail/views/fields/emojis_field_common/emojis_mixin";
import { registry } from "@web/core/registry";

/**
 * Extension of the FieldText that will add emojis support
 */
export class EmojisTextField extends TextField {
    setup() {
        super.setup();
        this.targetEditElement = this.textareaRef;
        this._setupOverride();
    }
}

patch(EmojisTextField.prototype, "emojis_char_field_mail_mixin", emojiMixin);
patch(EmojisTextField.prototype, "emojis_text_field_field_mixin", EmojisFieldCommon);
EmojisTextField.template = "mail.EmojisTextField";
EmojisTextField.components = { ...TextField.components };

export const emojisTextField = {
    ...textField,
    component: EmojisTextField,
    additionalClasses: [...(textField.additionalClasses || []), "o_field_text"],
};

registry.category("fields").add("text_emojis", emojisTextField);
