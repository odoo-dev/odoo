/** @odoo-module **/

import { _lt } from "@web/core/l10n/translation";
import { getGroupBy } from "@web/search/group_by";
import { GROUPABLE_TYPES, rankInterval } from "@web/search/search_utils";
import { KeepLast } from "@web/core/utils/concurrency";
import { Model } from "@web/core/model";
import { ORM } from "@web/core/orm_service";
import { SampleServer } from "../../views/view_utils/sample_server";
import { sortBy } from "@web/core/utils/arrays";
import { useService } from "@web/core/service_hook";

export const SEP = " / ";
export const MODES = ["bar", "line", "pie"];

const COUNT = _lt("Count");
export function getMeasureDescription(measure, fields, fieldModif) {
    return measure === "__count"
        ? COUNT.toString()
        : (fieldModif[measure] && fieldModif[measure].string) || fields[measure].string;
}

// Remove and directly do computations in graph model?
class DateClasses {
    // acutally we have a matrix of values and undefined. An equivalence class is formed of defined values of a column. So nothing has to do with
    // dates but we only use Dateclasses to manage identification of dates.
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

export class GraphModel extends Model {
    setup() {
        super.setup();

        this._orm = useService("orm");
        this._user = useService("user");

        this.keepLast = new KeepLast();
        this._fakeORM = null;

        this.metaData = null;
        this.data = null;
    }

    /**
     * Separates dataPoints coming from the read_group(s) into different
     * datasets. This function returns the parameters data and labels used
     * to produce the charts.
     */
    getData(dataPoints) {
        const { domains, groupBy, mode } = this.metaData;

        let identify = false;
        if (domains.length && groupBy.length && groupBy[0].fieldName === domains.fieldName) {
            identify = true;
        }
        const dateClasses = identify ? this.getDateClasses(dataPoints) : null;

        // dataPoints --> labels
        const labels = [];
        const labelMap = {};
        for (const dataPt of dataPoints) {
            const x = dataPt.labels.slice(0, mode === "pie" ? undefined : 1);
            const trueLabel = x.length ? x.join(SEP) : this.env._t("Total");
            if (dateClasses) {
                x[0] = dateClasses.classLabel(dataPt.originIndex, x[0]);
            }
            const key = JSON.stringify(x);
            if (labelMap[key] === undefined) {
                labelMap[key] = labels.length;
                if (dateClasses) {
                    if (mode === "pie") {
                        x[0] = dateClasses.classMembers(x[0]).join(", ");
                    } else {
                        x[0] = dateClasses.representative(x[0]);
                    }
                }
                const label = x.length ? x.join(SEP) : this.env._t("Total");
                labels.push(label);
            }
            dataPt.labelIndex = labelMap[key];
            dataPt.trueLabel = trueLabel;
        }

        // dataPoints + labels --> datasetsTmp --> datasets
        const datasetsTmp = {};
        for (const dataPt of dataPoints) {
            const { domain, labelIndex, originIndex, trueLabel, value } = dataPt;
            const datasetLabel = this.getDatasetLabel(dataPt);
            if (!(datasetLabel in datasetsTmp)) {
                let dataLength = labels.length;
                if (mode !== "pie" && dateClasses) {
                    dataLength = dateClasses.arrayLength(originIndex);
                }
                datasetsTmp[datasetLabel] = {
                    data: new Array(dataLength).fill(0),
                    trueLabels: labels.slice(0, dataLength), // should be good // check this in case identify = true
                    domains: new Array(dataLength).fill([]),
                    label: datasetLabel,
                    originIndex: originIndex,
                };
            }
            datasetsTmp[datasetLabel].data[labelIndex] = value;
            datasetsTmp[datasetLabel].domains[labelIndex] = domain;
            datasetsTmp[datasetLabel].trueLabels[labelIndex] = trueLabel;
        }
        // sort by origin
        const datasets = sortBy(Object.values(datasetsTmp), "originIndex");

        return { datasets, labels };
    }

    /**
     * Determines the dataset to which the data point belongs.
     * @private
     * @param {Object} dataPoint
     * @returns {string}
     */
    getDatasetLabel(dataPoint) {
        const { measure, domains, mode, fields, fieldModif } = this.metaData;
        const { labels, originIndex } = dataPoint;
        if (mode === "pie") {
            return domains[originIndex].description || "";
        }
        // ([origin] + second to last groupBys) or measure
        let datasetLabel = labels.slice(1).join(SEP);
        if (domains.length > 1) {
            datasetLabel =
                domains[originIndex].description + (datasetLabel ? SEP + datasetLabel : "");
        }
        datasetLabel = datasetLabel || getMeasureDescription(measure, fields, fieldModif);
        return datasetLabel;
    }

    getDateClasses(dataPoints) {
        const { domains } = this.metaData;
        const dateSets = domains.map(() => new Set());
        for (const { labels, originIndex } of dataPoints) {
            const date = labels[0];
            dateSets[originIndex].add(date);
        }
        const arrays = dateSets.map((dateSet) => [...dateSet]);
        return new DateClasses(arrays);
    }

    /**
     * Determines whether the set of data points is good.
     */
    isValidData(dataPoints) {
        const { mode } = this.metaData;
        if (mode === "pie") {
            const someNegative = dataPoints.some((dataPt) => dataPt.value < 0);
            const somePositive = dataPoints.some((dataPt) => dataPt.value > 0);
            if (someNegative && somePositive) {
                return false;
            }
        }
        return true;
    }

    async load(loadParams) {
        let metaData;
        if ("state" in loadParams) {
            metaData = loadParams.state;
        } else {
            metaData = Object.assign({}, this.metaData, loadParams);
        }
        this.normalize(metaData);

        let dataPoints = await this.keepLast.add(this.loadDataPoints(metaData));
        this.metaData = metaData;
        this.data = null;

        if (this.metaData.useSampleModel && dataPoints.length === 0) {
            if (!this._fakeORM) {
                // would be good to reuse MockServer from tests and data generation from SampleServer?
                // or do something else?
                const sampleServer = new SampleServer(
                    this.metaData.modelName,
                    Object.assign({ __count: { type: "integer" } }, this.metaData.fields)
                );
                const fakeRPC = async (_, params) => {
                    const { kwargs, method, model } = params;
                    const { groupby: groupBy } = kwargs;
                    return sampleServer.mockRpc({ method, model, ...kwargs, groupBy });
                };
                this._fakeORM = new ORM(fakeRPC, this._user);
            }
            dataPoints = await this.keepLast.add(this.loadDataPoints(metaData, true));
        } else {
            this.metaData.useSampleModel = false;
            this._fakeORM = null;
        }

        const processedDataPoints = this.processDataPoints(dataPoints);
        if (this.isValidData(processedDataPoints)) {
            this.data = this.getData(processedDataPoints);
        }
    }

    /**
     * Fetch and process graph data.  It is basically a(some) read_group(s)
     * with correct fields for each domain.  We have to do some light processing
     * to separate date groups in the field list, because they can be defined
     * with an aggregation function, such as my_date:week.
     */
    async loadDataPoints(metaData, useFakeORM = false) {
        const { measure, domains, fields, groupBy, modelName } = metaData;
        const measures = ["__count"];
        if (measure !== "__count") {
            let { group_operator, type } = fields[measure];
            if (type === "many2one") {
                group_operator = "count_distinct";
            }
            if (group_operator === undefined) {
                throw new Error(
                    `No aggregate function has been provided for the measure '${measure}'`
                );
            }
            measures.push(`${measure}:${group_operator}`);
        }

        const proms = [];
        const numbering = {}; // used to avoid ambiguity with many2one with values with same labels:
        // for instance [1, "ABC"] [3, "ABC"] should be distinguished.
        domains.forEach((domain, originIndex) => {
            proms.push(
                (useFakeORM ? this._fakeORM : this._orm)
                    .readGroup(
                        modelName,
                        domain.arrayRepr,
                        measures,
                        groupBy.map((gb) => gb.spec),
                        { lazy: false }, // what is this thing???
                        { fill_temporal: true } // + old this.chart.context
                    )
                    .then((data) => {
                        const dataPoints = [];
                        for (const group of data.groups) {
                            const { __domain, __count } = group;
                            const labels = [];

                            for (const gb of groupBy) {
                                let label;
                                const val = group[gb.spec];
                                const fieldName = gb.fieldName;
                                const { type } = fields[fieldName];
                                if (type === "boolean") {
                                    label = `${val}`; // toUpperCase?
                                } else if (val === false) {
                                    label = this.env._t("Undefined");
                                } else if (type === "many2one") {
                                    const [id, name] = val;
                                    const key = JSON.stringify([fieldName, name]);
                                    if (!numbering[key]) {
                                        numbering[key] = {};
                                    }
                                    const numbers = numbering[key];
                                    if (!numbers[id]) {
                                        numbers[id] = Object.keys(numbers).length + 1;
                                    }
                                    const num = numbers[id];
                                    label = num === 1 ? name : `${name} (${num})`;
                                } else if (type === "selection") {
                                    const selected = fields[fieldName].selection.find(
                                        (s) => s[0] === val
                                    );
                                    label = selected[1];
                                } else {
                                    label = val;
                                }
                                labels.push(label);
                            }

                            let value = group[measure];
                            if (value instanceof Array) {
                                // case where measure is a many2one and is used as groupBy
                                value = 1;
                            }
                            if (!Number.isInteger(value)) {
                                metaData.allIntegers = false;
                            }
                            dataPoints.push({
                                count: __count,
                                domain: __domain,
                                value,
                                labels,
                                originIndex,
                            });
                        }
                        return dataPoints;
                    })
            );
        });
        const promResults = await Promise.all(proms);
        return promResults.flat();
    }

    normalize(metaData) {
        const { graph_measure, graph_mode, graph_groupbys } = metaData.context || {};

        const groupBy = [];
        metaData.groupBy = graph_groupbys || metaData.groupBy;
        for (const gb of metaData.groupBy) {
            let ngb = gb;
            if (typeof gb === "string") {
                ngb = getGroupBy(gb, metaData.fields);
            }
            const fieldModif = metaData.fieldModif[gb.fieldName] || {};
            if (!fieldModif.invisible) {
                groupBy.push(ngb);
            }
        }
        const processedGroupBy = [];
        for (const gb of groupBy) {
            const { fieldName, interval } = gb;
            const { store, type } = metaData.fields[fieldName];
            if (
                !store ||
                ["id", "__count"].includes(fieldName) ||
                !GROUPABLE_TYPES.includes(type)
            ) {
                continue;
            }
            const index = processedGroupBy.findIndex((gb) => gb.fieldName === fieldName);
            if (index === -1) {
                processedGroupBy.push(gb);
            } else if (interval) {
                const registeredInterval = processedGroupBy[index].interval;
                if (rankInterval(registeredInterval) < rankInterval(interval)) {
                    processedGroupBy.splice(index, 1, gb);
                }
            }
        }
        metaData.groupBy = processedGroupBy;

        metaData.measure = graph_measure || metaData.measure;
        if (!(metaData.measure in metaData.fields)) {
            metaData.measure = "__count";
        }
        metaData.mode = graph_mode || metaData.mode;
        if (!MODES.includes(metaData.mode)) {
            metaData.mode = "bar";
        }

        const { additionalMeasures, fields } = metaData;
        const measures = [];
        metaData.groupableFields = {};
        for (const fieldName in fields) {
            const field = fields[fieldName];
            const fieldModif = metaData.fieldModif[fieldName] || {};
            if (!["id", "__count"].includes(fieldName) && field.store === true) {
                if (
                    (!fieldModif.invisible &&
                        ["integer", "float", "monetary"].includes(field.type)) ||
                    (!fieldModif.invisible && fieldModif.isMeasure) ||
                    additionalMeasures.includes(fieldName)
                ) {
                    measures.push({
                        description: fieldModif.string || field.string,
                        fieldName,
                    });
                }
                if (!fieldModif.invisible && GROUPABLE_TYPES.includes(field.type)) {
                    metaData.groupableFields[fieldName] = field;
                }
            }
        }
        metaData.measures = sortBy(measures, (m) => m.description.toLowerCase());
    }

    processDataPoints(dataPoints) {
        const { domains, groupBy, mode, order } = this.metaData;
        let processedDataPoints = [];
        if (mode === "line") {
            processedDataPoints = dataPoints.filter(
                (dataPoint) => dataPoint.labels[0] !== this.env._t("Undefined")
            );
        } else if (mode === "bar") {
            processedDataPoints = dataPoints.filter((dataPoint) => dataPoint.count !== 0);
        } else {
            processedDataPoints = dataPoints.filter(
                (dataPoint) => dataPoint.count !== 0 // && dataPoint.value !== 0 add this???
            );
        }

        if (order !== null && mode !== "pie" && domains.length === 1 && groupBy.length > 0) {
            // group data by their x-axis value, and then sort datapoints
            // based on the sum of values by group in ascending/descending order
            const groupedDataPoints = {};
            for (const dataPt of processedDataPoints) {
                const key = dataPt.labels[0];
                if (!groupedDataPoints[key]) {
                    groupedDataPoints[key] = [];
                }
                groupedDataPoints[key].push(dataPt);
            }
            const groupTotal = (group) => group.reduce((sum, dataPt) => sum + dataPt.value, 0);
            processedDataPoints = sortBy(
                Object.values(groupedDataPoints),
                groupTotal,
                order.toLowerCase()
            ).flat();
        }

        return processedDataPoints;
    }

    async updateMetaData(params) {
        await this.load(params);
        this.trigger("update");
    }
}
