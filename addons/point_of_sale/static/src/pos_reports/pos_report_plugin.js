import { Plugin, signal, useConfig, usePlugin, t } from "@odoo/owl";
import { ORM } from "@web/core/orm_plugin";
import { download } from "@web/core/network/download";

const { DateTime } = luxon;

export class PosReportPlugin extends Plugin {
    orm = usePlugin(ORM);
    ui = useConfig("ui", t.object());
    action = useConfig("action", t.object());

    reportId = this.action.context?.report_id;
    meta = signal(null);
    sections = signal.Array([]);
    options = signal({});
    error = signal(null);

    async loadReportInfo() {
        const info = await this.orm.call("pos.report", "get_report_info", [this.reportId]);
        this.meta.set({
            id: info.id,
            name: info.name,
            filters: info.filters || [],
        });

        await this._initializeFilters();
    }

    async _initializeFilters() {
        for (const filter of this.meta().filters || []) {
            if (filter.type === "date_range") {
                await this._initDateFilter(filter);
            } else if (filter.type === "multi_select") {
                this.options.set({ ...this.options(), [filter.field]: [] });
            } else if (filter.type === "single_select") {
                this.options.set({ ...this.options(), [filter.field]: [] });
            }
        }
    }

    async _initDateFilter(filter) {
        const now = DateTime.now();
        const rangeType = filter.default || "month";

        let date_from, date_to;
        switch (rangeType) {
            case "year":
                date_from = now.startOf("year");
                date_to = now.endOf("year");
                break;
            case "month":
            default:
                date_from = now.startOf("month");
                date_to = now.endOf("month");
                break;
        }
        this.options.set({
            ...this.options(),
            date_from: date_from.toFormat("yyyy-MM-dd HH:mm:ss"),
            date_to: date_to.toFormat("yyyy-MM-dd HH:mm:ss"),
        });
    }

    async loadReport() {
        try {
            await this.loadReportInfo();
            const data = await this.orm.call("pos.report", "get_report_data", [
                this.reportId,
                this.options(),
            ]);

            this.meta.set({ ...this.meta(), currency: data.currency });
            this.sections.set(data.sections || []);
        } catch (e) {
            this.error.set(e?.message ?? "Unknown error");
            console.error(e);
        }
    }

    async applyFilters(newOptions = {}) {
        this.options.set({
            ...this.options(),
            ...newOptions,
        });

        // Preserve expanded state per section using composite key
        const foldabilityByKey = {};
        for (const section of this.sections()) {
            const key = section.section_id + "_" + (section.record_id ?? "");
            foldabilityByKey[key] = section.foldability;
        }

        try {
            const data = await this.orm.call("pos.report", "get_report_data", [
                this.reportId,
                this.options(),
            ]);

            this.meta.set({ ...this.meta(), currency: data.currency });

            const newSections = data.sections || [];

            // Restore expanded state from previous sections.
            // Backend already includes children for default-expanded sections.
            for (const section of newSections) {
                const key = section.section_id + "_" + (section.record_id ?? "");
                if (foldabilityByKey[key] !== undefined) {
                    section.foldability = foldabilityByKey[key];
                }
                // Clear children for non-expanded sections
                if (section.foldability !== "expanded") {
                    section.lines = [];
                }
            }

            this.sections.set(newSections);
        } catch (e) {
            this.error.set(e?.message ?? "Unknown error");
            console.error(e);
        }
    }

    async unfoldAll() {
        try {
            const shouldUnfold = !this.options().unfold_all;
            this.options.set({ ...this.options(), unfold_all: shouldUnfold });

            const data = await this.orm.call("pos.report", "get_report_data", [
                this.reportId,
                this.options(),
            ]);

            this.meta.set({ ...this.meta(), currency: data.currency });

            const newSections = data.sections || [];
            if (shouldUnfold) {
                for (const section of newSections) {
                    if (section.foldability === "static") {
                        continue;
                    }
                    section.foldability = "expanded";
                    this._markExpanded(section.lines);
                }
            }

            this.sections.set(newSections);
        } catch (e) {
            this.error.set(e?.message ?? "Unknown error");
            console.error(e);
        }
    }

    _markExpanded(lines) {
        for (const line of lines || []) {
            if (line.foldability === "static") {
                continue;
            }
            line.foldability = "expanded";
            if (line.lines?.length) {
                this._markExpanded(line.lines);
            }
        }
    }

    toggleUnfold(line, columns) {
        if (line.foldability === "expanded") {
            this.foldLine(line);
        } else {
            return this.unfoldLine(line.section_id, line, columns);
        }
    }

    async unfoldLine(sectionId, line, columns) {
        try {
            const data = await this.orm.call("pos.report", "get_unfold_data", [
                this.reportId,
                sectionId,
                line.record_id ?? null,
                this.options(),
            ]);
            line.lines = data.lines || [];
            line.foldability = "expanded";
            signal.trigger(this.sections);
        } catch (e) {
            this.error.set(e?.message ?? "Unknown error");
            console.error(e);
        }
    }

    foldLine(line) {
        line.foldability = "collapsed";
        line.lines = [];
        this.options.set({ ...this.options(), unfold_all: false });
        signal.trigger(this.sections);
    }

    async exportReport(format) {
        try {
            this.ui.block();
            const url = "/pos_reports";
            const data = {
                report_id: this.reportId,
                export_format: format,
                options: JSON.stringify(this.options() || {}),
            };

            await download({ url, data });
        } finally {
            this.ui.unblock();
        }
    }
}

export function usePosReport() {
    return usePlugin(PosReportPlugin);
}
