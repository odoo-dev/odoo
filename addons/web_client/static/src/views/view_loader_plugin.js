import { plugin, Plugin, signal } from "@odoo/owl";
import { ORM } from "@web_core/orm";
import { serviceRegistry } from "@web_core/services";

export class ViewLoaderPlugin extends Plugin {
    static id = this.name;
    static {
        serviceRegistry.addById(this);
    }

    /** @private */
    orm = plugin(ORM);

    /** @type {import("@odoo/owl").Signal<Record<string, any>>} */
    models = signal({});
    /** @type {import("@odoo/owl").Signal<Record<string, string>>} */
    archs = signal({});

    /**
     * @param {string} resModel
     * @param {number} actionId
     * @param {[number, string][]} views
     */
    async loadView(resModel, actionId, views) {
        const data = await this.orm.call(resModel, "get_views", {
            // It needs more info than that
            kwargs: {
                views,
                options: {
                    action_id: actionId,
                },
            },
        });

        // This plugin may / should be stateless
        this.models.set(data.models);
        /** @type {Record<string, any>} */
        const archs = {};
        for (const [mode, { arch }] of Object.entries(data.views)) {
            archs[mode] = arch;
        }
        this.archs.set(archs);
    }
}
