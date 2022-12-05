/* @odoo-module */

import { onWillDestroy } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";

export function useDropzone(target, { onDrop } = {}) {
    const service = useService("dropzone");
    const removeDropzone = service.add(target, onDrop);
    onWillDestroy(removeDropzone);
}
