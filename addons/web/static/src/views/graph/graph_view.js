/** @odoo-module **/

import { _lt } from "@web/core/l10n/translation";
import { BORDER_WHITE, DEFAULT_BG, getColor, hexToRGBA } from "./graph_utils";
import { CallbackRecorder, useSetupAction } from "@web/webclient/actions/action_hook";
import { evaluateExpr } from "@web/core/py_js/py";
import { formatFloat, humanNumber } from "@web/core/l10n/numbers";
import { getMeasureDescription, GraphModel, MODES, SEP } from "./graph_model";
import { GROUPABLE_TYPES } from "@web/search/search_utils";
import { registry } from "@web/core/registry";
import { sortBy } from "@web/core/utils/arrays";
import { useAssets } from "@web/core/assets";
import { useModel } from "@web/core/model";
import { useService } from "@web/core/service_hook";

const viewRegistry = registry.category("views");

const { Component, hooks } = owl;
const { useRef } = hooks;

const NO_DATA = _lt("No data");
const ORDERS = ["ASC", "DESC", null];

/**
 * @param {Object} chartArea
 * @returns {string}
 */
function getMaxWidth(chartArea) {
    const { left, right } = chartArea;
    return Math.floor((right - left) / 1.618) + "px";
}

/**
 * Used to avoid too long legend items.
 * @param {string|Strin} label
 * @returns {string} shortened version of the input label
 */
function shortenLabel(label) {
    // string returned could be wrong if a groupby value contain a " / "!
    const groups = label.toString().split(SEP);
    let shortLabel = groups.slice(0, 3).join(SEP);
    if (shortLabel.length > 30) {
        shortLabel = `${shortLabel.slice(0, 30)}...`;
    } else if (groups.length > 3) {
        shortLabel = `${shortLabel}${SEP}...`;
    }
    return shortLabel;
}

export function processGraphViewDescription(viewDescription) {
    const fields = viewDescription.fields || {};
    const arch = viewDescription.arch || "<graph/>";
    const parser = new DOMParser();
    const xml = parser.parseFromString(arch, "text/xml");

    const metaData = { fields, fieldModif: {} };
    function parseXML(node) {
        if (!(node instanceof Element)) {
            return;
        }
        if (node.nodeType === 1) {
            const nodeAttrs = {};
            for (const attrName of node.getAttributeNames()) {
                nodeAttrs[attrName] = node.getAttribute(attrName);
            }
            switch (node.tagName) {
                case "graph":
                    if ("disable_linking" in nodeAttrs) {
                        metaData.disableLinking = Boolean(evaluateExpr(nodeAttrs.disable_linking));
                    }
                    if ("stacked" in nodeAttrs) {
                        metaData.stacked = Boolean(evaluateExpr(nodeAttrs.stacked));
                    }
                    const mode = nodeAttrs.type;
                    if (mode && MODES.includes(mode)) {
                        metaData.mode = mode;
                    }
                    const order = nodeAttrs.order;
                    if (order && ORDERS.includes(order)) {
                        metaData.order = order;
                    }
                    const title = nodeAttrs.string;
                    if (title) {
                        metaData.title = title;
                    }
                    for (let child of node.childNodes) {
                        parseXML(child);
                    }
                    break;
                case "field":
                    let fieldName = nodeAttrs.name; // exists (rng validation)
                    if (fieldName === "id") {
                        break;
                    }
                    const string = nodeAttrs.string;
                    if (string) {
                        if (!metaData.fieldModif[fieldName]) {
                            metaData.fieldModif[fieldName] = {};
                        }
                        metaData.fieldModif[fieldName].string = string;
                    }
                    const isInvisible = Boolean(evaluateExpr(nodeAttrs.invisible || "0"));
                    if (isInvisible) {
                        if (!metaData.fieldModif[fieldName]) {
                            metaData.fieldModif[fieldName] = {};
                        }
                        metaData.fieldModif[fieldName].invisible = true;
                        break;
                    }
                    const isMeasure = nodeAttrs.type === "measure";
                    if (isMeasure) {
                        if (!metaData.fieldModif[fieldName]) {
                            metaData.fieldModif[fieldName] = {};
                        }
                        metaData.fieldModif[fieldName].isMeasure = true;
                        // the last field with type="measure" (if any) will be used as measure else __count
                        metaData.measure = fieldName;
                    } else {
                        const { type } = metaData.fields[fieldName]; // exists (rng validation)
                        if (GROUPABLE_TYPES.includes(type)) {
                            let groupBy = fieldName;
                            const interval = nodeAttrs.interval;
                            if (interval) {
                                groupBy += `:${interval}`;
                            }
                            if (!metaData.groupBy) {
                                metaData.groupBy = [];
                            }
                            metaData.groupBy.push(groupBy);
                        }
                    }
                    break;
            }
        }
    }
    parseXML(xml.documentElement);
    return metaData;
}

export class GraphView extends Component {
    setup() {
        this._actionService = useService("action");

        this.canvasRef = useRef("canvas");
        this.containerRef = useRef("container");

        this.chart = null;
        this.tooltip = null;
        this.legendTooltip = null;

        this.buttonTemplate = this.constructor.buttonTemplate;
        this.model = useModel({ Model: this.constructor.Model });

        useSetupAction({
            exportState: () => this.model.metaData,
            saveParams: () => this.saveParams(),
        });

        useAssets({ jsLibs: ["/web/static/lib/Chart/Chart.js"] });
    }

    async willStart() {
        const { arch, fields, groupBy, state } = this.props;
        const loadParams = {};
        if (state) {
            // we could simplify this
            loadParams.state = state;
            this.initialGroupBy = state.groupBy || [];
        } else {
            const propsFromArch = processGraphViewDescription({ arch, fields });
            Object.assign(loadParams, this.props, propsFromArch);
            if (propsFromArch.groupBy && propsFromArch.length === 0) {
                loadParams.groupBy = groupBy;
            }
            this.initialGroupBy = loadParams.groupBy || [];
        }
        await this.model.load(loadParams);
    }

    async willUpdateProps(nextProps) {
        // we only consider changes in "context", "domains", "groupBy"
        const loadParams = {};
        for (const key of ["context", "domains", "groupBy"]) {
            loadParams[key] = nextProps[key];
        }
        if (loadParams.groupBy && loadParams.groupBy.length === 0) {
            loadParams.groupBy = this.initialGroupBy;
        }
        loadParams.useSampleModel = false;
        await this.model.load(loadParams);
    }

    mounted() {
        this.renderChart();
    }
    patched() {
        this.renderChart();
    }

    /**
     * @returns {Object}
     */
    get controlPanelProps() {
        const { breadcrumbs, display, displayName, viewSwitcherEntries } = this.props;
        const controlPanelProps = { breadcrumbs, displayName, viewSwitcherEntries };
        controlPanelProps.display = display.controlPanel;
        return controlPanelProps;
    }

    /**
     * This function aims to remove a suitable number of lines from the
     * tooltip in order to make it reasonably visible. A message indicating
     * the number of lines is added if necessary.
     * @param {HTMLElement} tooltip
     * @param {number} maxTooltipHeight this the max height in pixels of the tooltip
     */
    adjustTooltipHeight(tooltip, maxTooltipHeight) {
        const sizeOneLine = tooltip.querySelector("tbody tr").clientHeight;
        const tbodySize = tooltip.querySelector("tbody").clientHeight;
        const toKeep = Math.max(
            0,
            Math.floor((maxTooltipHeight - (tooltip.clientHeight - tbodySize)) / sizeOneLine) - 1
        );
        const lines = tooltip.querySelectorAll("tbody tr");
        const toRemove = lines.length - toKeep;
        if (toRemove > 0) {
            for (let index = toKeep; index < lines.length; ++index) {
                lines[index].remove();
            }
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            tr.classList.add("o_show_more");
            td.innerHTML = this.env._t("...");
            tr.appendChild(td);
            tooltip.querySelector("tbody").appendChild(tr);
        }
    }

    /**
     * Returns the graph configuration object.
     * @returns {Object}
     */
    createConfig() {
        const { mode } = this.model.metaData;
        let data;
        switch (mode) {
            case "bar":
                data = this.getBarChartData();
                break;
            case "line":
                data = this.getLineChartData();
                break;
            case "pie":
                data = this.getPieChartData();
        }
        const options = this.prepareOptions();
        return { data, options, type: mode };
    }

    /**
     * Creates a custom HTML tooltip.
     * @param {Object} data
     * @param {Object} metaData
     * @param {Object} tooltipModel see chartjs documentation
     */
    customTooltip(data, metaData, tooltipModel) {
        const { measure, disableLinking, fields, fieldModif, mode } = metaData;
        this.el.style.cursor = "";
        this.removeTooltips();
        if (tooltipModel.opacity === 0 || tooltipModel.dataPoints.length === 0) {
            return;
        }
        if (!disableLinking && mode !== "line") {
            this.el.style.cursor = "pointer";
        }
        const chartAreaTop = this.chart.chartArea.top;
        const viewContentTop = this.el.querySelector(".o_content").getBoundingClientRect().top;
        const innerHTML = this.env.qweb.renderToString("web.GraphView.CustomTooltip", {
            maxWidth: getMaxWidth(this.chart.chartArea),
            measure: getMeasureDescription(measure, fields, fieldModif),
            tooltipItems: this.getTooltipItems(data, metaData, tooltipModel),
        });
        const template = Object.assign(document.createElement("template"), { innerHTML });
        const tooltip = template.content.firstChild;
        this.containerRef.el.prepend(tooltip);

        let top;
        const tooltipHeight = tooltip.clientHeight;
        const minTopAllowed = Math.floor(chartAreaTop);
        const maxTopAllowed = Math.floor(window.innerHeight - (viewContentTop + tooltipHeight)) - 2;
        const y = Math.floor(tooltipModel.y);
        if (minTopAllowed <= maxTopAllowed) {
            // Here we know that the full tooltip can fit in the screen.
            // We put it in the position where Chart.js would put it
            // if two conditions are respected:
            //  1: the tooltip is not cut (because we know it is possible to not cut it)
            //  2: the tooltip does not hide the legend.
            // If it is not possible to use the Chart.js proposition (y)
            // we use the best approximated value.
            if (y <= maxTopAllowed) {
                if (y >= minTopAllowed) {
                    top = y;
                } else {
                    top = minTopAllowed;
                }
            } else {
                top = maxTopAllowed;
            }
        } else {
            // Here we know that we cannot satisfy condition 1 above,
            // so we position the tooltip at the minimal position and
            // cut it the minimum possible.
            top = minTopAllowed;
            const maxTooltipHeight = window.innerHeight - (viewContentTop + chartAreaTop) - 2;
            this.adjustTooltipHeight(tooltip, maxTooltipHeight);
        }
        this.fixTooltipLeftPosition(tooltip, tooltipModel.x);
        tooltip.style.top = Math.floor(top) + "px";

        this.tooltip = tooltip;
    }

    /**
     * Sets best left position of a tooltip approaching the proposal x.
     * @param {HTMLElement} tooltip
     * @param {number} x
     */
    fixTooltipLeftPosition(tooltip, x) {
        let left;
        const tooltipWidth = tooltip.clientWidth;
        const minLeftAllowed = Math.floor(this.chart.chartArea.left + 2);
        const maxLeftAllowed = Math.floor(this.chart.chartArea.right - tooltipWidth - 2);
        x = Math.floor(x);
        if (x < minLeftAllowed) {
            left = minLeftAllowed;
        } else if (x > maxLeftAllowed) {
            left = maxLeftAllowed;
        } else {
            left = x;
        }
        tooltip.style.left = `${left}px`;
    }

    /**
     * Used to format correctly the values in tooltips and yAxes.
     * @param {number} value
     * @param {boolean} [allIntegers=true]
     * @returns {string}
     */
    formatValue(value, allIntegers = true) {
        if (Math.abs(value) >= 1000) {
            return humanNumber(value, { decimals: 2, minDigits: 1 });
        }
        if (allIntegers) {
            return String(value);
        }
        return formatFloat(value, { precision: 2 });
    }

    /**
     * Creates a bar chart config.
     * @returns {Object}
     */
    getBarChartData() {
        // style data
        const { domains, stacked } = this.model.metaData;
        const { data } = this.model;
        for (let index = 0; index < data.datasets.length; ++index) {
            const dataset = data.datasets[index];
            // used when stacked
            if (stacked) {
                dataset.stack = domains[dataset.originIndex].description || "";
            }
            // set dataset color
            dataset.backgroundColor = getColor(index);
        }
        // prepare options
        // create bar chart config
        return data;
    }

    /**
     * Returns an object used to style chart elements independently from
     * the datasets.
     * @returns {Object}
     */
    getElementOptions() {
        const { mode } = this.model.metaData;
        const elementOptions = {};
        if (mode === "bar") {
            elementOptions.rectangle = { borderWidth: 1 };
        } else if (mode === "line") {
            elementOptions.line = { fill: false, tension: 0 };
        }
        return elementOptions;
    }

    /**
     * @returns {Object}
     */
    getLegendOptions() {
        const { display, mode } = this.model.metaData;
        const { data } = this.model;
        const refLength = mode === "pie" ? data.labels.length : data.datasets.length;
        const displayLegend = "legend" in display ? display.legend : true;
        const legendOptions = {
            display: refLength <= 20 && displayLegend,
            position: "top",
            onHover: this.onlegendHover.bind(this),
            onLeave: this.onLegendLeave.bind(this),
        };
        if (mode === "line") {
            legendOptions.onClick = this.onLegendClick.bind(this);
        }
        /** @todo check this seems complicated */
        if (mode === "pie") {
            legendOptions.labels = {
                generateLabels: (chart) => {
                    const { data } = chart;
                    const metaData = data.datasets.map(
                        (_, index) => chart.getDatasetMeta(index).data
                    );
                    const labels = data.labels.map((label, index) => {
                        const hidden = metaData.some((data) => data[index] && data[index].hidden);
                        const fullText = label;
                        const text = shortenLabel(fullText);
                        const fillStyle = label === NO_DATA ? DEFAULT_BG : getColor(index);
                        return { text, fullText, fillStyle, hidden, index };
                    });
                    return labels;
                },
            };
        } else {
            const referenceColor = mode === "bar" ? "backgroundColor" : "borderColor";
            legendOptions.labels = {
                generateLabels: (chart) => {
                    const { data } = chart;
                    const labels = data.datasets.map((dataset, index) => {
                        return {
                            text: shortenLabel(dataset.label),
                            fullText: dataset.label,
                            fillStyle: dataset[referenceColor],
                            hidden: !chart.isDatasetVisible(index),
                            lineCap: dataset.borderCapStyle,
                            lineDash: dataset.borderDash,
                            lineDashOffset: dataset.borderDashOffset,
                            lineJoin: dataset.borderJoinStyle,
                            lineWidth: dataset.borderWidth,
                            strokeStyle: dataset[referenceColor],
                            pointStyle: dataset.pointStyle,
                            datasetIndex: index,
                        };
                    });
                    return labels;
                },
            };
        }
        return legendOptions;
    }

    /**
     * Creates a line chart config.
     * @returns {Object}
     */
    getLineChartData() {
        // prepare data
        const { groupBy, domains } = this.model.metaData;
        const { data } = this.model;
        for (let index = 0; index < data.datasets.length; ++index) {
            const dataset = data.datasets[index];
            if (groupBy.length <= 1 && domains.length > 1) {
                if (dataset.originIndex === 0) {
                    dataset.fill = "origin";
                    dataset.backgroundColor = hexToRGBA(getColor(0), 0.4);
                    dataset.borderColor = getColor(0);
                } else if (dataset.originIndex === 1) {
                    dataset.borderColor = getColor(1);
                } else {
                    dataset.borderColor = getColor(index);
                }
            } else {
                dataset.borderColor = getColor(index);
            }
            if (data.labels.length === 1) {
                // shift of the real value to right. This is done to
                // center the points in the chart. See data.labels below in
                // Chart parameters
                dataset.data.unshift(undefined);
                dataset.trueLabels.unshift(undefined);
                dataset.domains.unshift(undefined);
            }
            dataset.pointBackgroundColor = dataset.borderColor;
            dataset.pointBorderColor = "rgba(0,0,0,0.2)";
        }
        if (data.datasets.length === 1) {
            const dataset = data.datasets[0];
            dataset.fill = "origin";
            dataset.backgroundColor = hexToRGBA(getColor(0), 0.4);
        }
        // center the points in the chart (without that code they are put
        // on the left and the graph seems empty)
        data.labels = data.labels.length > 1 ? data.labels : ["", ...data.labels, ""];

        return data;
    }

    /**
     * Creates a pie chart config.
     * @returns {Object}
     */
    getPieChartData() {
        const { domains } = this.model.metaData;
        const { data } = this.model;
        // style/complete data
        // give same color to same groups from different origins
        const colors = data.labels.map((_, index) => getColor(index));
        for (const dataset of data.datasets) {
            dataset.backgroundColor = colors;
            dataset.borderColor = BORDER_WHITE;
        }
        // make sure there is a zone associated with every origin
        const representedOriginIndexes = new Set(
            data.datasets.map((dataset) => dataset.originIndex)
        );
        let addNoDataToLegend = false;
        const fakeData = new Array(data.labels.length + 1);
        fakeData[data.labels.length] = 1;
        const fakeTrueLabels = new Array(data.labels.length + 1);
        fakeTrueLabels[data.labels.length] = NO_DATA;
        for (let index = 0; index < domains.length; ++index) {
            if (!representedOriginIndexes.has(index)) {
                data.datasets.push({
                    label: domains[index].description,
                    data: fakeData,
                    trueLabels: fakeTrueLabels,
                    backgroundColor: [...colors, DEFAULT_BG],
                    borderColor: BORDER_WHITE,
                });
                addNoDataToLegend = true;
            }
        }
        if (addNoDataToLegend) {
            data.labels.push(NO_DATA);
        }

        return data;
    }

    /**
     * Returns the options used to generate the chart axes.
     * @returns {Object}
     */
    getScaleOptions() {
        const {
            allIntegers,
            display,
            fields,
            fieldModif,
            groupBy,
            measure,
            mode,
        } = this.model.metaData;
        if (mode === "pie") {
            return {};
        }
        const displayScaleLabels = "scaleLabels" in display ? display.scaleLabels : true;
        const xAxe = {
            type: "category",
            scaleLabel: {
                display: Boolean(groupBy.length && displayScaleLabels),
                labelString: groupBy.length ? fields[groupBy[0].fieldName].string : "",
            },
        };
        const yAxe = {
            type: "linear",
            scaleLabel: {
                display: displayScaleLabels,
                labelString: getMeasureDescription(measure, fields, fieldModif),
            },
            ticks: {
                callback: (value) => this.formatValue(value, allIntegers),
                suggestedMax: 0,
                suggestedMin: 0,
            },
        };
        return { xAxes: [xAxe], yAxes: [yAxe] };
    }

    /**
     * This function extracts the information from the data points in
     * tooltipModel.dataPoints (corresponding to datapoints over a given
     * label determined by the mouse position) that will be displayed in a
     * custom tooltip.
     * @param {Object} data
     * @param {Object} metaData
     * @param {Object} tooltipModel see chartjs documentation
     * @returns {Object[]}
     */
    getTooltipItems(data, metaData, tooltipModel) {
        const { allIntegers, domains, mode, groupBy } = metaData;
        const sortedDataPoints = sortBy(tooltipModel.dataPoints, "yLabel", "desc");
        const items = [];
        for (const item of sortedDataPoints) {
            const id = item.index;
            const dataset = data.datasets[item.datasetIndex];
            let label = dataset.trueLabels[id];
            let value = this.formatValue(dataset.data[id], allIntegers);
            let boxColor;
            if (mode === "pie") {
                if (label === NO_DATA) {
                    value = this.formatValue(0, allIntegers);
                }
                if (domains.length > 1) {
                    label = `${dataset.label} / ${label}`;
                }
                boxColor = dataset.backgroundColor[id];
            } else {
                if (groupBy.length > 1 || domains.length > 1) {
                    label = `${label} / ${dataset.label}`;
                }
                boxColor = mode === "bar" ? dataset.backgroundColor : dataset.borderColor;
            }
            items.push({ id, label, value, boxColor });
        }
        return items;
    }

    /**
     * Returns the options used to generate chart tooltips.
     * @returns {Object}
     */
    getTooltipOptions() {
        const { data, metaData } = this.model;
        const { mode } = metaData;
        const tooltipOptions = {
            enabled: false,
            custom: this.customTooltip.bind(this, data, metaData),
        };
        if (mode === "line") {
            tooltipOptions.mode = "index";
            tooltipOptions.intersect = false;
        }
        return tooltipOptions;
    }

    /**
     * @param {MouseEvent} ev
     */
    onGraphClicked(ev) {
        const [activeElement] = this.chart.getElementAtEvent(ev);
        if (!activeElement) {
            return;
        }
        const { _datasetIndex, _index } = activeElement;
        const { domains } = this.chart.data.datasets[_datasetIndex];
        if (domains) {
            const { context, modelName, title } = this.model.metaData;

            const views = {};
            for (const [viewId, viewType] of this.props.views || []) {
                views[viewType] = viewId;
            }
            function getView(viewType) {
                return [views[viewType] || false, viewType];
            }
            const actionViews = [getView("list"), getView("form")];

            this._actionService.doAction(
                {
                    context,
                    domain: domains[_index],
                    name: title,
                    res_model: modelName,
                    target: "current",
                    type: "ir.actions.act_window",
                    views: actionViews,
                },
                {
                    viewType: "list",
                }
            );
        }
    }

    /**
     * Overrides the default legend 'onClick' behaviour. This is done to
     * remove all existing tooltips right before updating the chart.
     * @param {Event} ev
     * @param {Object} legendItem
     */
    onLegendClick(ev, legendItem) {
        /** @todo check this in line mode */
        this.removeTooltips();
        // Default 'onClick' fallback. See web/static/lib/Chart/Chart.js#15138
        const index = legendItem.datasetIndex;
        const meta = this.chart.getDatasetMeta(index);
        meta.hidden =
            meta.hidden === null ? Boolean(this.chart.data.datasets[index].hidden) : undefined;
        this.chart.update();
    }

    /**
     * If the text of a legend item has been shortened and the user mouse
     * hovers that item (actually the event type is mousemove), a tooltip
     * with the item full text is displayed.
     * @param {Event} ev
     * @param {Object} legendItem
     */
    onlegendHover(ev, legendItem) {
        this.canvasRef.el.style.cursor = "pointer";
        /**
         * The string legendItem.text is an initial segment of legendItem.fullText.
         * If the two coincide, no need to generate a tooltip. If a tooltip
         * for the legend already exists, it is already good and does not
         * need to be recreated.
         */
        const { fullText, text } = legendItem;
        if (this.legendTooltip || text === fullText) {
            return;
        }
        const viewContentTop = this.el.querySelector(".o_content").getBoundingClientRect().top;
        const legendTooltip = Object.assign(document.createElement("div"), {
            className: "o_tooltip_legend",
            innerText: fullText,
        });
        legendTooltip.style.top = `${ev.clientY - viewContentTop}px`;
        legendTooltip.style.maxWidth = getMaxWidth(this.chart.chartArea);
        this.containerRef.el.appendChild(legendTooltip);
        this.fixTooltipLeftPosition(legendTooltip, ev.clientX);
        this.legendTooltip = legendTooltip;
    }

    /**
     * If there's a legend tooltip and the user mouse out of the
     * corresponding legend item, the tooltip is removed.
     */
    onLegendLeave() {
        this.canvasRef.el.style.cursor = "";
        this.removeLegendTooltip();
    }

    /**
     * @param {CustomEvent} ev
     */
    onMeasureSelected(ev) {
        const { measure } = ev.detail.payload;
        this.model.updateMetaData({ measure });
    }

    /**
     * @param {"bar"|"line"|"pie"} mode
     */
    onModeSelected(mode) {
        this.model.updateMetaData({ mode });
    }

    /**
     * @returns {Object}
     */
    saveParams() {
        // expand context object? change keys?
        const { measure, groupBy, mode } = this.model.metaData;
        return {
            context: {
                graph_measure: measure,
                graph_mode: mode,
                graph_groupbys: groupBy.map((gb) => gb.spec),
            },
        };
    }

    /**
     * Prepares options for the chart according to the current mode
     * (= chart type). This function returns the parameter options used to
     * instantiate the chart.
     */
    prepareOptions() {
        const { disableLinking, mode } = this.model.metaData;
        const options = {
            maintainAspectRatio: false,
            scales: this.getScaleOptions(),
            legend: this.getLegendOptions(),
            tooltips: this.getTooltipOptions(),
            elements: this.getElementOptions(),
        };
        if (!disableLinking && mode !== "line") {
            options.onClick = this.onGraphClicked.bind(this);
        }
        return options;
    }

    removeLegendTooltip() {
        if (this.legendTooltip) {
            this.legendTooltip.remove();
            this.legendTooltip = null;
        }
    }

    /**
     * Removes all existing tooltips.
     */
    removeTooltips() {
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }
        this.removeLegendTooltip();
    }

    /**
     * Instantiates a Chart (Chart.js lib) to render the graph according to
     * the current config.
     */
    renderChart() {
        const { data } = this.model;
        if (data === null) {
            return;
        }
        if (this.chart) {
            this.chart.destroy();
        }
        const config = this.createConfig();
        this.chart = new Chart(this.canvasRef.el, config);
        // To perform its animations, ChartJS will perform each animation
        // step in the next animation frame. The initial rendering itself
        // is delayed for consistency. We can avoid this by manually
        // advancing the animation service.
        Chart.animationService.advance();
    }

    /**
     * @param {"ASC"|"DESC"} order
     */
    toggleOrder(order) {
        const { order: currentOrder } = this.model.metaData;
        const nextOrder = currentOrder === order ? null : order;
        this.model.updateMetaData({ order: nextOrder });
    }

    toggleStacked() {
        const { stacked } = this.model.metaData;
        this.model.updateMetaData({ stacked: !stacked });
    }
}

GraphView.template = "web.GraphView";

GraphView.defaultProps = {
    arch: `<graph/>`,
    breadcrumbs: [],
    context: {},
    display: {},
    domains: [{ arrayRepr: [], description: null }],
    fields: {},
    groupBy: [],
    useSampleModel: false,

    additionalMeasures: [],
    disableLinking: false,
    fieldModif: {},
    measure: "__count",
    mode: "bar",
    order: null,
    stacked: true,
};

GraphView.props = {
    modelName: String,

    arch: { type: String, optional: 1 },
    breadcrumbs: { type: Array, optional: 1 },
    __exportState__: { type: CallbackRecorder, optional: 1 },
    __saveParams__: { type: CallbackRecorder, optional: 1 },
    context: { type: Object, optional: 1 },
    display: { type: Object, optional: 1 },
    displayName: { type: String, optional: 1 },
    domains: { type: Array, elements: Object, optional: 1 },
    fields: { type: Object, elements: Object, optional: 1 },
    groupBy: { type: Array, elements: String, optional: 1 },
    noContentHelp: { type: String, optional: 1 },
    state: { type: Object, optional: 1 },
    views: { type: Array, element: Array, optional: 1 },
    viewSwitcherEntries: { type: Array, optional: 1 },
    useSampleModel: { type: Boolean, optional: 1 },

    additionalMeasures: { type: Array, elements: String, optional: 1 },
    disableLinking: { type: Boolean, optional: 1 },
    fieldModif: { type: Object, elements: Object, optional: 1 },
    measure: { type: String, optional: 1 },
    mode: { validate: (m) => MODES.includes(m), optional: 1 },
    order: { validate: (o) => ORDERS.includes(o), optional: 1 },
    stacked: { type: Boolean, optional: 1 },
    title: { type: String, optional: 1 },
};

GraphView.type = "graph"; // refer to python view type

GraphView.display_name = _lt("Graph");
GraphView.icon = "fa-bar-chart";
GraphView.multiRecord = true;

GraphView.buttonTemplate = "web.GraphView.Buttons";
GraphView.Model = GraphModel;
GraphView.searchMenuTypes = ["filter", "groupBy", "comparison", "favorite"];

viewRegistry.add("graph", GraphView);
