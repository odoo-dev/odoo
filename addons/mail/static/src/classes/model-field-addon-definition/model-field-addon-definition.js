/** @odoo-module alias=mail.classes.ModelFieldAddonDefinition **/

export default class ModelFieldAddonDefinition {
    /**
     * @param {Object} param0
     * @param {mail.classes.ActionAddonDefinition} param0.actionAddon
     */
    constructor({
        actionAddon,
    }) {
        /**
         * Action addon definition related to this model field addon. This
         * action addon is an extension of compute defined in model field
         * original definition.
         */
        this.actionAddon = actionAddon;
    }
}
