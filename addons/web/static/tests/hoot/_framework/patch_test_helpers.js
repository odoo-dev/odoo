/** @odoo-module */

import { registerCleanup } from "@odoo/hoot";
import { patch } from "@web/core/utils/patch";

/** @type {typeof patch} */
export function patchWithCleanup(obj, patchValue) {
    registerCleanup(patch(obj, patchValue));
}
