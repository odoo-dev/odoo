/** @odoo-module alias=mail.classes.ModelOriginal **/

class ModelOriginal {
    /**
     * @param {string} id
     */
    constructor(id) {
        /**
         * Model field original ids that this model original is related to.
         */
        this['fieldName => ModelFieldOriginal/id'] = new Map();
        /**
         * Action addon ids that this model original is related to.
         */
        this['<ActionAddon/id>'] = new Set();
        /**
         * Action original ids that this model original is related to.
         */
        this['<ActionOriginal/id>'] = new Set();
        /**
         * Feature model id this model original is related to.
         */
        this['FeatureModel/id'] = undefined;
        /**
         * Model field original ids that this model original is related to.
         */
        this['<ModelFieldOriginal/id>'] = new Set();
        /**
         * Unique id of this model original.
         */
        this.id = id;
    }
}

export default ModelOriginal;
