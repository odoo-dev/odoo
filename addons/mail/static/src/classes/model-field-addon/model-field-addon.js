/** @odoo-module alias=mail.classes.ModelFieldAddon **/

class ModelFieldAddon {
    /**
     * @param {string} id
     */
    constructor(id) {
        /**
         * Action addon id that this model field addon is related to.
         */
        this['ActionOriginal/id'] = undefined;
        /**
         * Unique id of this model field addon.
         */
        this.id = id;
    }
}

export default ModelFieldAddon;
