/** @odoo-module alias=mail.action.addon.define **/

import ActionAddonDefinition from 'mail.classes.ActionAddonDefinition';

/**
 * @param {Object} param0
 * @param {Object} param0.action
 * @param {boolean} [param0.global=false]
 * @param {string} [param0.id]
 * @returns {mail.classes.ActionAddonDefinition}
 */
export default function define({
    action: actionData,
    global = false,
    id,
}) {
    // TODO: check actionData has single function
    // TODO: check id is not already being used by another global
    const actionName = actionData.getOwnPropertyNames()[0];
    const actionAddonDefinition = new ActionAddonDefinition({
        actionName,
        func: actionData[actionName],
        id,
    });
    // TODO: if global set, put in global registry
    return actionAddonDefinition;
}
