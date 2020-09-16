/** @odoo-module alias=mail.viewFields.CharEmojis **/

import FieldEmojiCommon from 'mail.viewFieldMixins.emojisCommon';
import MailEmojisMixin from 'mail.widgetMixins.emojis';

import { FieldChar } from 'web.basic_fields';
import registry from 'web.field_registry';

/**
 * Extension of the FieldChar that will add emojis support
 */
const FieldCharEmojis = FieldChar.extend(
    MailEmojisMixin,
    FieldEmojiCommon,
);

registry.add('char_emojis', FieldCharEmojis);

export default FieldCharEmojis;
