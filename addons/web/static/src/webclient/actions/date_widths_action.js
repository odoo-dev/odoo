import { registry } from "@web/core/registry";

import { Component, onMounted, onWillStart, useRef, useState, xml } from "@odoo/owl";
import { formatDateTime, strftimeToLuxonFormat } from "@web/core/l10n/dates";
import { Notebook } from "@web/core/notebook/notebook";
import { useService } from "@web/core/utils/hooks";
import { pyToJsLocale } from "@web/core/l10n/utils";

/** @type {[RegExp, string][]} */
const NUMBERING_SYSTEMS = [
    [/^ar-(sa|sy|001)$/i, "arab"],
    [/^bn/i, "beng"],
    [/^bo/i, "tibt"],
    // [/^fa/i, "Farsi (Persian)"], // No numberingSystem found in Intl
    // [/^(hi|mr|ne)/i, "Hindi"], // No numberingSystem found in Intl
    // [/^my/i, "Burmese"], // No numberingSystem found in Intl
    [/^pa-in/i, "guru"],
    [/^ta/i, "tamldec"],
    [/.*/i, "latn"],
];
function forceLocale(locale) {
    const defaultLocale = luxon.Settings.defaultLocale;
    const defaultNumberingSystem = luxon.Settings.defaultNumberingSystem;
    luxon.Settings.defaultLocale = locale;
    for (const [re, numberingSystem] of NUMBERING_SYSTEMS) {
        if (re.test(locale)) {
            luxon.Settings.defaultNumberingSystem = numberingSystem;
            break;
        }
    }
    return () => {
        luxon.Settings.defaultLocale = defaultLocale;
        luxon.Settings.defaultNumberingSystem = defaultNumberingSystem;
    };
}

const STYLES = ["normal", "fw-bold", "fst-italic", "fw-bold fst-italic"];
function getLabels() {
    return STYLES.map((style) =>
        style
            .split(" ")
            .map((c) => c.split("-").at(-1))
            .join(" ")
    );
}

class Page extends Component {
    static template = xml`
        <table t-ref="table" style="table-layout: fixed; font-variant-numeric: tabular-nums;">
            <thead>
                <th t-foreach="labels" t-as="label" t-key="label_index" style="min-width: 270px; width: 270px;'">
                    <t t-esc="label"/>
                    <span class="ms-1 max_width"/>
                </th>
            </thead>
            <tbody>
                <tr t-foreach="props.values" t-as="value" t-key="value_index">
                    <td t-foreach="styles" t-as="style" t-key="style_index">
                        <span t-att-class="style" t-esc="value"/>
                    </td>
                </tr>
            </tbody>
        </table>`;
    static props = ["*"];

    setup() {
        const tableRef = useRef("table");
        this.styles = STYLES;
        this.labels = getLabels();

        onMounted(() => {
            const table = tableRef.el;
            const labels = this.labels;
            const stats = {};
            let max = 0;
            let maxIndices = [];
            let normalWidth;
            for (let index = 1; index <= this.styles.length; index++) {
                const spans = table.querySelectorAll(`tbody td:nth-child(${index}) span`);
                const widths = [...spans].map((span) => span.getBoundingClientRect().width);
                const maxWidth = Math.round(Math.max(...widths) * 100) / 100;
                let text = `${maxWidth}px`;
                const textNode = table.querySelector(`thead th:nth-child(${index}) .max_width`);
                const stat = { maxWidth };
                if (index === 1) {
                    normalWidth = maxWidth;
                } else {
                    const diff = Math.round((maxWidth - normalWidth) * 100) / 100;
                    const percentage =
                        Math.round(((maxWidth - normalWidth) / normalWidth) * 100 * 100) / 100;
                    text += diff
                        ? ` (${diff > 0 ? "+" : ""}${diff}px, ${diff > 0 ? "+" : ""}${percentage}%)`
                        : " (=)";
                    stat.diff = diff;
                    stat.percentage = percentage;
                    textNode.classList.add(diff > 0 ? "text-warning" : "text-success");
                }
                textNode.innerText = text;
                if (maxWidth > max) {
                    max = maxWidth;
                    maxIndices = [index];
                } else if (maxWidth === max) {
                    maxIndices.push(index);
                }
                stats[labels[index]] = stat;
            }
            for (const index of maxIndices) {
                table
                    .querySelector(`thead th:nth-child(${index}) .max_width`)
                    .classList.add("text-danger");
                stats[labels[index]].isMax = true;
            }
            this.props.onStatsComputed(stats);
        });
    }
}

class Stats extends Component {
    static template = xml`
        <div>
            <table class="table table-sm table-hover table-striped">
                <thead>
                    <th t-foreach="['locale'].concat(labels)" t-as="v" t-key="v_index" t-esc="v" t-on-click="() => this.sort(v_index)" class="cursor-pointer"/>
                </thead>
                <tbody>
                    <tr t-foreach="state.stats" t-as="stat" t-key="stat_index">
                        <td t-esc="stat.locale"/>
                        <td t-foreach="Object.values(stat.values)" t-as="s" t-key="s_index">
                            <span t-att-class="getClassName(s)">
                                <t t-esc="s.maxWidth"/>px
                                <t t-if="s.diff" t-esc="' (' + (s.diff > 0 ? '+' : '') + s.diff + 'px, ' + (s.diff > 0 ? '+' : '') + s.percentage + '%)'"/>
                            </span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>`;
    labels = getLabels();
    state = useState({
        stats: this.sanitizeStats(this.props.stats),
    });
    sortedBy = false;
    desc = true;

    getClassName({ diff, isMax }) {
        if (isMax) {
            return "text-danger";
        }
        if (diff < 0) {
            return "text-success";
        }
        return "";
    }

    sanitizeStats(stats) {
        return Object.entries(stats).map(([locale, values]) => {
            return { locale, values };
        });
    }

    sort(index) {
        if (this.sortedBy === index) {
            this.desc = !this.desc;
        }
        this.sortedBy = index;
        this.state.stats = this.state.stats.sort((s1, s2) => {
            if (index === 0) {
                return this.desc
                    ? s1.locale.localeCompare(s2.locale)
                    : s2.locale.localeCompare(s1.locale);
            } else {
                const v1 = Object.values(s1.values)[index - 1].maxWidth;
                const v2 = Object.values(s2.values)[index - 1].maxWidth;
                return this.desc ? v2 - v1 : v1 - v2;
            }
        });
    }
}

class DateWidthsAction extends Component {
    static template = xml`
        <div class="h-100 overflow-auto p-2">
            <button t-on-click="onClick">
                <t t-if="state.display === 'notebook'">Compute Stats</t>
                <t t-else="">Go Back</t>
            </button>
            <Notebook t-if="state.display === 'notebook'" pages="pages" defaultPage="state.defaultPage"/>
            <Stats t-else="" stats="stats"/>
        </div>`;
    static components = { Notebook, Stats };
    static props = ["*"];

    setup() {
        const orm = useService("orm");
        this.state = useState({
            display: "notebook",
            defaultPage: "en-US",
        });
        this.stats = null;

        onWillStart(async () => {
            const languages = await orm.webSearchRead("res.lang", [], {
                specification: {
                    code: {},
                    date_format: {},
                    time_format: {},
                },
                context: { active_test: false },
            });
            const formats = Object.fromEntries(
                languages.records.map((r) => [
                    pyToJsLocale(r.code),
                    `${r.date_format} ${r.time_format}`,
                ])
            );

            this.pages = Object.entries(formats)
                .sort(([code1], [code2]) => code1.localeCompare(code2))
                .map(([code, format]) => ({
                    Component: Page,
                    id: code,
                    title: code,
                    props: {
                        values: this.getValues(strftimeToLuxonFormat(format), code),
                        onStatsComputed: (stats) => {
                            if (this.computingStats) {
                                this.stats = this.stats || {};
                                this.stats[code] = stats;
                                this.computingStatsIndex++;
                                if (this.computingStatsIndex < this.pages.length) {
                                    this.state.defaultPage =
                                        this.pages[this.computingStatsIndex].id;
                                } else {
                                    this.state.display = "stats";
                                    this.computingStats = false;
                                }
                            }
                        },
                    },
                }));
        });
    }

    getValues(format, locale) {
        const resetLocale = forceLocale(locale);
        const values = [];
        for (let month = 1; month <= 12; month++) {
            for (let day = 11; day <= 17; day++) {
                values.push(
                    formatDateTime(luxon.DateTime.local(2017, month, day, 10, 30, 45), { format })
                );
                values.push(
                    formatDateTime(luxon.DateTime.local(2017, month, day, 20, 30, 45), { format })
                );
            }
        }
        resetLocale();
        return values;
    }

    onClick() {
        if (this.state.display === "notebook") {
            if (this.computingStats) {
                return;
            }
            if (!this.stats) {
                this.computingStats = true;
                this.computingStatsIndex = 0;
                this.state.defaultPage = this.pages[0].id;
            } else {
                this.state.display = "stats";
            }
        } else {
            this.state.display = "notebook";
        }
    }
}

registry.category("actions").add("date_widths_action", DateWidthsAction);
