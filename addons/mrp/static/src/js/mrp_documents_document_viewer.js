/** @odoo-module alias=mrp.widgets.DocumentViewer **/

import DocumentViewer from 'mail.widgets.DocumentViewer';

/**
 * This file defines the DocumentViewer for the MRP Documents Kanban view.
 */
export default DocumentViewer.extend({
    init(parent, attachments, activeAttachmentID) {
        this._super(...arguments);
        this.modelName = 'mrp.document';
    },
});
