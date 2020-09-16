/** @odoo-module alias=mail.model.addon.define **/

import actionAddon from 'mail.action.addon.define';
import action from 'mail.action.define';
import ModelAddonDefinition from 'mail.classes.ModelAddonDefinition';

/**
 * @param {Object} param0
 * @param {Object} [param0.actionAddons]
 * @param {Object} [param0.actions]
 * @param {Object} [param0.fields]
 * @param {boolean} [param0.global=false]
 * @param {string} [param0.id]
 * @param {string} param0.name
 * @returns {mail.classes.ModelAddonDefinition}
 */
export default function define({
    actionAddons,
    actions,
    fields,
    global = false,
    id,
    name: modelName,
}) {
    // TODO: check id and name not already used in global
    const customActionAddons = new Set();
    const customActions = new Set();
    if (actionAddons) {
        for (const actionName of actionAddons.getOwnPropertyNames()) {
            const customActionAddon = actionAddon({
                action: {
                    [actionName]: actions[actionName],
                },
            });
            customActionAddons.add(customActionAddon);
        }
    }
    if (actions) {
        for (const actionName of actions.getOwnPropertyNames()) {
            const customAction = action({
                action: {
                    [actionName]: actions[actionName],
                },
            });
            customActions.add(customAction);
        }
    }
    const modelAddonDefinition = new ModelAddonDefinition({
        actionAddons: [...customActionAddons],
        actions: [...customActions],
        fields,
        id,
        modelName,
    });
    // TODO: if global set, add to global registry
    return modelAddonDefinition;
}
