/* @odoo-module */

import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";

patch(ListRenderer.prototype, "mail/views/web", {
    getPropertyFieldColumns(_, list) {
        const columns = this._super(...arguments);
        for (const column of columns) {
            const { relation, type } = list.fields[column.name];
            if (relation === "res.users") {
                column.widget =
                    type === "many2one" ? "many2one_avatar_user" : "many2many_avatar_user";
            }
        }
        return columns;
    },
});
