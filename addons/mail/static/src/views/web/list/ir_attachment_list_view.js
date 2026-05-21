import { listView } from "@web/views/list/list_view";
import { registry } from "@web/core/registry";
import { IrAttachmentControllerMixin } from "@mail/views/web/ir_attachment_controller_mixin";
import { ListController } from "@web/views/list/list_controller";


class IrAttachmentListController extends IrAttachmentControllerMixin(ListController) {}

export const irAttachmentListView = {
    ...listView,
    Controller: IrAttachmentListController,
};

registry.category("views").add("ir_attachment_list", irAttachmentListView);
