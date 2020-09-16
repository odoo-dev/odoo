/** @odoo-module alias=mail.classes.Model **/

class Model {
    /**
     * @param {string} name
     */
    constructor(name) {
        /**
         * Model addon ids related to this model.
         */
        this['<ActionAddon/id>'] = new Set();
        /**
         * Model field ids related to this model.
         */
        this['<ModelField/id>'] = new Set();
        /**
         * Model original id related to this model, if any.
         */
        this['ModelOriginal/id'] = undefined;
        /**
         * Record ids related to this model.
         */
        this['<Record/id>'] = new Set();
        /**
         * Map stringified format of data id to record id.
         */
        this['Record/stringifiedDataId => Record/id'] = new Map();
        /**
         * Model field ids of model fields that identity records
         * on this model.
         */
        this['id <ModelField/id>'] = new Set();
        /**
         * Unique id of this model, used to get model from id using
         * env['Item/id => Item'].
         */
        this.id = name;
        /**
         * Name of this model.
         */
        this.name = name;
    }
}

export default Model;
