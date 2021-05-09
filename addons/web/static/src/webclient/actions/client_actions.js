/** @odoo-module **/

import { sprintf } from "../../core/utils/strings";
import { actionRegistry } from "./action_registry";

const { utils } = owl;
const { escape } = utils;

export const displayNotificationAction = (env, action) => {
    const params = action.params || {};
    const options = {
        className: params.className || "",
        sticky: params.sticky || false,
        title: params.title ? escape(params.title) : "",
        type: params.type || "info",
    };
    let links = (params.links || []).map((link) => {
        return `<a href="${escape(link.url)}" target="_blank">${escape(link.label)}</a>`;
    });
    const message = sprintf(escape(params.message), ...links);
    env.services.notification.create(message, options);
    return params.next;
};

actionRegistry.add("display_notification", displayNotificationAction);
