/** @odoo-module alias=mail.model.field.addon.define **/

import actionAddon from 'mail.action.addon.define';
import ModelFieldAddonDefinition from 'mail.classes.ModelFieldAddonDefinition';

/**
 * @param {Object} param0
 * @param {function} [param0.extendedCompute]
 * @returns {mail.classes.ModelFieldAddonDefinition}
 */
export default function define({
    extendedCompute,
}) {
    const actionName = _.uniqueId('model-field-extended-compute-');
    const actionAddonDefinition = actionAddon({
        action: {
            [actionName]: extendedCompute,
        },
    });
    // TODO: action addon from extended compute
    const modelFieldAddonDefinition = new ModelFieldAddonDefinition({
        actionAddon: actionAddonDefinition,
    });
    return modelFieldAddonDefinition;
}
