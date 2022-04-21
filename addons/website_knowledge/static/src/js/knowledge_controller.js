/** @odoo-module **/

import { KnowledgeFormController } from '@knowledge/js/knowledge_controller';

KnowledgeFormController.include({
    /**
     * @override
     * @returns {Array[String]}
     */
    _getFieldsToForceSave: function () {
        return this._super().concat('website_published');
    },
});
