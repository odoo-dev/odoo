/** @odoo-module */

import { ExpenseDashboard } from '../components/expense_dashboard';
import { ExpenseMobileQRCode } from '../mixins/qrcode';
import { ExpenseDocumentUpload, ExpenseDocumentDropZone } from '../mixins/document_upload';

import { registry } from '@web/core/registry';
import { patch } from '@web/core/utils/patch';
import { useService } from '@web/core/utils/hooks';
import { listView } from "@web/views/list/list_view";

import { ListController } from "@web/views/list/list_controller";
import { ListRenderer } from "@web/views/list/list_renderer";

import { insert } from '@mail/model/model_field_command';
import { WebClientViewAttachmentViewContainer } from "@mail/components/web_client_view_attachment_view_container/web_client_view_attachment_view_container";

const { onWillStart, useState } = owl;

export class ExpenseListController extends ListController {
    setup() {
        super.setup();
        this.orm = useService('orm');
        this.actionService = useService('action');
        this.rpc = useService("rpc");
        this.user = useService("user");
        this.isExpenseSheet = this.model.rootParams.resModel === "hr.expense.sheet";

        onWillStart(async () => {
            this.is_expense_team_approver = await this.user.hasGroup("hr_expense.group_hr_expense_team_approver");
            this.is_account_invoicing = await this.user.hasGroup("account.group_account_invoice");
        });
    }

    displaySubmit() {
        const records = this.model.root.selection;
        return records.length && records.every(record => record.data.state === 'draft') && this.isExpenseSheet;
    }

    displayApprove() {
        const records = this.model.root.selection;
        return this.is_expense_team_approver && records.length && records.every(record => record.data.state === 'submit') && this.isExpenseSheet;
    }

    displayPost() {
        const records = this.model.root.selection;
        return this.is_account_invoicing && records.length && records.every(record => record.data.state === 'approve') && this.isExpenseSheet;
    }

    async onClick (action) {
        const records = this.model.root.selection;
        const recordIds = records.map((a) => a.resId);
        const model = this.model.rootParams.resModel;
        const context = {};
        if (action === 'approve_expense_sheets') {
            context['validate_analytic'] = true;
        }
        await this.orm.call(model, action, [recordIds], {context: context});
        // sgv note: we tried this.model.notify(); and does not work
        await this.model.root.load();
        this.render(true);
    }

}
patch(ExpenseListController.prototype, 'expense_list_controller_upload', ExpenseDocumentUpload);

export class ExpenseListRenderer extends ListRenderer {
    setup() {
        super.setup()
    }
}
patch(ExpenseListRenderer.prototype, 'expense_list_renderer_qrcode', ExpenseMobileQRCode);
patch(ExpenseListRenderer.prototype, 'expense_list_renderer_qrcode_dzone', ExpenseDocumentDropZone);
ExpenseListRenderer.template = 'hr_expense.ListRenderer';

export class ExpenseAttachmentListController extends ExpenseListController {
    setup() {
        super.setup();
        this.messaging = useService("messaging");
        this.ui = useService("ui");
        this.attachmentPreviewState = useState({
            // previewEnabled: !this.env.searchModel.context.disable_preview && this.ui.size >= SIZES.XXL,  // TODO
            // displayAttachment: localStorage.getItem('account.move_line_pdf_previewer_hidden') !== 'false', // TODO
            selectedRecord: false,
            thread: null,
            displayAttachment: false,
        });
    }

    setSelectedRecord(ExpenseData) {
        this.attachmentPreviewState.selectedRecord = ExpenseData;
        this.setThread(this.attachmentPreviewState.selectedRecord);
    }

    async setThread(ExpenseData) {
        if (!ExpenseData || !ExpenseData.data.attachment_ids.records.length) {
            this.attachmentPreviewState.thread = null;
            return;
        }
        const attachments = insert(
            ExpenseData.data.attachment_ids.records
                .map(attachment => ({ id: attachment.resId, mimetype: attachment.data.mimetype }))
                .filter(attachment => attachment.mimetype !== 'application/xml')
        );
        const messaging = await this.messaging.get();
        // As the real thread is AccountMove and the attachment are from AccountMove
        // We prevent this hack to leak into the WebClientViewAttachmentViewContainer here
        // by declaring the model as account.move instead of account.move.line
        const thread = messaging.models['Thread'].insert({
            attachments,
            id: ExpenseData.resId,
            model: ExpenseData.resModel,
        });
        thread.update({ mainAttachment: thread.attachments[0] });
        this.attachmentPreviewState.thread = thread;
        console.log(ExpenseData.data.attachment_ids.records[0].data.mimetype);
    }

    togglePreview() {
        this.attachmentPreviewState.displayAttachment = !this.attachmentPreviewState.displayAttachment;
    }
}
ExpenseAttachmentListController.components = {
    ...ExpenseAttachmentListController.components,
    WebClientViewAttachmentViewContainer,
};
ExpenseAttachmentListController.template = 'hr_expense.AttachmentListView';

export class ExpenseAttachmentListRenderer extends ExpenseListRenderer {
    static template = 'hr_expense.AttachmentListRenderer';
    setup() {
        super.setup();
    }

    findFocusFutureCell(cell, cellIsInGroupRow, direction) {
        const futureCell = super.findFocusFutureCell(cell, cellIsInGroupRow, direction);
        if (futureCell) {
            const dataPointId = futureCell.closest('tr').dataset.id;
            const record = this.props.list.records.filter(x=>x.id === dataPointId)[0];
            this.props.setSelectedRecord(record);
        }
        return futureCell;
    }
}
ExpenseAttachmentListRenderer.props = [...ExpenseAttachmentListRenderer.props, "setSelectedRecord?"];

export const ExpenseAttachmentListView = {
    ...listView,
    Renderer: ExpenseAttachmentListRenderer,
    Controller: ExpenseAttachmentListController,
};

export class ExpenseDashboardListRenderer extends ExpenseAttachmentListRenderer {
    static template = 'hr_expense.DashboardListRenderer';
    static components = {
        ...ExpenseAttachmentListRenderer.components,
        ExpenseDashboard,
    };
    setup(){
        super.setup();
    }
}
ExpenseDashboardListRenderer.props = [...ListRenderer.props, "setSelectedRecord?"];

export class ExpenseDashboardListController extends ExpenseAttachmentListController {
    setup(){
        super.setup()
    }
}

export const ExpenseDashboardListView = {
    ...listView,
    Renderer: ExpenseDashboardListRenderer,
    Controller: ExpenseDashboardListController,
};

registry.category('views').add('hr_expense_tree', {
    ...listView,
    buttonTemplate: 'hr_expense.ListButtons',
    Controller: ExpenseListController,
    Renderer: ExpenseListRenderer,
});

registry.category('views').add('hr_expense_attachment_tree', {
    ...listView,
    buttonTemplate: 'hr_expense.ListButtons',
    Controller: ExpenseAttachmentListController,
    Renderer: ExpenseAttachmentListRenderer,
});

registry.category("views").add('hr_expense_dashboard_tree', ExpenseDashboardListView);
