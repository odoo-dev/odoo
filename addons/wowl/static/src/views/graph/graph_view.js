/** @odoo-module **/
import { _lt } from "../../services/localization_service";

import { sortBy } from "../../utils/arrays";
import { evaluateExpr } from "../../py_js/py";

import { GROUPABLE_TYPES } from "../search/search_utils";
import { VIEW_PROPS, VIEW_DEFAULT_PROPS } from "../view_utils/misc";
import { useModel } from "../view_utils/model";

import { GraphModel, getMeasureDescription } from "./graph_model";
import { useService } from "../../core/hooks";
import { useSetupAction } from "../../actions/action_hook";

import { Layout } from "../view_utils/layout/layout";
import { GroupByMenu } from "../search/group_by_menu/group_by_menu";
import { FilterMenu } from "../search/filter_menu/filter_menu";
import { ComparisonMenu } from "../search/comparison_menu/comparison_menu";
import { FavoriteMenu } from "../search/favorite_menu/favorite_menu";
import { SearchBar } from "../search/search_bar/search_bar";
import { Dropdown } from "../../components/dropdown/dropdown";
import { DropdownItem } from "../../components/dropdown/dropdown_item";

const { Component, hooks } = owl;
const { useRef } = hooks;

const MODES = ["bar", "line", "pie"];
const ORDERS = ["ASC", "DESC", null];

const NO_DATA = _lt("No data");

const COLORS = [
  "#1f77b4",
  "#ff7f0e",
  "#aec7e8",
  "#ffbb78",
  "#2ca02c",
  "#98df8a",
  "#d62728",
  "#ff9896",
  "#9467bd",
  "#c5b0d5",
  "#8c564b",
  "#c49c94",
  "#e377c2",
  "#f7b6d2",
  "#7f7f7f",
  "#c7c7c7",
  "#bcbd22",
  "#dbdb8d",
  "#17becf",
  "#9edae5",
];
const RGB_REGEX = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
export const DEFAULT_BG = "#d3d3d3";
export const BORDER_WHITE = "rgba(255,255,255,0.6)";

/**
 * @param {number} index
 * @returns {string}
 */
function getColor(index) {
  return COLORS[index % COLORS.length];
}

/**
 * @param {string} hex
 * @param {number} opacity
 * @returns {string}
 */
function hexToRGBA(hex, opacity) {
  const rgb = RGB_REGEX.exec(hex)
    .slice(1, 4)
    .map((n) => parseInt(n, 16))
    .join(",");
  return `rgba(${rgb},${opacity})`;
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
 * @param {string|Strin} label
 * @returns {string} shortened version of the input label
 */
function shortenLabel(label) {
  // string returned could be wrong if a groupby value contain a " / "!
  const groups = label.toString().split(" / ");
  let shortLabel = groups.slice(0, 3).join(" / ");
  if (shortLabel.length > 30) {
    shortLabel = `${shortLabel.slice(0, 30)}...`;
  } else if (groups.length > 3) {
    shortLabel = `${shortLabel} /...`;
  }
  return shortLabel;
}

export function processGraphViewDescription(viewDescription) {
  const fields = viewDescription.fields || {};
  const arch = viewDescription.arch || "<graph/>";
  const parser = new DOMParser();
  const xml = parser.parseFromString(arch, "text/xml");

  const metaData = { fields };
  function parseXML(node) {
    if (!(node instanceof Element)) {
      return;
    }
    if (node.nodeType === 1) {
      switch (node.tagName) {
        case "graph":
          if (node.hasAttribute("disable_linking")) {
            metaData.disableLinking = Boolean(evaluateExpr(node.getAttribute("disable_linking")));
          }
          if (node.hasAttribute("stacked")) {
            metaData.stacked = Boolean(evaluateExpr(node.getAttribute("stacked")));
          }
          const mode = node.getAttribute("type");
          if (MODES.includes(mode)) {
            metaData.mode = mode;
          }
          const order = node.getAttribute("order");
          if (order && ORDERS.includes(order)) {
            metaData.order = order;
          }
          const title = node.getAttribute("string");
          if (title) {
            metaData.title = title;
          }
          for (let child of node.childNodes) {
            parseXML(child);
          }
          break;
        case "field":
          let fieldName = node.getAttribute("name"); // exists (rng validation)
          if (fieldName === "id") {
            break;
          }
          const isInvisible = Boolean(evaluateExpr(node.getAttribute("invisible") || "0"));
          if (isInvisible) {
            delete metaData.fields[fieldName]; // good idea??? It was not like that before (see also additionalMeasures and click on dashboard aggregate)
            // alternative: we could set invisible="1" on corresponding field in data.fields.
            break;
          }

          // would be better to do what follows through graph node attributes --> change rng and migrate?

          // before the string attribute was used eventually in menu "Measures"
          const isDefaultMeasure = node.getAttribute("type") === "measure";
          if (isDefaultMeasure) {
            metaData.activeMeasure = fieldName;
          } else {
            const { type } = metaData.fields[fieldName]; // exists (rng validation)
            if (GROUPABLE_TYPES.includes(type)) {
              let groupBy = fieldName;
              const interval = node.getAttribute("interval");
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
    this.canvasRef = useRef("canvas");
    this.containerRef = useRef("container");

    this._localizationService = useService("localization");

    this.chart = null;
    this.tooltip = null;
    this.legendTooltip = null;

    this.model = useModel({
      onUpdate: () => {
        this.renderChart();
      },
    });

    useSetupAction({
      // export: () => { return this.model.metaData; },
    });
  }

  mounted() {
    this.renderChart();
  }
  patched() {
    this.renderChart();
  }

  //////////////////////////////////////////////////////////////////////////////////////////

  //////////////////////////////////////////////////////////////////////////////////////////

  async onMeasureSelected(ev) {
    const { measure } = ev.detail.payload;
    this.model.load({ activeMeasure: measure });
  }
  async onModeSelected(mode) {
    this.model.load({ mode });
  }
  async toggleOrder(order) {
    const { order: currentOrder } = this.model.metaData;
    const nextOrder = currentOrder === order ? null : order;
    this.model.load({ order: nextOrder });
  }
  async toggleStacked() {
    const { stacked } = this.model.metaData;
    this.model.load({ stacked: !stacked });
  }

  /**
   * This function aims to remove a suitable number of lines from the
   * tooltip in order to make it reasonably visible. A message indicating
   * the number of lines is added if necessary.
   * @private
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
   * Creates a bar chart config.
   */
  createBarChartConfig() {
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
    const options = this.prepareOptions();
    // create bar chart config
    return { data, options, type: "bar" };
  }
  /**
   * Returns the graph configuration object.
   * @private
   * @returns {Object}
   */
  createConfig() {
    const { mode } = this.model.metaData;
    let config = {};
    switch (mode) {
      case "bar":
        config = this.createBarChartConfig();
        break;
      case "line":
        config = this.createLineChartConfig();
        break;
      case "pie":
        config = this.createPieChartConfig();
    }
    return config;
  }
  /**
   * Creates a line chart config.
   * @private
   */
  createLineChartConfig() {
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

    // prepare options
    const options = this.prepareOptions();
    // create line chart config
    return { data, options, type: "line" };
  }
  /**
   * Creates a pie chart config.
   * @private
   */
  createPieChartConfig() {
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
    const representedOriginIndexes = new Set(data.datasets.map((dataset) => dataset.originIndex));
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
    // prepare options
    const options = this.prepareOptions();
    // create pie chart config
    return { data, options, type: "pie" };
  }
  /**
   * Creates a custom HTML tooltip.
   * @private
   * @param {Object} tooltipModel see chartjs documentation
   */
  customTooltip(data, metaData, tooltipModel) {
    const { activeMeasure, disableLinking, fields, mode } = metaData;
    this.el.style.cursor = "";
    this.removeTooltips();
    if (tooltipModel.opacity === 0 || tooltipModel.dataPoints.length === 0) {
      return;
    }
    if (!disableLinking && mode !== "line") {
      this.el.style.cursor = "pointer";
    }
    const chartAreaTop = this.chart.chartArea.top;
    const viewTop = this.el.getBoundingClientRect().top;
    const innerHTML = this.env.qweb.renderToString("wowl.GraphView.CustomTooltip", {
      maxWidth: getMaxWidth(this.chart.chartArea),
      measure: getMeasureDescription(activeMeasure, fields),
      tooltipItems: this.getTooltipItems(data, metaData, tooltipModel),
    });
    const template = Object.assign(document.createElement("template"), { innerHTML });
    const tooltip = template.content.firstChild;
    this.containerRef.el.prepend(tooltip);

    let top;
    const tooltipHeight = tooltip.clientHeight;
    const minTopAllowed = Math.floor(chartAreaTop);
    const maxTopAllowed = Math.floor(window.innerHeight - (viewTop + tooltipHeight)) - 2;
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
      const maxTooltipHeight = window.innerHeight - (viewTop + chartAreaTop) - 2;
      this.adjustTooltipHeight(tooltip, maxTooltipHeight);
    }
    this.fixTooltipLeftPosition(tooltip, tooltipModel.x);
    tooltip.style.top = Math.floor(top) + "px";

    this.tooltip = tooltip;
  }
  /**
   * Sets best left position of a tooltip approaching the proposal x.
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
   */
  formatValue(value) {
    if (Math.abs(value) >= 1000) {
      return this._localizationService.humanNumber(value, { decimals: 2, minDigits: 1 });
    }
    return this._localizationService.formatFloat(value, { precision: 2 });
  }
  /**
   * Returns an object used to style chart elements independently from
   * the datasets.
   * @private
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
  getLegendOptions() {
    const { mode } = this.model.metaData;
    const { data } = this.model;
    const refLength = mode === "pie" ? data.labels.length : data.datasets.length;
    const legendOptions = {
      display: refLength <= 20,
      position: "top",
      onHover: this.onlegendHover.bind(this),
      onLeave: this.onLegendLeave.bind(this),
    };
    if (mode === "line") {
      legendOptions.onClick = this.onLegendClick.bind(this);
    }
    if (mode === "pie") {
      legendOptions.labels = {
        generateLabels: (chart) => {
          const { data } = chart;
          const metaData = data.datasets.map((_, index) => chart.getDatasetMeta(index).data);
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
   * Returns the options used to generate the chart axes.
   * @private
   * @returns {Object}
   */
  getScaleOptions() {
    const { activeMeasure, groupBy, mode, isEmbedded, fields } = this.model.metaData;
    if (mode === "pie") {
      return {};
    }
    const xAxe = {
      type: "category",
      scaleLabel: {
        display: Boolean(groupBy.length && !isEmbedded),
        labelString: groupBy.length ? fields[groupBy[0].fieldName].string : "",
      },
    };
    const yAxe = {
      type: "linear",
      scaleLabel: {
        display: !isEmbedded,
        labelString: getMeasureDescription(activeMeasure, fields),
      },
      ticks: {
        callback: (value) => this.formatValue(value),
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
   */
  getTooltipItems(data, metaData, tooltipModel) {
    const { domains, mode, groupBy } = metaData;
    const sortedDataPoints = sortBy(tooltipModel.dataPoints, "yLabel", "desc");
    const items = [];
    for (const item of sortedDataPoints) {
      const id = item.index;
      const dataset = data.datasets[item.datasetIndex];
      let label = dataset.trueLabels[id];
      let value = this.formatValue(dataset.data[id]);
      let boxColor;
      if (mode === "pie") {
        if (label === NO_DATA) {
          value = this.formatValue(0);
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
   */
  getTooltipOptions() {
    const { mode } = this.model.metaData;
    const tooltipOptions = {
      enabled: false,
      custom: this.customTooltip.bind(this, this.model.data, this.model.metaData),
    };
    if (mode === "line") {
      tooltipOptions.mode = "index";
      tooltipOptions.intersect = false;
    }
    return tooltipOptions;
  }
  /**
   * @private
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
      /** @todo */
      // this.trigger("open_view", { domain: domains[_index] });
    }
  }
  /**
   * Overrides the default legend 'onClick' behaviour. This is done to
   * remove all existing tooltips right before updating the chart.
   */
  onLegendClick(_, legendItem) {
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
    const viewTop = this.el.getBoundingClientRect().top;
    const legendTooltip = Object.assign(document.createElement("div"), {
      className: "o_tooltip_legend",
      innerText: fullText,
    });
    legendTooltip.style.top = `${ev.clientY - viewTop}px`;
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
   * @private
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
   * @private
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
}

GraphView.template = "wowl.GraphView";
GraphView.components = {
  Layout,
  FilterMenu,
  GroupByMenu,
  ComparisonMenu,
  FavoriteMenu,
  Dropdown,
  DropdownItem,
  SearchBar,
}; // define those components

GraphView.defaultProps = {
  ...VIEW_DEFAULT_PROPS,
  activeMeasure: "__count",
  additionalMeasures: [],
  disableLinking: false,
  mode: "bar",
  order: null,
  stacked: true,
  type: "graph",
};
GraphView.props = {
  ...VIEW_PROPS,
  activeMeasure: String,
  additionalMeasures: { type: Array, elements: String },
  disableLinking: Boolean,
  domains: { type: Array, elements: Object, optional: 1 }, // more descriptions
  groupBy: { type: Array, elements: [String, Object], optional: 1 }, // humm
  mode: { validate: (m) => MODES.includes(m) },
  order: { validate: (o) => ORDERS.includes(o) },
  stacked: Boolean,
  state: { type: Object, optional: 1 }, // to describe. Is it better to have it optional or to have a default {}?
  title: { type: String, optional: 1 },
};

GraphView.type = "graph";
GraphView.display_name = "graph";
GraphView.icon = "fa-bar-chart";
GraphView.multiRecord = true;

GraphView.processViewDescription = processGraphViewDescription;

GraphView.Model = GraphModel;
GraphView.searchMenuTypes = ["filter", "groupBy", "comparison", "favorite"];
GraphView.withSearchModel = true;
