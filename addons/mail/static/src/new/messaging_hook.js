/* @odoo-module */

import { useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

/**
 *  @returns {import("@mail/new/core/messaging").Messaging}
 */
export function useMessaging() {
    return useState(useService("mail.messaging"));
}
