/** @odoo-module **/

import { reactive, useState } from "@odoo/owl";
import { WithLazyGetterTrap } from "@point_of_sale/lazy_getter";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
const { DateTime } = luxon;

/**
 * Generic centralized store for all POS report controllers.
 * Handles filter state, ORM fetching, and reactive report data.
 */
export class PosReportStore extends WithLazyGetterTrap {
    static serviceDependencies = ["orm", "notification"];

    constructor({ traps, env, deps }) {
        super({ traps });
        const reactiveSelf = reactive(this);
        reactiveSelf.ready = reactiveSelf.setup(env, deps).then(() => reactiveSelf);
        return reactiveSelf;
    }

    async setup(env, { orm, notification }) {
        this.env = env;
        this.orm = orm;
        this.notification = notification;

        // dynamic filters - can be extended per report
        this.filters = reactive({});
        this.filterChanged = Date.now();

        // holds report data from backend
        this.data = reactive({});

        this.ready = new Promise((resolve) => {
            this.markReady = resolve;
        });
        this.markReady(this);
    }

    get currentDate() {
        return DateTime.now();
    }

    /**
     * Initialize filters dynamically
     */
    setInitialFilters(defaults = {}) {
        Object.assign(this.filters, defaults);
    }

    /**
     * Update a filter value and auto-fetch new data
     */
    updateFilter(filters) {
        Object.assign(this.filters, filters);
        this.filterChanged = Date.now();
    }

    /**
     * Reset all filters to default values
     */
    resetFilters(defaults = {}) {
        this.filters = reactive({});
        this.setInitialFilters(defaults);
    }

    /**
     * Generic ORM call for fetching report data.
     * Supports only 'call' operation type.
     *
     * @param {Object} options
     * @param {String} options.model - model name
     * @param {String} options.method - method to call
     * @param {Array} [options.args=[]] - positional args
     * @param {Object} [options.kwargs={}] - keyword args
     */
    async fetchData({ model, method, args = [], kwargs = {} } = {}) {
        try {
            if (!model || !method) {
                throw new Error("Model and method are required for report fetch");
            }

            const result = await this.orm.call(model, method, args, kwargs);
            this.data = result || {};
        } catch (error) {
            console.error("POS Report ORM call failed:", error);
            this.notification.add(_t("Failed to fetch report data"), { type: "warning" });
        }
    }

    async export_pdf() {}
}

/**
 * Register as global service usable in any POS report controller.
 */
export const posReportService = {
    dependencies: PosReportStore.serviceDependencies,
    async start(env, deps) {
        return new PosReportStore({ traps: {}, env, deps }).ready;
    },
};

registry.category("services").add("pos_report", posReportService);

/**
 * @returns {PosReportStore}
 */
export function usePosReport() {
    return useState(useService("pos_report"));
}
