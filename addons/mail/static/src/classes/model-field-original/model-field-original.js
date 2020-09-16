/** @odoo-module alias=mail.classes.ModelFieldOriginal **/

class ModelFieldOriginal {
    /**
     * @param {string} id
     */
    constructor(id) {
        /**
         * Action original id that this model field original is related to.
         */
        this['ActionOriginal/id'] = undefined;
        /**
         * Model original id this model field original is related to.
         */
        this['ModelOriginal/id'] = undefined;
        /**
         * Unique id of this model field original.
         */
        this.id = id;
    }
}

export default ModelFieldOriginal;
