/** @odoo-module **/

import { Model } from "@web/core/model/model";
import { useService } from "@web/core/service_hook";
import { registry } from "@web/core/registry";

/**
 * @typedef {import("./types").DataPoint} DataPoint
 * @typedef {import("./types").DataPointId} DataPointId
 * @typedef {import("./types").DataPointType} DataPointType
 * @typedef {import("./types").DataPointInitParams} DataPointInitParams
 */

/**
 * @typedef FieldInfo
 * @property {string} name
 * @property {string} type
 * @property {string} widget
 *
 * @param {FieldInfo[]} fieldsInfo
 */
function getAllFieldsToLoad(fieldsInfo) {
    const fieldNames = new Set();
    for (const fieldInfo of fieldsInfo) {
        fieldNames.add(fieldInfo.name);
        let fieldClass = null;
        if (fieldInfo.widget) {
            fieldClass = registry.category("fields").get(fieldInfo.widget);
        }
        if (!fieldClass) {
            fieldClass = registry.category("fields").get(fieldInfo.type);
        }
        if (fieldClass.fieldDependencies) {
            for (const fieldName of fieldClass.fieldDependencies) {
                fieldNames.add(fieldName);
            }
        }
    }
    return [...fieldNames];
}

export class FieldModel extends Model {
    setup() {
        /** @private */
        this.orm = useService("orm");
        /**
         * @private
         * @type {Record<DataPointId, any>}
         */
        this.dataPoints = {};
        /**
         * @private
         * @type {number}
         */
        this.nextDataPointId = 0;
        /**
         * @private
         * @type {number}
         */
        this.nextVirtualResId = 0;
    }

    /**
     * @param {DataPointId} dataPointId
     */
    deleteDataPoint(dataPointId) {
        delete this.dataPoints[dataPointId];
        // delete children
    }
    /**
     * @param {DataPointId} dataPointId
     * @returns {Promise<void>}
     */
    async discard(dataPointId) {
        const dataPoint = this.findDataPoint(dataPointId);
        dataPoint.changes = null;
        dataPoint.dirty = false;
        this.trigger("update");
    }
    /**
     * @param {DataPointId} dataPointId
     * @returns {DataPoint | null}
     */
    findDataPoint(dataPointId) {
        return this.dataPoints[dataPointId] || null;
    }
    /**
     * @param {DataPointId} dataPointId
     * @returns {boolean}
     */
    isDirty(dataPointId) {
        const dataPoint = this.findDataPoint(dataPointId);
        return dataPoint.dirty;
    }
    /**
     * @param {DataPointId} dataPointId
     * @param {Object} [options]
     * @param {string[]} [options.fieldNames]
     * @param {string} [options.viewType]
     * @returns {Promise<void>}
     */
    async loadFields(dataPointId, options = {}) {
        const dataPoint = this.findDataPoint(dataPointId);

        const fieldNames = options.fieldNames || this.getFieldNames(dataPoint, options.viewType);
        const uniqueFieldNames = [...new Set(fieldNames.concat("display_name"))];

        const ids = dataPoint.type === "record" ? [dataPoint.resId] : dataPoint.resIds;
        const records = await this.orm.read(dataPoint.modelName, ids, uniqueFieldNames, {
            bin_size: true,
        });
        if (!records.length) {
            return Promise.reject();
        }

        if (dataPoint.type === "record") {
            Object.assign(dataPoint.data, records[0]);
        } else {
            dataPoint.data = records;
        }

        // await this.loadFieldsX2M(dataPoint, options);
    }
    // /**
    //  * @param {DataPointId} dataPointId
    //  * @param {Record<string, any>} fieldsData
    //  * @returns {Promise<void>}
    //  */
    // async loadFieldsFromData(/*dataPointId, fieldsData*/) {}
    /**
     * @param {DataPointInitParams} params
     * @returns {DataPointId}
     */
    makeDataPoint(params) {
        const id = `${params.modelName}_${this.nextDataPointId}`;
        this.nextDataPointId += 1;

        const type = params.type || ("domain" in params ? "list" : "record");
        const resIds = params.resIds || [];
        const data = params.data || (type === "record" ? {} : []);
        let resId = null;
        let value = null;
        let context = params.context || {};
        if (type === "record") {
            resId = params.resId || (params.data && params.data.id);
            if (resId) {
                data.id = resId;
            } else {
                resId = `virtual_${this.nextVirtualResId}`;
                this.nextVirtualResId += 1;
            }
            // it doesn't make sense for a record datapoint to have those keys
            // besides, it will mess up x2m and actions down the line
            // context = _.omit(context, ["orderedBy", "group_by"]);
        } else {
            if (Array.isArray(params.value)) {
                [resId, value] = params.value;
            } else {
                value = params.value;
            }
        }

        const fieldsMeta = Object.assign(
            {
                display_name: { type: "char" },
                id: { type: "integer" },
            },
            params.fieldsMeta
        );

        /** @type {DataPoint} */
        const dataPoint = {
            cache: type === "list" ? {} : undefined,
            changes: null,
            domains: {},
            rawChanges: {},
            aggregateValues: params.aggregateValues || {},
            context,
            count: params.count || resIds.length,
            data,
            dirty: false,
            domain: params.domain || [],
            editionViewType: {},
            fieldsMeta,
            fieldsInfo: params.fieldsInfo,
            groupedBy: params.groupedBy || [],
            groupsCount: 0,
            groupsLimit: type === "list" ? params.groupsLimit : null,
            groupsOffset: 0,
            id,
            isOpen: params.isOpen,
            limit: type === "record" ? 1 : params.limit || Number.MAX_SAFE_INTEGER,
            loadMoreOffset: 0,
            modelName: params.modelName,
            offset: params.offset || (type === "record" ? resIds.indexOf(resId) : 0),
            openGroupByDefault: params.openGroupByDefault,
            orderedBy: params.orderedBy || [],
            orderedResIds: params.orderedResIds,
            parentId: params.parentId,
            rawContext: params.rawContext,
            ref: params.ref || resId,
            relationField: params.relationField,
            resId,
            resIds,
            specialData: {},
            specialDataCache: {},
            static: params.static || false,
            type,
            value,
            viewType: params.viewType,
        };
        this.dataPoints[id] = dataPoint;
        return id;
    }
    /**
     * @param {DataPointId} dataPointId
     * @param {Record<string, any>} changes
     * @returns {Promise<void>}
     */
    async notifyChanges(dataPointId, changes) {
        const dataPoint = this.findDataPoint(dataPointId);
        // if (dataPoint.fields[fieldName].onchange) {
        //     const data = Object.assign({}, dataPoint.data, dataPoint.changes, changes);
        //     Object.assign(changes, dataPoint.fields[fieldName].onchange(value, data));
        // }
        dataPoint.changes = Object.assign({}, dataPoint.changes, changes);
        dataPoint.dirty = true;
        this.trigger("update");
    }
    /**
     * @param {DataPointId} dataPointId
     * @returns {Promise<void>}
     */
    async save(dataPointId) {
        const dataPoint = this.findDataPoint(dataPointId);
        for (const [key, value] of Object.entries(dataPoint.changes)) {
            dataPoint.data[key] = value;
        }
        dataPoint.changes = null;
        dataPoint.dirty = false;
        this.trigger("update");
    }

    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {DataPoint} dataPoint
     * @param {string} [viewType]
     * @returns {string[]}
     */
    getFieldNames(dataPoint, viewType = null) {
        const vt = viewType || dataPoint.viewType;
        const fieldsInfo = dataPoint.fieldsInfo || { [vt]: {} };
        return Object.keys(fieldsInfo[vt]);
    }
    /**
     * @private
     * @param {DataPoint} dataPoint
     * @param {Object} [options]
     * @param {string[]} [options.fieldNames]
     * @param {string} [options.viewType]
     * @returns {Promise<void>}
     */
    async loadFieldsX2M(dataPoint, options = {}) {
        const fieldNames = options.fieldNames || this.getFieldNames(dataPoint, options.viewType);
        // const viewType = options.viewType || dataPoint.viewType;

        await Promise.all(
            fieldNames.map(async (fieldName) => {
                const fieldMeta = dataPoint.fieldsMeta[fieldName];
                if (["one2many", "many2many"].includes(fieldMeta.type)) {
                    // const fieldInfo = dataPoint.fieldsInfo[viewType][fieldName];

                    const resIds = dataPoint.data[fieldName] || [];
                    const listDataPointId = this.makeDataPoint({
                        type: "list",
                        count: resIds.length,
                        modelName: fieldMeta.relation,
                        resIds,
                        parentId: dataPoint.id,
                        relationField: fieldMeta.relation_field,
                        static: true,
                    });
                    dataPoint.data[fieldName] = listDataPointId;

                    const listDataPoint = this.findDataPoint(listDataPointId);
                    await this.loadFieldsX2MBatched(listDataPoint);
                }
            })
        );
    }
    /**
     * @private
     * @param {DataPoint} dataPoint
     * @returns {Promise<void>}
     */
    async loadFieldsX2MBatched(dataPoint) {
        await Promise.all(
            this.getFieldNames(dataPoint).map(async (fieldName) => {
                const fieldMeta = dataPoint.fieldsMeta[fieldName];
                if (["one2many", "many2many"].includes(fieldMeta.type)) {
                    await this.loadFieldX2MBatched(dataPoint, fieldName);
                }
            })
        );
    }
    /**
     * @private
     * @param {DataPoint} dataPoint
     * @param {string} fieldName
     * @returns {Promise<void>}
     */
    async loadFieldX2MBatched(dataPoint, fieldName) {
        // const records = await this.orm.read(dataPoint.modelName, dataPoint.resIds, [
        //     "id",
        //     "display_name",
        // ]);
        // dataPoint.data = records; // should create a data point
    }
}
