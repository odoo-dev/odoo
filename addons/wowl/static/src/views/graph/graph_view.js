/** @odoo-module **/
import {
  GraphModel,
  DEFAULT_MEASURE,
  MODES,
  ORDERS,
  DEFAUL_ORDER,
  DEFAULT_MODE,
} from "./graph_model";
import { GROUPABLE_TYPES, rankInterval } from "../view_utils/search_utils";
const { Component, hooks } = owl;
import { sortBy } from "../../utils/arrays";
import { useSearch, useSetupView } from "../view_utils/hooks";
import { useService } from "../../core/hooks";
import { _lt } from "../../services/localization";
import { processGraphViewDescription } from "./graph_arch_processor";
import { getGroupBy } from "../view_utils/group_by";
const { useState, useRef } = hooks;
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
function getColor(index) {
  return COLORS[index % COLORS.length];
}
const DEFAULT_BG = "#d3d3d3";
// // used to format values in tooltips and yAxes.
// const FORMAT_OPTIONS = {
//   // allow to decide if utils.human_number should be used
//   humanReadable: value => Math.abs(value) >= 1000,
//   // with the choices below, 1236 is represented by 1.24k
//   minDigits: 1,
//   decimals: 2,
//   // avoid comma separators for thousands in numbers when human_number is used
//   formatterCallback: str => str,
// };
// // hide top legend when too many items for device size
const MAX_LEGEND_LENGTH = 20; // 4 * Math.max(1, device.size_class);
const RGB_REGEX = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
/**
 * @param {Object} chartArea
 * @returns {string}
 */
function getMaxWidth(chartArea) {
  const { left, right } = chartArea;
  return Math.floor((right - left) / 1.618) + "px";
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
// /**
// * Used to avoid too long legend items.
// * @param {string} label
// * @returns {string} shortened version of the input label
// */
// function shortenLabel(label) {
//   // string returned could be wrong if a groupby value contain a "/"!
//   const groups = label.split("/");
//   let shortLabel = groups.slice(0, 3).join("/");
//   if (shortLabel.length > 30) {
//       shortLabel = `${shortLabel.slice(0, 30)}...`;
//   } else if (groups.length > 3) {
//       shortLabel = `${shortLabel}/...`;
//   }
//   return shortLabel;
// }
export const VIEW_DEFAULT_PROPS = {
  action: {},
  fields: {},
  isEmbedded: false,
  isSample: false,
};
export const VIEW_PROPS = {
  action: Object, // not sure yet
  fields: { type: Object, elements: Object }, // more precision on elements...
  model: String,
  isEmbedded: Boolean,
  isSample: Boolean,
  processedSearchViewDescription: { type: Object, optional: 1 },
  viewSwitcherEntries: { type: Array, elements: Object, optional: 1 },
};
export const GRAPH_DEFAULT_PROPS = {
  ...VIEW_DEFAULT_PROPS,
  activeMeasure: DEFAULT_MEASURE,
  additionalMeasures: [],
  disableLinking: false,
  groupBy: [],
  mode: DEFAULT_MODE,
  order: DEFAUL_ORDER,
  stacked: true,
  title: "Undefined", // we should be sure it is in translated term in one way or other
};
export const GRAPH_PROPS = {
  ...VIEW_PROPS,
  activeMeasure: String,
  additionalMeasures: { type: Array, elements: String },
  disableLinking: Boolean,
  groupBy: { type: Array, elements: String },
  mode: { validate: (m) => MODES.includes(m) },
  order: { validate: (o) => ORDERS.includes(o) },
  stacked: Boolean,
  title: String,
};
export class GraphView extends Component {
  constructor() {
    super(...arguments);
    this.measures = {};
    this.groupableFields = {};
    this.groupBy = [];
    this.initialGroupBy = [];
    this.title = this.env._t(this.props.title);
    this.canvasRef = useRef("canvas");
    this.containerRef = useRef("container");
    this.chart = null;
    this.tooltip = null;
    this.legendTooltip = null;
    this.noDataLabel = [this.env._t("No data")]; // compliqué...
    // sampleDataTargets = [".o_graph_canvas_container"]; // was used for sample data
    this.state = useState(
      Object.assign(
        {
          activeMeasure: this.props.activeMeasure,
          stacked: this.props.stacked,
          mode: this.props.mode,
          order: this.props.order,
        },
        this.props.state
      )
    );
    this.searchModel = useSearch({
      searchMenuTypes: ["filter", "groupBy", "comparison", "favorite"],
      onSearchUpdate: async () => {
        await this.loadModel();
        this.render();
      },
    });
    this._modelService = useService("model");
    useSetupView({
      export: () => {
        return this.state;
      },
    });

    const fields = this.props.fields;
    for (const fieldName in fields) {
      const field = fields[fieldName];
      if (fieldName !== "id" && field.store === true) {
        if (
          ["integer", "float", "monetary"].includes(field.type) ||
          this.props.additionalMeasures.includes(fieldName)
        ) {
          this.measures[fieldName] = {
            description: field.string,
            fieldName,
            isActive: false,
          };
        }
        if (GROUPABLE_TYPES.includes(field.type)) {
          this.groupableFields[fieldName] = field;
        }
      }
    }
    fields.__count__ = { string: this.env._t("Count"), type: "integer" };
    this.fields = fields;

    const { groupBy } = this.searchModel;
    if (this.props.state && this.props.state.groupBy) {
      this.initialGroupBy = this.props.state.groupBy;
    } else if (groupBy && groupBy.length) {
      this.initialGroupBy = groupBy;
    } else {
      this.initialGroupBy = this.props.groupBy.map((gb) => getGroupBy(gb, this.fields));
    }

    this.groupBy = this.processGroupBy(this.initialGroupBy);
    this.initialGroupBy = this.groupBy; // ? keep this ?

    if (!(this.state.activeMeasure in this.fields)) {
      this.state.activeMeasure = DEFAULT_MEASURE; // or crash?
    }
    // sort measures for measure menu
    // there was a params.withButtons for the pie chart widget;
    this.model = new GraphModel(this._modelService, {
      modelName: this.props.model,
      fields: this.fields,
    });
  }
  async willStart() {
    await this.loadModel();
  }
  mounted() {
    this.model.on("update", this, this.render);
    this.renderChart();
  }
  patched() {
    this.renderChart();
  }
  willUnmount() {
    this.model.off("update", this);
  }
  async loadModel() {
    const { groupBy } = this;
    const { domains } = this.searchModel;
    const { activeMeasure, mode, order } = this.state;
    await this.model.load({
      activeMeasure,
      domains,
      groupBy,
      mode,
      order,
    });
  }
  /**
   * Instantiates a Chart (Chart.js lib) to render the graph according to
   * the current config.
   * @private
   */
  renderChart() {
    if (this.model.noContentHelperData) {
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
  onMeasureSelected(ev) {
    // Not good!!!!!!! Don't know where activeMeasure, mode, order should go!!! in model?
    this.state.activeMeasure = ev.detail.payload.measure;
    this.loadModel();
  }
  onModeSelected(mode) {
    // Not good!!!!!!!
    this.state.mode = mode;
    this.loadModel();
  }
  toggleOrder(order) {
    // Not good!!!!!!!
    this.state.order = this.state.order === order ? null : order;
    this.loadModel();
  }
  processGroupBy(groupBy) {
    const processedGroupBy = [];
    for (const gb of groupBy) {
      const { fieldName, interval } = gb;
      if (!(fieldName in this.groupableFields)) {
        continue; // or crash?
      }
      const index = processedGroupBy.findIndex((gb) => gb.fieldName === fieldName);
      if (index > -1) {
        if (interval && groupBy[index]) {
          const registeredInterval = groupBy[index].interval;
          if (rankInterval(registeredInterval) > rankInterval(interval)) {
            processedGroupBy.splice(index, 1, gb);
          }
        }
      } else {
        processedGroupBy.push(gb);
      }
    }
    return processedGroupBy;
  }

  // //---------------------------------------------------------------------
  // // Private
  // //---------------------------------------------------------------------
  // /**
  //  * This function aims to remove a suitable number of lines from the
  //  * tooltip in order to make it reasonably visible. A message indicating
  //  * the number of lines is added if necessary.
  //  * @private
  //  * @param {Number} maxTooltipHeight this the max height in pixels of the tooltip
  //  */
  // _adjustTooltipHeight(maxTooltipHeight) {
  //     const sizeOneLine = this.tooltip.querySelector("tbody tr").clientHeight;
  //     const tbodySize = this.tooltip.querySelector("tbody").clientHeight;
  //     const toKeep = Math.max(0, Math.floor(
  //         (maxTooltipHeight - (this.tooltip.clientHeight - tbodySize)
  //         ) / sizeOneLine) - 1);
  //     const lines = this.tooltip.querySelectorAll("tbody tr");
  //     const toRemove = lines.length - toKeep;
  //     if (toRemove > 0) {
  //         for (let index = toKeep; index < lines.length; ++index) {
  //             lines[index].remove();
  //         }
  //         const tr = document.createElement("tr");
  //         const td = document.createElement("td");
  //         tr.classList.add("o_show_more");
  //         td.innerHTML = this.env._t("...");
  //         tr.appendChild(td);
  //         this.tooltip.querySelector("tbody").appendChild(tr);
  //     }
  // }
  /**
   * Creates a bar chart config.
   */
  createBarChartConfig() {
    // prepare data
    const data = this.model.data;
    for (let index = 0; index < data.datasets.length; ++index) {
      const dataset = data.datasets[index];
      // used when stacked
      if (this.state.stacked) {
        dataset.stack = this.model.origins[dataset.originIndex];
      }
      // set dataset color
      dataset.backgroundColor = getColor(index);
    }
    // prepare options
    const options = this._prepareOptions(data.datasets.length);
    // create bar chart config
    return { data, options, type: "bar" };
  }
  /**
   * Returns the graph configuration object.
   * @private
   * @returns {Object}
   */
  createConfig() {
    let config = {};
    switch (this.state.mode) {
      case "bar":
        config = this.createBarChartConfig();
        break;
      case "line":
        config = this.createLineChartConfig();
        break;
      case "pie":
        return { type: "pie" }; //this._createPieChartConfig();
    }
    return config;
  }
  /**
   * Creates a line chart config.
   * @private
   */
  createLineChartConfig() {
    // prepare data
    // prepare data
    const data = this.model.data;
    for (let index = 0; index < data.datasets.length; ++index) {
      const dataset = data.datasets[index];
      if (this.groupBy.length <= 1 && this.model.origins.length > 1) {
        if (dataset.originIndex === 0) {
          dataset.fill = "origin";
          dataset.backgroundColor = hexToRGBA(COLORS[0], 0.4);
          dataset.borderColor = hexToRGBA(COLORS[0], 1);
        } else if (dataset.originIndex === 1) {
          dataset.borderColor = hexToRGBA(COLORS[1], 1);
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
      }
      dataset.pointBackgroundColor = dataset.borderColor;
      dataset.pointBorderColor = "rgba(0,0,0,0.2)";
    }
    if (data.datasets.length === 1) {
      const dataset = data.datasets[0];
      dataset.fill = "origin";
      dataset.backgroundColor = hexToRGBA(COLORS[0], 0.4);
    }
    // center the points in the chart (without that code they are put
    // on the left and the graph seems empty)
    data.labels = data.labels.length > 1 ? data.labels : [[""], ...data.labels, [""]];
    // prepare options
    const options = this._prepareOptions(data.datasets.length);
    // create line chart config
    return { data, options, type: "line" };
  }
  /**
   * Creates a pie chart config.
   * @private
   */
  _createPieChartConfig() {
    // prepare data
    let data = this.model.data;
    if (data.datasets.length === 0) {
      // add fake data to display a pie chart with a grey zone associated
      // with every origin
      data.labels = [this.noDataLabel];
      data.datasets = this.model.origins.map((origin) => {
        return {
          label: origin,
          data: [1],
          backgroundColor: [DEFAULT_BG],
        };
      });
    } else {
      // give same color to same groups from different origins
      const colors = data.labels.map((_, index) => getColor(index));
      for (const dataset of data.datasets) {
        dataset.backgroundColor = colors;
        dataset.borderColor = "rgba(255,255,255,0.6)";
      }
      // make sure there is a zone associated with every origin
      const representedOriginIndexes = data.datasets.map((dataset) => dataset.originIndex);
      let addNoDataToLegend = false;
      const fakeData = new Array(data.labels.length).concat([1]);
      for (let index = 0; index < this.model.origins.length; ++index) {
        const origin = this.model.origins[index];
        if (!representedOriginIndexes.includes(index)) {
          data.datasets.splice(index, 0, {
            label: origin,
            data: fakeData,
            backgroundColor: [...colors, DEFAULT_BG],
          });
          addNoDataToLegend = true;
        }
      }
      if (addNoDataToLegend) {
        data.labels.push(this.noDataLabel);
      }
    }
    // prepare options
    const options = this._prepareOptions(data.datasets.length);
    // create pie chart config
    return { data, options, type: "pie" };
  }
  /**
   * Creates a custom HTML tooltip.
   * @private
   * @param {Object} tooltipModel see chartjs documentation
   */
  customTooltip(tooltipModel) {
    // this.el.style.cursor = "";
    // this.removeTooltips();
    // if (tooltipModel.opacity === 0 || tooltipModel.dataPoints.length === 0) {
    //     return;
    // }
    // if (this._isRedirectionEnabled()) {
    //     this.el.style.cursor = "pointer";
    // }
    // const chartAreaTop = this.chart.chartArea.top;
    // const rendererTop = this.el.getBoundingClientRect().top;
    // const innerHTML = this.env.qweb.renderToString("web.GraphRenderer.CustomTooltip", {
    //     maxWidth: getMaxWidth(this.chart.chartArea),
    //     measure: this.props.fields[this.props.measure].string,
    //     tooltipItems: this._getTooltipItems(tooltipModel),
    // });
    // const template = Object.assign(document.createElement("template"), { innerHTML });
    // this.tooltip = template.content.firstChild;
    // this.containerRef.el.prepend(this.tooltip);
    // let top;
    // const tooltipHeight = this.tooltip.clientHeight;
    // const minTopAllowed = Math.floor(chartAreaTop);
    // const maxTopAllowed = Math.floor(window.innerHeight - (rendererTop + tooltipHeight)) - 2;
    // const y = Math.floor(tooltipModel.y);
    // if (minTopAllowed <= maxTopAllowed) {
    //     // Here we know that the full tooltip can fit in the screen.
    //     // We put it in the position where Chart.js would put it
    //     // if two conditions are respected:
    //     //  1: the tooltip is not cut (because we know it is possible to not cut it)
    //     //  2: the tooltip does not hide the legend.
    //     // If it is not possible to use the Chart.js proposition (y)
    //     // we use the best approximated value.
    //     if (y <= maxTopAllowed) {
    //         if (y >= minTopAllowed) {
    //             top = y;
    //         } else {
    //             top = minTopAllowed;
    //         }
    //     } else {
    //         top = maxTopAllowed;
    //     }
    // } else {
    //     // Here we know that we cannot satisfy condition 1 above,
    //     // so we position the tooltip at the minimal position and
    //     // cut it the minimum possible.
    //     top = minTopAllowed;
    //     const maxTooltipHeight = window.innerHeight - (rendererTop + chartAreaTop) - 2;
    //     this._adjustTooltipHeight(maxTooltipHeight);
    // }
    // this._fixTooltipLeftPosition(this.tooltip, tooltipModel.x);
    // this.tooltip.style.top = Math.floor(top) + "px";
  }
  /**
   * Sets best left position of a tooltip approaching the proposal x.
   */
  _fixTooltipLeftPosition(tooltip, x) {
    if (!this.chart) {
      return;
    }
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
    tooltip.style.left = left + "px";
  }
  /**
   * Used to format correctly the values in tooltips and yAxes.
   */
  _formatValue(value) {
    // const formatter = fieldUtils.format.float;
    // const measure = this.props.fields[this.props.measure];
    // const formatedValue = formatter(value, measure, FORMAT_OPTIONS);
    const formatedValue = value;
    return formatedValue;
  }
  /**
   * Returns an object used to style chart elements independently from
   * the datasets.
   * @private
   * @returns {Object}
   */
  _getElementOptions() {
    const elementOptions = {};
    if (this.state.mode === "bar") {
      elementOptions.rectangle = { borderWidth: 1 };
    } else if (this.state.mode === "line") {
      elementOptions.line = { tension: 0, fill: false };
    }
    return elementOptions;
  }
  _getLegendOptions(datasetsCount) {
    const legendOptions = {
      display: datasetsCount <= MAX_LEGEND_LENGTH,
      position: "top",
      onHover: this.onlegendHover.bind(this),
      onLeave: this.onLegendLeave.bind(this),
    };
    if (this.state.mode === "line") {
      legendOptions.onClick = this.onLegendClick.bind(this);
    }
    // if (this.state.mode !== "pie") {
    //     let referenceColor: string;
    //     if (this.state.mode === "bar") {
    //         referenceColor = "backgroundColor";
    //     } else {
    //         referenceColor = "borderColor";
    //     }
    //     legendOptions.labels = {
    //         generateLabels: chart => {
    //             const { data } = chart;
    //             const labels = data.datasets.map((dataset, index) => {
    //                 return {
    //                     text: shortenLabel(dataset.label),
    //                     fullText: dataset.label,
    //                     fillStyle: dataset[referenceColor],
    //                     hidden: !chart.isDatasetVisible(index),
    //                     lineCap: dataset.borderCapStyle,
    //                     lineDash: dataset.borderDash,
    //                     lineDashOffset: dataset.borderDashOffset,
    //                     lineJoin: dataset.borderJoinStyle,
    //                     lineWidth: dataset.borderWidth,
    //                     strokeStyle: dataset[referenceColor],
    //                     pointStyle: dataset.pointStyle,
    //                     datasetIndex: index,
    //                 };
    //             });
    //             return labels;
    //         },
    //     };
    // } else {
    //     const { comparisonIndex } = this.model;
    //     legendOptions.labels = {
    //         generateLabels: chart => {
    //             const { data } = chart;
    //             const metaData = data.datasets.map(
    //                 (_, index) => chart.getDatasetMeta(index).data
    //             );
    //             const labels = data.labels.map((label, index) => {
    //                 const hidden = metaData.some(
    //                     data => data[index] && data[index].hidden
    //                 );
    //                 const fullText = this._relabelling(label, comparisonIndex);
    //                 const text = shortenLabel(fullText);
    //                 const fillStyle = label === this.noDataLabel ?
    //                     DEFAULT_BG :
    //                     getColor(index);
    //                 return { text, fullText, fillStyle, hidden, index };
    //             });
    //             return labels;
    //         },
    //     };
    // }
    return legendOptions;
  }
  /**
   * Returns the options used to generate the chart axes.
   * @private
   * @returns {Object}
   */
  _getScaleOptions() {
    if (this.state.mode === "pie") {
      return {};
    }
    const { activeMeasure } = this.state;
    const { groupBy } = this;
    const xAxe = {
      type: "category",
      scaleLabel: {
        display: Boolean(groupBy.length && !this.props.isEmbedded),
        labelString: groupBy.length ? this.fields[groupBy[0].fieldName].string : "",
      },
      ticks: { callback: (label) => null },
    };
    const yAxe = {
      type: "linear",
      scaleLabel: {
        display: !this.props.isEmbedded,
        labelString: this.fields[activeMeasure].string,
      },
      ticks: {
        callback: (value) => this._formatValue(value),
        suggestedMax: 0,
        suggestedMin: 0,
      },
    };
    return { xAxes: [xAxe], yAxes: [yAxe] };
  }
  /**
   * Extracts the important information from a tooltipItem generated by
   * Charts.js (a tooltip item corresponds to a line (different from
   * measure name) of a tooltip).
   * @private
   * @param {Object} item
   * @param {Object} data
   * @returns {Object}
   */
  _getTooltipItemContent(item, data) {
    // const dataset = data.datasets![item.datasetIndex!];
    // const id = item.index;
    // let label = data.labels![item.index!] as string[] | string;
    // let value;
    // let boxColor;
    // if (this.state.mode === "pie") {
    //     if (label === this.noDataLabel) {
    //         value = this._formatValue(0);
    //     } else {
    //         value = this._formatValue(dataset.data![item.index]);
    //     }
    //     label = this._relabelling(label, this.model.comparisonIndex, dataset.originIndex);
    //     if (this.props.origins.length > 1) {
    //         label = `${dataset.label}/${label}`;
    //     }
    //     boxColor = dataset.backgroundColor[item.index];
    // } else {
    //     label = this._relabelling(label, this.model.comparisonIndex, dataset.originIndex);
    //     if (
    //         this.processedGroupBy.length > 1 ||
    //         this.model.origins.length > 1
    //     ) {
    //         label = `${label}/${dataset.label}`;
    //     }
    //     value = this._formatValue(item.yLabel as number);
    //     boxColor = this.state.mode === "bar" ?
    //         dataset.backgroundColor :
    //         dataset.borderColor;
    // }
    // return { id, label, value, boxColor };
  }
  /**
   * This function extracts the information from the data points in
   * tooltipModel.dataPoints (corresponding to datapoints over a given
   * label determined by the mouse position) that will be displayed in a
   * custom tooltip.
   */
  _getTooltipItems(tooltipModel) {
    const sortedDataPoints = sortBy(tooltipModel.dataPoints, "yLabel", "desc");
    return sortedDataPoints.map((item) =>
      this._getTooltipItemContent(item, this.chart.config.data)
    );
  }
  /**
   * Returns the options used to generate chart tooltips.
   */
  _getTooltipOptions() {
    const tooltipOptions = {
      // disable Chart.js tooltips
      enabled: false,
      custom: this.customTooltip.bind(this),
    };
    if (this.state.mode === "line") {
      tooltipOptions.mode = "index";
      tooltipOptions.intersect = false;
    }
    return tooltipOptions;
  }
  // /**
  //  * Returns true iff the current graph can be clicked on to redirect to
  //  * the list of records.
  //  * @private
  //  * @returns {boolean}
  //  */
  // _isRedirectionEnabled() {
  //     return !this.props.disableLinking && this.props.mode !== "line";
  // }
  /**
   * Prepares options for the chart according to the current mode
   * (= chart type). This function returns the parameter options used to
   * instantiate the chart.
   */
  _prepareOptions(datasetsCount) {
    const options = {
      maintainAspectRatio: false,
      scales: this._getScaleOptions(),
      legend: this._getLegendOptions(datasetsCount),
      // tooltips: this._getTooltipOptions(),
      elements: this._getElementOptions(),
    };
    // if (this._isRedirectionEnabled()) {
    //     options.onClick = ev => this._onGraphClicked(ev);
    // }
    return options;
  }
  /**
   * Determines how to relabel a label according to a given origin. The
   * idea is that the getLabel function is in general not invertible but
   * it is when restricted to the set of dataPoints coming from a same
   * origin.
   */
  _relabelling(dateClasses, label, index, originIndex) {
    if (label === this.noDataLabel) {
      return label[0];
    }
    if (this.state.mode !== "pie" && index === 0 && dateClasses) {
      // here label is an array of length 1 and contains a number
      return dateClasses.representative(label[index], originIndex) || "";
    } else if (this.state.mode === "pie" && index === 0 && dateClasses) {
      // here label is an array of length at least one containing string or numbers
      const labelCopy = label.slice();
      let newLabel;
      if (originIndex === undefined) {
        newLabel = dateClasses.classMembers(label[index]).join(",");
      } else {
        newLabel = dateClasses.representative(label[index], originIndex);
      }
      labelCopy.splice(index, 1, newLabel);
      return labelCopy.join("/");
    }
    // here label is an array containing strings or numbers.
    return label.join("/") || this.env._t("Total");
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
    if (this.legendTooltip) {
      this.legendTooltip.remove();
      this.legendTooltip = null;
    }
  }
  // //---------------------------------------------------------------------
  // // Handlers
  // //---------------------------------------------------------------------
  // /**
  //  * @private
  //  * @param {MouseEvent} ev
  //  */
  // _onGraphClicked(ev) {
  //     const [activeElement] = this.chart.getElementAtEvent(ev);
  //     if (!activeElement) {
  //         return;
  //     }
  //     const { _datasetIndex, _index } = activeElement;
  //     const { domain } = this.chart.data.datasets[_datasetIndex];
  //     if (domain) {
  //         this.trigger("open_view", { domain: domain[_index] });
  //     }
  // }
  /**
   * Overrides the default legend 'onClick' behaviour. This is done to
   * remove all existing tooltips right before updating the chart.
   */
  onLegendClick(ev, legendItem) {
    this.removeTooltips();
    if (!this.chart) {
      return;
    }
    // Default 'onClick' fallback. See web/static/lib/Chart/Chart.js#15138
    // const index = legendItem.datasetIndex;
    // const meta = this.chart.getDatasetMeta(index);
    // meta.hidden = meta.hidden === null ? Boolean(this.chart.data.datasets![index].hidden) : undefined;
    // this.chart.update();
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
     * for the legend already exists, it is already good and doesn't
     * need to be recreated.
     */
    const { fullText } = legendItem;
    if (legendItem.text === fullText || this.legendTooltip) {
      return;
    }
    const rendererTop = this.el.getBoundingClientRect().top;
    this.legendTooltip = Object.assign(document.createElement("div"), {
      className: "o_tooltip_legend",
      innerText: fullText,
    });
    this.legendTooltip.style.top = ev.clientY - rendererTop + "px";
    this.legendTooltip.style.maxWidth = getMaxWidth(this.chart.chartArea);
    this.containerRef.el.appendChild(this.legendTooltip);
    this._fixTooltipLeftPosition(this.legendTooltip, ev.clientX);
  }
  /**
   * If there's a legend tooltip and the user mouse out of the
   * corresponding legend item, the tooltip is removed.
   */
  onLegendLeave() {
    this.canvasRef.el.style.cursor = "";
    if (this.legendTooltip) {
      this.legendTooltip.remove();
      this.legendTooltip = null;
    }
  }
}
GraphView.type = "graph";
GraphView.display_name = "graph";
GraphView.icon = "fa-bar-chart";
GraphView.multiRecord = true;
GraphView.template = "wowl.GraphView";
GraphView.defaultProps = GRAPH_DEFAULT_PROPS;
GraphView.props = GRAPH_PROPS;
GraphView.processArch = processGraphViewDescription;
