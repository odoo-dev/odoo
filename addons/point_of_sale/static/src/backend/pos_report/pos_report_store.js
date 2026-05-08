import { markup, reactive, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { renderToString } from "@web/core/utils/render";
import { registerPythonTemplate } from "@point_of_sale/app/utils/convert_python_template";

export class PosReportStore {
    static serviceDependencies = ["orm", "notification", "action", "ui"];

    constructor({ env, deps }) {
        const reactiveSelf = reactive(this);
        reactiveSelf.ready = reactiveSelf.setup(env, deps).then(() => reactiveSelf);
        return reactiveSelf;
    }

    async setup(env, { orm, notification, action, ui }) {
        this.env = env;
        this.orm = orm;
        this.action = action;
        this.notification = notification;
        this.ui = ui;

        this.filterSchema = reactive([]);
        this.filters = reactive({});
        this.filterChanged = Date.now();

        this.reports = reactive({});
    }

    _getReport(reportId) {
        if (!this.reports[reportId]) {
            this.reports[reportId] = reactive({
                templates: [],
                renderedTemplates: [],
                data: {},
                templatesLoaded: false,
            });
        }
        return this.reports[reportId];
    }

    updateFilters(values) {
        Object.assign(this.filters, values);
        this.filterChanged = Date.now();
    }

    setFilterConfig(config) {
        this.filterSchema = config || [];
    }

    async fetchAndRegisterTemplates(reportId, model, method) {
        const report = this._getReport(reportId);

        if (report.templatesLoaded) {
            return;
        }

        try {
            const templates = await this.orm.call(model, method);

            for (const [name, templateString] of templates || []) {
                if (!report.templates.includes(name)) {
                    registerPythonTemplate(name, "", templateString);
                    report.templates.push(name);
                }
            }
            report.templatesLoaded = true;
        } catch {
            this.notification.add(_t("Unable to load report templates"), { type: "danger" });
        }
    }

    async loadData(reportId, { model, method, params = [] }) {
        const report = this._getReport(reportId);
        this.ui.block();
        try {
            report.data = await this.orm.call(model, method, params);
        } catch {
            this.notification.add(_t("Unable to load report data"), { type: "danger" });
        } finally {
            this.ui.unblock();
        }
    }

    renderTemplates(reportId, data = {}) {
        this.ui.block();
        const report = this._getReport(reportId);
        const reportData = { ...report.data, ...data };
        report.renderedTemplates = report.templates.map((templateName) =>
            markup(renderToString(templateName, reportData))
        );
        this.ui.unblock();
    }

    getRendered(reportId) {
        return this._getReport(reportId).renderedTemplates;
    }
}

export const posReportService = {
    dependencies: PosReportStore.serviceDependencies,
    async start(env, deps) {
        return new PosReportStore({ env, deps }).ready;
    },
};

registry.category("services").add("pos_report", posReportService);

/**
 * @returns {PosReportStore}
 */
export function usePosReport() {
    return useState(useService("pos_report"));
}
