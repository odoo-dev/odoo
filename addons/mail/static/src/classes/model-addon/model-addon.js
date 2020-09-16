/** @odoo-module alias=mail.classes.ModelAddon **/

class ModelAddon {
    /**
     * @param {string} id
     */
    constructor(id) {
        /**
         * Map field name to field addon id related to this model addon.
         */
        this['fieldName => ModelFieldAddon/id'] = new Map();
        /**
         * Map field name to field original id related to this model addon.
         */
        this['fieldName => ModelFieldOriginal/id'] = new Map();
        /**
         * Action addon ids that this model addon is related to.
         */
        this['<ActionAddon/id>'] = new Set();
        /**
         * Action original ids that this model addon is related to.
         */
        this['ActionOriginal/id>'] = new Set();
        /**
         * Feature model id this model addon is related to.
         */
        this['FeatureModel/id'] = undefined;
        /**
         * Model field addon ids that this model addon is related to.
         */
        this['<ModelFieldAddon/id>'] = new Set();
        /**
         * Model field original ids that this model addon is related to.
         */
        this['<ModelFieldOriginal/id>'] = new Set();
        /**
         * Unique id of this model addon.
         */
        this.id = id;
    }
}

export default ModelAddon;
