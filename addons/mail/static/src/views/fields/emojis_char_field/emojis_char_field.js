/** @odoo-module **/

import { CharField, charField } from "@web/views/fields/char/char_field";
import { patch } from "@web/core/utils/patch";
import { EmojisFieldCommon } from "@mail/views/fields/emojis_field_common/emojis_field_common";
import { emojiMixin } from "@mail/views/fields/emojis_field_common/emojis_mixin";
import { registry } from "@web/core/registry";

import { useRef } from "@odoo/owl";

/**
 * Extension of the FieldChar that will add emojis support
 */
export class EmojisCharField extends CharField {
    setup() {
        super.setup();
        this.targetEditElement = useRef("input");
        this._setupOverride();
    }
}

patch(EmojisCharField.prototype, "emojis_char_field_mail_mixin", emojiMixin);
patch(EmojisCharField.prototype, "emojis_char_field_field_mixin", EmojisFieldCommon);
EmojisCharField.template = "mail.EmojisCharField";
EmojisCharField.components = { ...CharField.components };

export const emojisCharField = {
    ...charField,
    component: EmojisCharField,
    additionalClasses: [...(charField.additionalClasses || []), "o_field_text"],
};

registry.category("fields").add("char_emojis", emojisCharField);
