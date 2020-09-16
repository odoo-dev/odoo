/** @odoo-module alias=mail.viewFields.text_emojis **/

import field_registry from 'web.field_registry';
import { FieldMany2ManyTags } from 'web.relational_fields';
import form_common from 'web.view_dialogs';

const FieldMany2ManyTagsEmail = FieldMany2ManyTags.extend({
    tag_template: 'FieldMany2ManyTagsEmail',
    fieldsToFetch: {
        ...FieldMany2ManyTags.prototype.fieldsToFetch,
        email: { type: 'char' },
    },
    specialData: '_setInvalidMany2ManyTagsEmail',

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Open a popup for each invalid partners (without email) to fill the email.
     *
     * @private
     * @returns {Promise}
     */
    async _checkEmailPopup() {
        const popupDefs = [];
        let validPartners = [];
        // propose the user to correct invalid partners
        for (const resId of this.record.specialData[this.name].invalidPartnerIds) {
            const def = new Promise(
                (resolve, reject) => {
                    const pop = new form_common.FormViewDialog(this, {
                        context: this.record.context,
                        on_saved(record) {
                            if (record.data.email) {
                                validPartners.push(record.res_id);
                            }
                        },
                        res_id: resId,
                        res_model: this.field.relation,
                        title: "",
                    }).open();
                    pop.on('closed', this, () => resolve());
                },
            );
            popupDefs.push(def);
        }
        await Promise.all(popupDefs);
        // All popups have been processed for the given ids
        // It is now time to set the final value with valid partners ids.
        validPartners = _.uniq(validPartners);
        if (validPartners.length) {
            const values = validPartners.map(
                id => {
                    return { id };
                },
            );
            this._setValue({
                ids: values,
                operation: 'ADD_M2M',
            });
        }
    },
    /**
     * Override to check if all many2many values have an email set before
     * rendering the widget.
     *
     * @override
     * @private
     */
    async _render() {
        const _super = this._super.bind(this);
        await new Promise(
            (resolve, reject) => {
                if (this.record.specialData[this.name].invalidPartnerIds.length) {
                    resolve(this._checkEmailPopup());
                } else {
                    resolve();
                }
            });
        return _super(...arguments);
    },
});

field_registry.add('many2many_tags_email', FieldMany2ManyTagsEmail);
