/** @odoo-module alias=mail.model.field.define **/

import action from 'mail.action.define';
import ModelFieldDefinition from 'mail.classes.ModelFieldDefinition';

/**
 * @param {Object} param0
 * @param {function} [param0.compute]
 * @param {any} [param0.default]
 * @param {boolean} [param0.id=false]
 * @param {string} [param0.inverse]
 * @param {boolean} [param0.isCausal=false]
 * @param {boolean} [param0.readonly=false]
 * @param {string} [param0.related]
 * @param {boolean} [param0.required=false]
 * @param {string} [param0.targetModelName]
 * @param {string} param0.type
 * @returns {mail.classes.ModelFieldDefinition}
 */
export default function define({
    compute,
    default: def,
    id = false,
    inverse,
    isCausal = false,
    readonly = false,
    related,
    required = false,
    targetModelName,
    type,
}) {
    let actionDefinition;
    if (compute) {
        const actionName = _.uniqueId('model-field-compute-');
        actionDefinition = action({
            action: {
                [actionName]: compute,
            },
        });
    }
    // TODO: related
    const modelFieldDefinition = new ModelFieldDefinition({
        action: actionDefinition,
        default: def,
        id,
        inverse,
        isCausal,
        readonly,
        related,
        required,
        targetModelName,
        type,
    });
    return modelFieldDefinition;
}
