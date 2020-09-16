/** @odoo-module alias=mail.action.define **/

import ActionDefinition from 'mail.classes.ActionDefinition';

/**
 * @param {Object} param0
 * @param {Object} param0.action
 * @param {boolean} [param0.global=false]
 * @param {string} [param0.id]
 * @returns {mail.classes.ActionDefinition}
 */
export default function define({
    action: actionData,
    global = false,
    id,
}) {
    // TODO: check actionData has single function
    // TODO: check id is not already being used by another global
    const actionName = actionData.getOwnPropertyNames()[0];
    const actionDefinition = new ActionDefinition({
        actionName,
        func: actionData[actionName],
        id,
    });
    // TODO: if global set, put in global registry
    return actionDefinition;
}
