/** @odoo-module **/
import { sortBy } from "../../utils/arrays";
import { _lt } from "../../services/localization";
const { core } = owl;
const { EventBus } = core;
const UNDEFINED = _lt("Undefined");
export const DEFAULT_MEASURE = "__count__";
export const MODES = ["bar", "line", "pie"];
export const DEFAULT_MODE = "bar";
export const ORDERS = ["ASC", "DESC", null];
export const DEFAUL_ORDER = null;
const DEFAULT_LOAD_PARAMS = {
  activeMeasure: DEFAULT_MEASURE,
  domains: [[]],
  groupBy: [],
  mode: DEFAULT_MODE,
  order: DEFAUL_ORDER,
};

// to remove in some way? could be replaced by a relaballing function sent in data
export class DateClasses {
  /**
   * @param {(any[])[]} array
   */
  constructor(array) {
    this.__referenceIndex = null;
    this.__array = array;
    for (let i = 0; i < this.__array.length; i++) {
      const arr = this.__array[i];
      if (arr.length && this.__referenceIndex === null) {
        this.__referenceIndex = i;
      }
    }
  }
  /**
   * @param {number} index
   * @param {any} o
   * @returns {string}
   */
  classLabel(index, o) {
    return `${this.__array[index].indexOf(o)}`;
  }
  /**
   * @param {string} classLabel
   * @returns {any[]}
   */
  classMembers(classLabel) {
    const classNumber = Number(classLabel);
    const classMembers = new Set();
    for (const arr of this.__array) {
      if (arr[classNumber] !== undefined) {
        classMembers.add(arr[classNumber]);
      }
    }
    return [...classMembers];
  }
  /**
   * @param {string} classLabel
   * @param {number} [index]
   * @returns {any}
   */
  representative(classLabel, index) {
    const classNumber = Number(classLabel);
    const i = index === undefined ? this.__referenceIndex : index;
    if (i === null) {
      return null;
    }
    return this.__array[i][classNumber];
  }
  /**
   * @param {number} index
   * @returns {number}
   */
  arrayLength(index) {
    return this.__array[index].length;
  }
}
export class GraphModel extends EventBus {
  constructor(modelService, params) {
    super();
    this.dataPoints = [];
    this.displayNoContentHelper = false;
    this.data = null;
    this.dateClasses = null;
    this.loadParams = {};
    this._modelService = modelService;
    const { fields, modelName } = params;
    this.fields = fields;
    this.modelName = modelName;
  }
  get comparisonIndex() {
    return -1; // adapt when comparisons are available
  }
  get origins() {
    return [""]; // adapt when comparisons are available
  }
  async load(loadParams) {
    const {
      activeMeasure: oldActiveMeasure,
      domains: oldDomains,
      groupBy: oldGroupBy,
    } = this.loadParams;
    this.loadParams = Object.assign(DEFAULT_LOAD_PARAMS, loadParams);
    const { activeMeasure, domains, groupBy } = this.loadParams;
    if (
      activeMeasure !== oldActiveMeasure ||
      JSON.stringify(domains) !== JSON.stringify(oldDomains) ||
      JSON.stringify(groupBy) !== JSON.stringify(oldGroupBy)
    ) {
      await this.loadDataPoints();
    }
    this.prepareChartData();
  }
  /**
   * Filters out some dataPoints because they would lead to bad graphics.
   * The filtering is done with respect to the graph view mode.
   * Note that the method does not alter this.state.dataPoints, since we
   * want to be able to change of mode without fetching data again:
   * we simply present the same data in a different way.
   * Note: this should be moved to the model at some point.
   */
  filterDataPoints() {
    let dataPoints = [];
    if (this.loadParams.mode === "line") {
      let counts = 0;
      for (const dataPoint of this.dataPoints) {
        if (dataPoint.labels[0] !== UNDEFINED.toString()) {
          dataPoints.push(dataPoint);
        }
        counts += dataPoint.count;
      }
      // data points with zero count might have been created on purpose (fill_temporal)
      // we only remove them if there are no data point with positive count
      if (counts === 0) {
        dataPoints = [];
      }
    } else {
      dataPoints = this.dataPoints.filter((dataPoint) => dataPoint.count > 0);
    }
    return dataPoints;
  }
  /**
   * Determines whether the data are good, and displays an error message
   * if this is not the case.
   */
  checkDataValidity(processedDataPoints) {
    // for now it is useless --> see filterDataPoints --> (not really import) bug in stable
    if (this.loadParams.mode === "pie") {
      const dataPoints = processedDataPoints;
      const someNegative = dataPoints.some((dataPt) => dataPt.value < 0);
      const somePositive = dataPoints.some((dataPt) => dataPt.value > 0);
      if (someNegative && somePositive) {
        return true;
      }
    }
    return false;
  }
  /**
   * Sorts datapoints according to the current order (ASC or DESC).
   * Note: this should be moved to the model at some point.
   */
  sortDataPoints(dataPoints) {
    const { domains, groupBy, mode, order } = this.loadParams;
    if (domains.length === 1 && groupBy.length > 0 && mode !== "pie" && order !== null) {
      // group data by their x-axis value, and then sort datapoints
      // based on the sum of values by group in ascending/descending order
      const firstGroupByFieldName = groupBy[0].fieldName;
      const { type } = this.fields[firstGroupByFieldName];
      const groupedDataPoints = {};
      for (const dataPt of dataPoints) {
        const key = type === "many2one" ? dataPt.resId : dataPt.labels[0];
        if (!groupedDataPoints[key]) {
          groupedDataPoints[key] = [];
        }
        groupedDataPoints[key].push(dataPt);
      }
      const groupTotal = (group) => group.reduce((sum, { value }) => sum + value, 0);
      dataPoints = sortBy(Object.values(groupedDataPoints), groupTotal, order.toLowerCase()).reduce(
        (acc, group) => acc.concat(group),
        []
      ); // probleme with flat and typscript ... see https://stackoverflow.com/questions/53556409/typescript-flatmap-flat-flatten-doesnt-exist-on-type-any
    }
    return dataPoints;
  }
  /**
   * Determines the initial section of the labels array over which
   * a dataset has to be completed. The section only depends on the
   * datasets origins.
   */
  getDatasetDataLength(originIndex, defaultLength) {
    if (this.loadParams.mode !== "pie" && this.comparisonIndex === 0) {
      return this.dateClasses.arrayLength(originIndex);
    }
    return defaultLength;
  }
  /**
   * Determines the dataset to which the data point belongs.
   * @private
   * @param {Object} dataPoint
   * @returns {string}
   */
  getDatasetLabel(dataPoint) {
    const { labels, originIndex } = dataPoint;
    if (this.loadParams.mode === "pie") {
      return this.origins[originIndex];
    }
    // ([origin] + second to last groupBys) or activeMeasure
    let datasetLabel = labels.slice(1).join("/");
    if (this.origins.length > 1) {
      datasetLabel = this.origins[originIndex] + (datasetLabel ? "/" + datasetLabel : "");
    }
    datasetLabel = datasetLabel || this.fields[this.loadParams.activeMeasure].string;
    return datasetLabel;
  }
  /**
   * Gets the label over which the data point is.
   */
  getLabel(dataPoint) {
    const { labels, originIndex } = dataPoint;
    const index = this.comparisonIndex;
    if (this.loadParams.mode !== "pie") {
      if (index === 0) {
        return [this.dateClasses.classLabel(originIndex, labels[index])];
      } else {
        return labels.slice(0, 1);
      }
    } else if (index === 0) {
      return [this.dateClasses.classLabel(originIndex, labels[index]), ...labels.slice(index + 1)];
    } else {
      return labels;
    }
  }
  getDateClasses(dataPoints) {
    const dateSets = this.origins.map(() => new Set());
    for (const { labels, originIndex } of dataPoints) {
      const date = labels[this.comparisonIndex];
      if (date !== undefined) {
        dateSets[originIndex].add(date);
      }
    }
    const arrays = dateSets.map((dateSet) => [...dateSet]);
    return new DateClasses(arrays);
  }
  /**
   * Separates dataPoints coming from the read_group(s) into different
   * datasets. This function returns the parameters data and labels used
   * to produce the charts.
   */
  prepareData(dataPoints) {
    const labelMap = {};
    const labels = [];
    const labelIndexes = new WeakMap();
    for (const dataPt of dataPoints) {
      const label = this.getLabel(dataPt);
      const labelKey = `${dataPt.resId}:${JSON.stringify(label)}`;
      const index = labelMap[labelKey];
      if (index === undefined) {
        labelMap[labelKey] = labels.length;
        labelIndexes.set(dataPt, labels.length);
        labels.push(label);
      } else {
        labelIndexes.set(dataPt, index);
      }
    }
    // dataPoints --> datasets
    const datasetsTmp = {};
    for (const dp of dataPoints) {
      const datasetLabel = this.getDatasetLabel(dp);
      if (!(datasetLabel in datasetsTmp)) {
        const dataLength = this.getDatasetDataLength(dp.originIndex, labels.length);
        datasetsTmp[datasetLabel] = {
          data: new Array(dataLength).fill(0),
          domains: new Array(dataLength).fill([]),
          label: datasetLabel,
          originIndex: dp.originIndex,
        };
      }
      const labelIndex = labelIndexes.get(dp);
      datasetsTmp[datasetLabel].data[labelIndex] = dp.value;
      datasetsTmp[datasetLabel].domains[labelIndex] = dp.domain;
    }
    // sort by origin
    const datasets = sortBy(Object.values(datasetsTmp), "originIndex");
    return { datasets, labels };
  }
  processDataPoints() {
    const filteredDataPoints = this.filterDataPoints();
    const processedDataPoints = this.sortDataPoints(filteredDataPoints);
    return processedDataPoints;
  }
  prepareChartData() {
    const processedDataPoints = this.processDataPoints();
    this.displayNoContentHelper = this.checkDataValidity(processedDataPoints);
    if (this.displayNoContentHelper) {
      this.dateClasses = null;
      this.data = null;
    } else {
      this.dateClasses =
        this.comparisonIndex === 0 ? null : this.getDateClasses(processedDataPoints);
      this.data = this.prepareData(processedDataPoints);
    }
    this.trigger("update");
  }
  /**
   * Fetch and process graph data.  It is basically a(some) read_group(s)
   * with correct fields for each domain.  We have to do some light processing
   * to separate date groups in the field list, because they can be defined
   * with an aggregation function, such as my_date:week.
   */
  async loadDataPoints() {
    const { activeMeasure, domains, groupBy } = this.loadParams;
    const fields = groupBy.map((gb) => gb.fieldName);
    if (activeMeasure !== DEFAULT_MEASURE) {
      let measure = activeMeasure;
      if (this.fields[activeMeasure].type === "many2one") {
        measure += ":count_distinct";
      }
      fields.push(measure);
    }
    const proms = [];
    domains.forEach((domain, originIndex) => {
      proms.push(
        this._modelService(this.modelName)
          .readGroup(
            domain,
            fields,
            groupBy.map((gb) => gb.toJSON()),
            { lazy: false }, // what is this thing???
            { fill_temporal: true } // + old this.chart.context
          )
          .then((data) => {
            const dataPoints = [];
            for (const group of data.groups) {
              const { __count, __domain: domain } = group;
              const labels = groupBy.map((gb) => {
                return this.sanitizeValue(group[gb.toJSON()], gb.fieldName);
              });
              var count = __count || group[groupBy[0].toJSON() + "_count"] || 0; // we should have always count
              var value = activeMeasure === DEFAULT_MEASURE ? count : group[activeMeasure];
              if (value instanceof Array) {
                // when a many2one field is used as a activeMeasure AND as a grouped
                // field, bad things happen.  The server will only return the
                // grouped value and will not aggregate it.  Since there is a
                // name clash, we are then in the situation where this value is
                // an array.  Fortunately, if we group by a field, then we can
                // say for certain that the group contains exactly one distinct
                // value for that field.
                value = 1;
              }
              let resId = -1;
              if (groupBy.length && group[groupBy[0].toJSON()] instanceof Array) {
                resId = group[groupBy[0].toJSON()][0];
              }
              dataPoints.push({ resId, count, domain, value, labels, originIndex });
            }
            return dataPoints;
          })
      );
    });
    this.dataPoints = await Promise.all(proms).then((promResults) => {
      const dataPoints = [];
      for (const result of promResults) {
        dataPoints.push(...result);
      }
      return dataPoints;
    });
  }
  /**
   * Helper function (for _processData), turns various values in a usable
   * string form, that we can display in the interface.
   */
  sanitizeValue(value, fieldName) {
    // Should we forced to do that each time ???
    const { type } = this.fields[fieldName];
    if (value === false && type !== "boolean") {
      return UNDEFINED.toString();
    }
    if (Array.isArray(value)) {
      return value[1];
    }
    if (fieldName && type === "selection") {
      // const selected = _.where(this.fields[fieldName].selection, {0: value})[0]; // to change !!!!
      const selected = false; // change that
      return selected ? selected[1] : value;
    }
    return value.toString();
  }
}
