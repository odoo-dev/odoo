import { _t } from "@web/core/l10n/translation";
import { getBorderWhite, DEFAULT_BG, getColor, getCustomColor, lightenColor, darkenColor } from "@web/core/colors/colors";
import { formatFloat } from "@web/views/fields/formatters";
import { SEP } from "./graph_model";
import { sortBy } from "@web/core/utils/arrays";
import { loadBundle } from "@web/core/assets";
import { renderToString } from "@web/core/utils/render";
import { useService } from "@web/core/utils/hooks";
import { browser } from "@web/core/browser/browser";
import { useDebounced } from "@web/core/utils/timing";

import { Component, onWillUnmount, useEffect, useRef, onWillStart, useState, onMounted } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { cookie } from "@web/core/browser/cookie";
import { ReportViewMeasures } from "@web/views/view_components/report_view_measures";

const NO_DATA = _t("No data");

const colorScheme = cookie.get("color_scheme");
const GRAPH_GRID_COLOR = getCustomColor(colorScheme, "rgba(0,0,0,.1)", "rgba(255,255,255,.15");
const GRAPH_LABEL_COLOR = getCustomColor(colorScheme, "#111827", "#E4E4E4");

/**
 * Custom Chart.js for Line chart:
 * Draw the scale grid on top of the chart to
 * see this last one correctly.
 */
const gridOnTop = {
    id: 'gridOnTop',
    afterDraw: (chart, args, options) => {
        if(chart.config.options.plugins.gridOnTop) {
            const elements = chart.getDatasetMeta(0).data || [];
            const ctx = chart.ctx;
            const chartArea = chart.chartArea;
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;

            ctx.lineWidth = options.gridLineWidth;
            ctx.strokeStyle = options.gridColor;

            // Draw Y axis scale
            yAxis.ticks.forEach((value, index) => {
                const y = yAxis.getPixelForTick(index);
                ctx.beginPath();
                // Draw the line scale
                ctx.moveTo(chartArea.left, y);
                ctx.lineTo(chartArea.right, y);
                // Draw the tick mark
                ctx.moveTo(chartArea.left - options.tickLength, y);
                ctx.lineTo(chartArea.left, y);
                ctx.setLineDash([]);
                ctx.stroke();
            });

            // Draw X axis tick marks
            xAxis.ticks.forEach((value, tickIndex) => {
                const x = xAxis.getPixelForTick(tickIndex);
                ctx.beginPath();
                ctx.moveTo(x, chartArea.bottom);
                ctx.lineTo(x, chartArea.bottom + options.tickLength);
                ctx.stroke();
            });

            // Draw the X axis dashed line
            elements.forEach((point, eltIndex) => {
                xAxis.ticks.forEach((value, tickIndex) => {
                    if(point.active && eltIndex === tickIndex) {
                        const x = xAxis.getPixelForTick(tickIndex);
                        ctx.beginPath();
                        ctx.moveTo(x, chartArea.top,);
                        ctx.lineTo(x, chartArea.bottom);
                        ctx.strokeStyle = options.highlightedGridColor;
                        ctx.stroke();
                    }
                });
            });
        }
    }
};

/**
 * Custom Chart.js plugin:
 * Create custom legends and push them
 * in o_graph_legend_container
 */
const customHtmlLegend = {
    id: 'customHtmlLegend',
    afterUpdate(chart, args, options) {
        if(chart.config.options.plugins.customHtmlLegend) {
            const list = document.querySelector(options.containerName);

            // Remove old legend items
            while (list.firstChild) {
                list.firstChild.remove();
            }

            // Reuse the built-in legendItems generator
            const items = chart.options.plugins.legend.labels.generateLabels(chart);
            options.labels = items;

            items.forEach(item => {
                const btnWrap = document.createElement('div');
                btnWrap.className = "col m-0 p-0";

                // Button
                const btn = document.createElement('button');
                btn.type = "button";
                btn.className = item.hidden ? 'opacity-50 text-decoration-line-through ' : ' ';
                btn.className += "btn btn-light d-flex gap-2 align-items-center w-100 h-100 cursor-pointer text-start lh-sm text-break";

                btn.onclick = () => {
                    const {type} = chart.config;
                    if (type === 'pie') {
                        chart.toggleDataVisibility(item.index);
                    } else {
                        chart.setDatasetVisibility(item.datasetIndex, !chart.isDatasetVisible(item.datasetIndex));
                    }
                    chart.update();
                };

                // Color box
                const boxColor = document.createElement('span');
                boxColor.style.background = item.fillStyle;
                boxColor.style.border= item.lineWidth + "px solid" + item.strokeStyle;
                boxColor.className = "o_graph_legend_item_box flex-shrink-0 rounded-pill";

                // Label
                const label = document.createElement('small');
                const text = document.createTextNode(item.text);
                label.appendChild(text);

                // Push elements in the DOM
                btn.appendChild(boxColor);
                btn.appendChild(label);
                btnWrap.appendChild(btn);
                list.appendChild(btnWrap);
            });
        }
    }
};

/**
 * Used to generate the max value of the grid (line & bar charts).
 * The purpose is to keep a bit of space between the highest data
 * and the top of the grid.
 * @param {Array} data
 * @param {Boolean} isStacked
 * @returns {Number}
 */
function getMaxValue(data, isStacked) {
    let max = 0;
    // If there is data
    if(data.datasets.length) {
        if(isStacked) {
            // Initialize an array to define the addition of values according to their index
            let maxValues = [];
            data.datasets[0].data.forEach((_, index) => {
                maxValues[index] = 0;
            });
            // Add values for each index
            data.datasets.forEach(dataset => {
                dataset.data.forEach((value, index) => {
                    maxValues[index] += value;
                });
            });
            // Get the highest value
            max = Math.max(...maxValues);
        } else {
            data.datasets.forEach(dataset => {
                const datasetMax = Math.max(...dataset.data);
                if (datasetMax > max) {
                    max = datasetMax;
                }
            });
        }
        // Return the max value and increase it a bit
        return max + (max * .1);
    }
}

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
 * @param {string} label
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

export class GraphRenderer extends Component {
    static template = "web.GraphRenderer";
    static components = { Dropdown, DropdownItem, ReportViewMeasures };
    static props = ["class?", "model", "buttonTemplate"];

    setup() {
        this.model = this.props.model;

        this.rootRef = useRef("root");
        this.canvasRef = useRef("canvas");
        this.containerRef = useRef("container");
        this.actionService = useService("action");

        this.chart = null;
        this.tooltip = null;
        this.legendTooltip = null;

        this.state = useState({
            isSmall: this.env.isSmall
        });
        this.debouncedOnResize = useDebounced(this.updateSize, 300);

        onWillStart(async () => {
            await loadBundle("web.chartjs_lib");
        });

        useEffect(() => this.renderChart());
        onWillUnmount(() => {
            this.onWillUnmount;
            browser.removeEventListener("resize", this.debouncedOnResize);
        });
        onMounted(() => {
            browser.addEventListener("resize", this.debouncedOnResize);
            this.updateSize();
        });
    }

    onWillUnmount() {
        if (this.chart) {
            this.chart.destroy();
        }
    }

    /**
     *
     * @return {void}
     */
    updateSize() {
        this.state.isSmall = this.env.isSmall;
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
            tr.classList.add("o_show_more", "text-center", "fw-bold");
            td.setAttribute("colspan", "2");
            td.innerText = _t("...");
            tr.appendChild(td);
            tooltip.querySelector("tbody").appendChild(tr);
        }
    }

    /**
     * Creates a custom HTML tooltip.
     * @param {Object} data
     * @param {Object} metaData
     * @param {Object} context see chartjs documentation
     */
    customTooltip(data, metaData, context) {
        const tooltipModel = context.tooltip;
        const { measure, measures, disableLinking, mode } = metaData;
        this.containerRef.el.style.cursor = "";
        this.removeTooltips();
        if (tooltipModel.opacity === 0 || tooltipModel.dataPoints.length === 0) {
            return;
        }
        if (!disableLinking && mode !== "line") {
            this.containerRef.el.style.cursor = "pointer";
        }
        const chartAreaTop = this.chart.chartArea.top;
        const viewContentTop = this.containerRef.el.getBoundingClientRect().top;
        const innerHTML = renderToString("web.GraphRenderer.CustomTooltip", {
            maxWidth: getMaxWidth(this.chart.chartArea),
            measure: measures[measure].string,
            mode: this.model.metaData.mode,
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
     * Used to format correctly the values in tooltip and y.
     * @param {number} value
     * @param {boolean} [allIntegers=true]
     * @returns {string}
     */
    formatValue(value, allIntegers = true) {
        const largeNumber = Math.abs(value) >= 1000;
        if (allIntegers && !largeNumber) {
            return String(value);
        }
        if (largeNumber) {
            return formatFloat(value, { humanReadable: true, decimals: 2, minDigits: 1 });
        }
        return formatFloat(value);
    }

    /**
     * Returns the bar chart data
     * @returns {Object}
     */
    getBarChartData() {
        // style data
        const { domains, stacked } = this.model.metaData;
        const { data, lineOverlayDataset } = this.model;
        const dashedLineColor = getCustomColor(colorScheme, "#111827", "#ffffff");
        for (let index = 0; index < data.datasets.length; ++index) {
            const dataset = data.datasets[index];
            const itemColor = getColor(index, colorScheme, data.datasets.length);
            // used when stacked
            if (stacked) {
                dataset.stack = domains[dataset.originIndex].description || "";
            }
            // set dataset color
            dataset.backgroundColor = itemColor;
            dataset.borderRadius = 4;
        }
        if (lineOverlayDataset) {
            // Mutate the lineOverlayDataset to include the config on how it will be displayed.
            Object.assign(lineOverlayDataset, {
                type: "line",
                order: -1,
                tension: 0,
                fill: false,
                borderWidth: 2,
                borderDash: [5, 4],
                borderColor: dashedLineColor,
                pointStyle: 'rectRot',
                pointHitRadius: 20,
                pointRadius: 5,
                pointHoverRadius: 10,
                backgroundColor: dashedLineColor,
            });
            // We're not mutating the original datasets (`this.model.data.datasets`)
            // because some part of the code depends on it.
            return {
                ...data,
                datasets: [...data.datasets, lineOverlayDataset],
            };
        }

        return data;
    }

    /**
     * Returns the chart config.
     * @returns {Object}
     */
    getChartConfig() {
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
     * Returns the animation options.
     * 1. This adds progressive animation for Bar & Line charts.
     * 2. Reduce animation duration for Pie chart.
     * @returns {Object}
     */
    getAnimationOptions() {
        let delayed;
        const { mode } = this.model.metaData;
        const animationOptions = {};
        if(mode != 'pie') {
            animationOptions.onComplete = () => {
                delayed = true;
            }
            animationOptions.delay = (context) => {
                let delay = 0;
                if ((mode === 'bar' || mode === 'line') && !delayed) {
                delay = context.dataIndex * 75;
                }
                return delay;
            }
        } else {
            animationOptions.offset = { duration: 200 }
        }
        return animationOptions;
    }

    /**
     * Returns an object used to style chart elements independently from
     * the datasets.
     * @returns {Object}
     */
    getElementOptions() {
        const { mode, stacked } = this.model.metaData;
        const elementOptions = {};
        if (mode === "bar") {
            elementOptions.bar = { borderWidth: 1 };
        } else if (mode === "line") {
            elementOptions.line = { fill: stacked, tension: 0 };
        }
        return elementOptions;
    }

    /**
     * @returns {Object}
     */
    getLegendOptions() {
        const { mode } = this.model.metaData;
        const legendOptions = {
            display: false,
        };
        if (mode === "line") {
            legendOptions.onClick = this.onLegendClick.bind(this);
        }
        if (mode === "pie") {
            legendOptions.labels = {
                generateLabels: (chart) => {
                    return chart.data.labels.map((label, index) => {
                        const hidden = !chart.getDataVisibility(index);
                        const text = label;
                        const fillStyle =
                            label === NO_DATA
                                ? DEFAULT_BG
                                : getColor(index, colorScheme, chart.data.labels.length);
                        return { text, fillStyle, hidden, index };
                    });
                },
            };
        } else {
            legendOptions.position = "top";
            legendOptions.align = "end";
            const referenceColor = mode === "bar" ? "backgroundColor" : "borderColor";
            legendOptions.labels = {
                generateLabels: (chart) => {
                    const { data } = chart;
                    const labels = data.datasets.map((dataset, index) => {
                        return {
                            text: dataset.label,
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
     * Returns line chart data.
     * @returns {Object}
     */
    getLineChartData() {
        const { cumulated, groupBy, domains } = this.model.metaData;
        const data = this.model.data;
        for (let index = 0; index < data.datasets.length; ++index) {
            const dataset = data.datasets[index];
            const itemColor =  getColor(index, colorScheme, data.datasets.length);
            dataset.backgroundColor = getCustomColor(colorScheme, lightenColor(itemColor, .5), darkenColor(itemColor, .5));
            dataset.cubicInterpolationMode = 'monotone';
            dataset.borderColor = itemColor;
            dataset.borderWidth = 2;
            dataset.hoverBackgroundColor = dataset.borderColor;
            dataset.pointRadius = 3;
            dataset.pointHoverRadius = 6;

            if (groupBy.length <= 1 && domains.length > 1) {
                    dataset.fill = "origin";
            }
            if (cumulated) {
                let accumulator = dataset.cumulatedStart;
                dataset.data = dataset.data.map((value) => {
                    accumulator += value;
                    return accumulator;
                });
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
        }
        // center the points in the chart (without that code they are put
        // on the left and the graph seems empty)
        data.labels = data.labels.length > 1 ? data.labels : ["", ...data.labels, ""];
        return data;
    }

    /**
     * Returns pie chart data.
     * @returns {Object}
     */
    getPieChartData() {
        const { domains } = this.model.metaData;
        const data = this.model.data;
        // style/complete data
        // give same color to same groups from different origins
        const colors = data.labels.map((_, index) => getColor(index, colorScheme, data.labels.length));
        const borderColor = getBorderWhite(colorScheme);
        for (const dataset of data.datasets) {
            dataset.backgroundColor = colors;
            dataset.hoverBackgroundColor = colors;
            dataset.borderColor = borderColor;
            dataset.hoverOffset = 60;
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
                    borderColor,
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
        const { labels } = this.model.data;
        const { allIntegers, measure, measures, mode, stacked } =
            this.model.metaData;
        if (mode === "pie") {
            return {};
        }
        const xAxe = {
            type: "category",
            ticks: {
                callback: (val, index) => {
                    const value = labels[index];
                    return shortenLabel(value);
                },
                color: GRAPH_LABEL_COLOR,
            },
            grid: {
                color: 'transparent',
            },
            border: {
                display: false,
            }
        };
        const yAxe = {
            beginAtZero: true,
            type: "linear",
            title: {
                text: measures[measure].string,
                color:
                    cookie.get("color_scheme") === "dark"
                        ? getColor(15, cookie.get("color_scheme"))
                        : null,
            },
            ticks: {
                callback: (value) => this.formatValue(value, allIntegers),
                color: GRAPH_LABEL_COLOR,
            },
            stacked: mode === "line" && stacked ? stacked : undefined,
            grid: {
                display: mode === 'line' ? false : true,
                color: GRAPH_GRID_COLOR,
            },
            border: {
                display: false,
            },
            suggestedMax: getMaxValue(this.model.data, stacked),
        };
        return { x: xAxe, y: yAxe };
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
        const sortedDataPoints = sortBy(tooltipModel.dataPoints, "raw", "desc");
        const items = [];
        for (const item of sortedDataPoints) {
            const index = item.dataIndex;
            // If `datasetIndex` is not found in the `datasets`, then it refers to the `lineOverlayDataset`.
            const dataset = data.datasets[item.datasetIndex] || this.model.lineOverlayDataset;
            let label = dataset.trueLabels[index];
            let value = this.formatValue(dataset.data[index], allIntegers);
            let boxColor;
            let percentage;
            if (mode === "pie") {
                if (label === NO_DATA) {
                    value = this.formatValue(0, allIntegers);
                }
                if (domains.length > 1) {
                    label = `${dataset.label} / ${label}`;
                }
                boxColor = dataset.backgroundColor[index];
                const totalData = dataset.data.reduce((a, b) => a + b, 0);
                percentage = totalData && ((dataset.data[index] * 100) / totalData).toFixed(2);
            } else {
                if (groupBy.length > 1 || domains.length > 1) {
                    label = `${label} / ${dataset.label}`;
                }
                boxColor = mode === "bar" ? dataset.backgroundColor : dataset.borderColor;
            }
            items.push({ label, value, boxColor, percentage });
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
        };
        tooltipOptions.external = this.customTooltip.bind(this, data, metaData);
        if (mode === "line") {
            tooltipOptions.mode = "index";
            tooltipOptions.intersect = false;
            tooltipOptions.position = "average";
        }
        if(mode === "bar") {
            tooltipOptions.xAlign = "center";
            tooltipOptions.yAlign = "bottom";
        }
        if(mode === "pie") {
            tooltipOptions.xAlign = "center";
            tooltipOptions.yAlign = "center";
        }
        return tooltipOptions;
    }

    /**
     * If a group has been clicked on, display a view of its records.
     * @param {MouseEvent} ev
     */
    onGraphClicked(ev) {
        const [activeElement] = this.chart.getElementsAtEventForMode(
            ev,
            "nearest",
            { intersect: true },
            false
        );
        if (!activeElement) {
            return;
        }
        const { datasetIndex, index } = activeElement;
        const { domains } = this.chart.data.datasets[datasetIndex];
        if (domains) {
            this.onGraphClickedFinal(domains[index]);
        }
    }

    /**
     * Overrides the default legend 'onClick' behaviour. This is done to
     * remove all existing tooltips right before updating the chart.
     * @param {Event} ev
     * @param {Object} legendItem
     */
    onLegendClick(ev, legendItem) {
        this.removeTooltips();
        // Default 'onClick' fallback. See web/static/lib/Chart/Chart.js#15138
        const index = legendItem.datasetIndex;
        const meta = this.chart.getDatasetMeta(index);
        meta.hidden = meta.hidden === null ? !this.chart.data.datasets[index].hidden : null;
        this.chart.update();
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
            plugins: {
                legend: this.getLegendOptions(),
                tooltip: this.getTooltipOptions(),
                customHtmlLegend: {
                    containerName: '.o_graph_legend_container',
                    model: this.model,
                },
                gridOnTop: mode != "line" ? false : true
            },
            elements: this.getElementOptions(),
            onResize: () => {this.resizeChart(options)},
            animation: this.getAnimationOptions(),
        }
        if (!disableLinking && mode !== "line") {
            options.onClick = this.onGraphClicked.bind(this);
        }
        if(mode === "line") {
            options.interaction = {
                mode: 'index',
                intersect: false,
            }
            options.plugins.gridOnTop = {
                gridLineWidth: 1,
                tickLength: 8,
                gridColor: GRAPH_GRID_COLOR,
                highlightedGridColor: GRAPH_GRID_COLOR,
                highlightedLineDash: [5,5],
            }
        }
        if(mode === "pie") {
            options.radius = "90%";
        }
        return options;
    }

    /**
     * Adapt Pie chart layout on mobile
     * @param {Object} context
     */
    resizeChart(context) {
        const { mode } = this.model.metaData;
        if(mode === "pie") {
            if(this.env.isSmall) {
                context.plugins.legend.position = "bottom";
                context.plugins.legend.align = "center";
            } else {
                context.plugins.legend.position = "right";
                context.plugins.legend.align = "start";
            }
        }
    }

    /**
     * Removes the legend tooltip (if any).
     */
    removeLegendTooltip() {
        if (this.legendTooltip) {
            this.legendTooltip.remove();
            this.legendTooltip = null;
        }
    }

    /**
     * Removes all existing tooltips (if any).
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
        Chart.register(customHtmlLegend);
        Chart.register(gridOnTop);

        if (this.chart) {
            this.chart.destroy();
        }
        if (this.canvasRef.el) {
            const config = this.getChartConfig();
            this.chart = new Chart(this.canvasRef.el, config);
        }
    }

    /**
     * Execute the action to open the view on the current model.
     *
     * @param {Array} domain
     * @param {Array} views
     * @param {Object} context
     */
    openView(domain, views, context) {
        this.actionService.doAction(
            {
                context,
                domain,
                name: this.model.metaData.title,
                res_model: this.model.metaData.resModel,
                target: "current",
                type: "ir.actions.act_window",
                views,
            },
            {
                viewType: "list",
            }
        );
    }
    /**
     * @param {string} domain the domain of the clicked area
     */
    onGraphClickedFinal(domain) {
        const { context } = this.model.metaData;

        Object.keys(context).forEach((x) => {
            if (x === "group_by" || x.startsWith("search_default_")) {
                delete context[x];
            }
        });

        const views = {};
        for (const [viewId, viewType] of this.env.config.views || []) {
            views[viewType] = viewId;
        }
        function getView(viewType) {
            return [views[viewType] || false, viewType];
        }
        const actionViews = [getView("list"), getView("form")];
        this.openView(domain, actionViews, context);
    }

    /**
     * @param {Object} param0
     * @param {string} param0.measure
     */
    onMeasureSelected({ measure }) {
        this.model.updateMetaData({ measure });
    }

    /**
     * @param {"bar"|"line"|"pie"} mode
     */
    onModeSelected(mode) {
        if(this.model.metaData.mode != mode) {
            this.model.updateMetaData({ mode });
        }
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

    toggleCumulated() {
        const { cumulated } = this.model.metaData;
        this.model.updateMetaData({ cumulated: !cumulated });
    }
}
