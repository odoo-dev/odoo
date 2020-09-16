/** @odoo-module alias=mail.models.RecordField.actions._convertX2ManyValue **/

import action from 'mail.action.define';

/**
 * Converts given value to expected format for x2many processing, which is
 * an iterable of records.
 */
export default action({
    name: 'RecordField/_convertX2ManyValue',
    id: 'mail.model.RecordField.actions._convertX2ManyValue',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {RecordField} field
     * @param {Record|Record[]} newValue
     * @param {Object} [param3={}]
     * @param {boolean} [param3.hasToVerify=true] whether the value has to be
     *  verified @see `RecordField/_verifyRelationalValue`
     * @returns {Record[]}
     */
    func(
        { env },
        field,
        value,
        { hasToVerify = true } = {},
    ) {
        if (typeof value[Symbol.iterator] === 'function') {
            if (hasToVerify) {
                for (const item of value) {
                    env.services.action.dispatch(
                        'RecordField/_verifyRelationalValue',
                        field,
                        item,
                    );
                }
            }
            return value;
        }
        if (hasToVerify) {
            env.services.action.dispatch(
                'RecordField/_verifyRelationalValue',
                field,
                value,
            );
        }
        return [value];
    },
});
