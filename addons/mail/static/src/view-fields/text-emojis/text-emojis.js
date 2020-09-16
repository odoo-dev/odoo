/** @odoo-module alias=mail.viewFields.text_emojis **/

import FieldEmojiCommon from 'mail.viewFieldMixins.emojisCommon';
import MailEmojisMixin from 'mail.widgetMixins.emojis';

import { FieldText } from 'web.basic_fields';
import registry from 'web.field_registry';

/**
 * Extension of the FieldText that will add emojis support
 */
const FieldTextEmojis = FieldText.extend(
    MailEmojisMixin,
    FieldEmojiCommon,
);

registry.add('text_emojis', FieldTextEmojis);

export default FieldTextEmojis;
