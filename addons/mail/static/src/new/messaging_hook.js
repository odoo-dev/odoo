/** @odoo-module */

import { useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

/**
 * @typedef {import("@mail/new/messaging").Messaging} Messaging
 */

/**
 *  @returns {Messaging} messaging
 */
export function useMessaging() {
    return useState(useService("mail.messaging"));
}
