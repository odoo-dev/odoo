/** @odoo-module **/

import { onWillUnmount } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";

export function useDropzone(target) {
    const service = useService("dropzone");
    const removeDropzone = service.add(target);
    onWillUnmount(removeDropzone);
}
