odoo.define('mail/static/src/models/message_tracking_value/message_tracking_value.js', function (require) {
'use strict';

const { registerNewModel } = require('mail/static/src/model/model_core.js');
const { attr, many2one } = require('mail/static/src/model/model_field.js');

const { format } = require('web.field_utils');
function factory(dependencies) {

    class MessageTrackingValue extends dependencies['mail.model'] {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------
        /**
         * @static
         * @param {Object} data
         * @return {Object}
         */
         static convertData(data) {
            const messageTrackingValue = {
                id: data.id,
            };
            if ('changed_field' in data && data.changed_field) {
                messageTrackingValue.changedField = {original: data.changed_field, string_val: null};
            }
            if ('currency_id' in data && data.currency_id) {
                messageTrackingValue.currencyId = data.currency_id;
            }
            if ('field_type' in data && data.field_type) {
                messageTrackingValue.fieldType = data.field_type;
            }
            if ('new_value' in data && data.new_value) {
                messageTrackingValue.newValue = {original: data.new_value, string_val: null};
            }
            if ('old_value' in data && data.old_value) {
                messageTrackingValue.oldValue = {original: data.old_value, string_val: null};
            }

            return messageTrackingValue;
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------
        
        /**
         * @private
         * @returns {string}
         */
         _computeChangedField() {
            return {original: this.original, string_val: _.str.sprintf(this.env._t("%s: "), this.changedField.original)};
        }

        /**
         * @private
         * @returns {string}
         */
        _formatValue(fieldType, value) {
             switch (fieldType) {
                case 'boolean':
                    return format.boolean(value, undefined, { forceString: true });
                /**
                 * many2one formatter exists but is expecting id/name_get or data
                 * object but only the target record name is known in this context.
                 *
                 * Selection formatter exists but requires knowing all
                 * possibilities and they are not given in this context.
                 */
                case 'char':
                case 'many2one':
                case 'selection':
                    return format.char(value);
                case 'date': //TODO: Is it possible to have null here? What is the point of having format(null)?
                    if (value) {
                        value = moment.utc(value);
                    }
                    return format.date(value);
                case 'datetime':
                    if (value) {
                        value = moment.utc(value);
                    }
                    return format.datetime(value);
                case 'float':
                    return format.float(value);
                case 'integer':
                    return format.integer(value);
                case 'monetary':
                    return format.monetary(value, undefined, {
                        currency: this.currencyId
                            ? this.env.session.currencies[this.currencyId]
                            : undefined,
                        forceString: true,
                    });
                case 'text':
                    return format.text(value);
                default : 
                    return undefined;
            }            
        }

        /**
         * @private
         * @returns {string}
         */
        _computeOldValue() {
            /**
             * Maps tracked field type to a JS formatter. Tracking values are
             * not always stored in the same field type as their origin type.
             * Field types that are not listed here are not supported by
             * tracking in Python. Also see `create_tracking_values` in Python.
             */
            return {original: this.original, string_val: this._formatValue(this.fieldType, this.oldValue.original)}
        }

        /**
         * @private
         * @returns {string}
         */
         _computeNewValue() {
            /**
             * Maps tracked field type to a JS formatter. Tracking values are
             * not always stored in the same field type as their origin type.
             * Field types that are not listed here are not supported by
             * tracking in Python. Also see `create_tracking_values` in Python.
             */
             return {original :this.original, string_val: this._formatValue(this.fieldType, this.newValue.original)}
        }
    }

    MessageTrackingValue.fields = {

        changedField:attr({
            compute: '_computeChangedField',
            default: {},
        }),
        currencyId: attr(),
        fieldType: attr(),
        id: attr({
            required: true,
        }),
        message: many2one('mail.message', {
            inverse: 'trackingValues',
        }),
        newValue: attr({
            compute: '_computeNewValue',
            default: {},
            dependencies: [
                'fieldType',
            ],
        }),
        oldValue: attr({
            compute: '_computeOldValue',
            default: {},
            dependencies: [
                'fieldType',
            ],
        }),
    };

    MessageTrackingValue.modelName = 'mail.message_tracking_value';

    return MessageTrackingValue;
}

registerNewModel('mail.message_tracking_value', factory);
    
});
    