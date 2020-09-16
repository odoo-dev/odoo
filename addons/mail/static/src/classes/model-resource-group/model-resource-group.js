/** @odoo-module alias=mail.classes.ModelResourceGroup **/

class ModelResourceGroup {
    constructor() {
        /**
         * Item ids that this model resource group contains.
         */
        this['<Item/id>'] = new Set();
        /**
         * Unique id of this model resource group.
         */
        this.id = undefined;
    }
}

export default ModelResourceGroup;
