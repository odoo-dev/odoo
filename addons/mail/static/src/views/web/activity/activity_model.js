/* @odoo-module */

import { RelationalModel } from "@web/views/relational_model/relational_model";

export class ActivityModel extends RelationalModel {
    static DEFAULT_LIMIT = null;

    async load(params = {}) {
        this.originalDomain = params.domain ? [...params.domain] : [];
        params.domain?.push(["activity_ids", "!=", false]);
        if (params && "groupBy" in params) {
            params.groupBy = [];
        }
        const prom = this.fetchActivityData(params).then((data) => {
            this.activityData = data;
        });
        await Promise.all([prom, super.load(params)]);
    }

    fetchActivityData(params) {
        return this.orm.call("mail.activity", "get_activity_data", [], {
            res_model: this.config.resModel,
            domain: params.domain || this.env.searchModel._domain,
        });
    }
}
