/* @odoo-module */

import { onWillDestroy } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";

export function useAttachmentViewer() {
    const service = useService("attachmentViewer");
    onWillDestroy(() => service.close());
    return service;
}
