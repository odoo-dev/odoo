import { signal, Plugin, usePlugin, markRaw, proxy, onWillStart, useListener } from "@odoo/owl";
import { BusPlugin } from "@bus/services/bus_plugin";
import { ORM } from "@web/core/orm_plugin";
import { Mutex } from "@web/core/utils/concurrency";
import { debounce } from "@web/core/utils/timing";
import IndexedDB from "../models/utils/indexed_db";
import { DataServiceOptions } from "../models/data_service_options";
import { getOnNotified, uuidv4 } from "@point_of_sale/utils";
import { browser } from "@web/core/browser/browser";
import { ConnectionLostError, rpc, RPCError } from "@web/core/network/rpc";
import { _t } from "@web/core/l10n/translation";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import DeviceIdentifierSequence from "../utils/devices_identifier_sequence";
import { logPosMessage } from "../utils/pretty_console_log";
import { deserializeDateTime } from "@web/core/l10n/dates";
import { registerPythonTemplate } from "../utils/convert_python_template";
import { Base, createRelatedModels } from "@point_of_sale/app/models/related_models";
import { registry } from "@web/core/registry";
import { services } from "@web/core/services";
import { DebugModePlugin } from "@web/core/debug_mode_plugin";

const { DateTime } = luxon;
const CONSOLE_COLOR = "#28ffeb";

export class PosDataPlugin extends Plugin {
    // Must stay above LocalizationPlugin (10) since loading records needs translations.
    static sequence = 20;

    debugMode = usePlugin(DebugModePlugin);
    bus = usePlugin(BusPlugin);
    orm = usePlugin(ORM);
    dialog = usePlugin(DialogPlugin);
    syncInProgress = signal(false);
    dataLoadedFromCache = signal(false);
    localUnsyncedPaidOrderUuids = signal.Set(new Set()); // UUIDs of paid orders written to IndexedDB but not yet confirmed synced to the server.
    network = proxy({
        warningTriggered: false,
        offline: false,
        loading: true,
        unsyncData: [],
        pendingCount: 0,
        storage: {
            persistent: false,
            writeFailed: false,
            failureDialogShown: false,
        },
    });

    setup() {
        this.relations = [];
        this.channels = [];
        this.records = {};

        this.mutex = markRaw(new Mutex());
        this.indexedDBMutex = markRaw(new Mutex());
        this.opts = new DataServiceOptions();
        this.debouncedSynchronizeLocalDataInIndexedDB = debounce(
            this.synchronizeLocalDataInIndexedDB.bind(this),
            300
        );

        this.initializeWebsocket();
        useListener(window, "offline", () => this.checkConnectivity());
        useListener(window, "online", () => this.checkConnectivity());
        this.bus.addEventListener("BUS:CONNECT", this.reconnectWebSocket.bind(this));

        onWillStart(async () => this._onWillStart());
    }

    async _onWillStart() {
        if (!navigator.onLine) {
            await this.checkConnectivity();
        }

        await this.initializeDeviceIdentifier();
        await this.initializeDataRelation();
        await this.initStoragePersistence();
    }

    async initializeDeviceIdentifier() {
        this.device = new DeviceIdentifierSequence({ orm: this.orm });
        await this.device.initialize();
    }

    async checkConnectivity() {
        try {
            clearTimeout(this.checkConnectivityTimeout);
            this.checkConnectivityTimeout = null;
            // Runbot tests will soon be run in dockers with no access to the outside world,
            // so all their interfaces will be disconnected. The problem is that the browser
            // considers itself offline when no interface is connected. However, in this case,
            // if the Odoo server is still accessible.
            //
            // This method also makes it possible to run local tests when no connection is
            // available and an Odoo server is running locally.
            //
            // A ping is required to verify that the connection to the server is not possible.
            this.network.offline = false;
            this.network.warningTriggered = false;

            await rpc("/pos/ping");
            await this.syncData();
            window.dispatchEvent(new CustomEvent("pos-network-online"));
        } catch (error) {
            if (error instanceof ConnectionLostError) {
                this.network.offline = true;
                if (navigator.onLine) {
                    this.checkConnectivityTimeout = setTimeout(
                        () => this.checkConnectivity(),
                        2000
                    );
                }
            }
        }
    }

    initializeWebsocket() {
        this.onNotified = getOnNotified(this.bus, odoo.access_token);
    }

    reconnectWebSocket() {
        this.initializeWebsocket();
        const channels = [...this.channels];
        this.channels = [];
        while (channels.length) {
            const channel = channels.pop();
            this.connectWebSocket(channel.channel, channel.method);

            logPosMessage(
                "DataService",
                "reconnectWebSocket",
                `Reconnecting to channe ${channel.channel}`,
                CONSOLE_COLOR
            );
        }
    }

    connectWebSocket(channel, method) {
        this.channels.push({
            channel,
            method,
        });

        this.onNotified(channel, method);
    }

    get databaseName() {
        return `point-of-sale-${odoo.pos_config_id}-${odoo.info?.db}`;
    }

    async resetIndexedDB() {
        await this.indexedDB.reset();
    }

    async deleteRecordsInIndexedDB(model, ids) {
        return await this.indexedDB.delete(model, ids);
    }

    getIndexedDBKey(record) {
        const modelName = record.model?.name;
        const key = (modelName && this.opts.databaseTable[modelName]?.key) || "id";
        return record[key];
    }

    async initIndexedDB(relations) {
        this.indexedDB?.close?.();
        const allModelNames = Array.from(
            new Set([...Object.keys(relations), ...Object.keys(this.opts.databaseTable)])
        );
        const models = allModelNames.map((model) => {
            const key = this.opts.databaseTable[model]?.key || "id";
            return [key, model];
        });

        return new Promise((resolve) => {
            this.indexedDB = new IndexedDB(this.databaseName, false, models, resolve, this.dialog);
            this.indexedDB.durableStores = new Set(Object.keys(this.opts.databaseTable));
        });
    }

    async initStoragePersistence() {
        if (!browser.navigator.storage) {
            logPosMessage(
                "DataService",
                "initStoragePersistence",
                "navigator.storage is unavailable: local data may be evicted without warning.",
                CONSOLE_COLOR,
                [],
                true
            );
            return;
        }

        try {
            if (browser.navigator.storage.persisted && browser.navigator.storage.persist) {
                this.network.storage.persistent =
                    (await browser.navigator.storage.persisted()) ||
                    (await browser.navigator.storage.persist());

                if (!this.network.storage.persistent) {
                    logPosMessage(
                        "DataService",
                        "initStoragePersistence",
                        "Persistent storage was denied: the browser may evict unsynced orders.",
                        CONSOLE_COLOR,
                        [],
                        true
                    );
                }
            }
        } catch (error) {
            logPosMessage(
                "DataService",
                "initStoragePersistence",
                `Could not request persistent storage: ${error.message}`,
                CONSOLE_COLOR
            );
        }

        this.refreshPendingSyncState();
    }

    handleLocalPersistenceFailure(models) {
        this.network.storage.writeFailed = true;

        logPosMessage(
            "DataService",
            "handleLocalPersistenceFailure",
            `Failed to persist local data for: ${models.join(", ")} — records only exist in memory`,
            CONSOLE_COLOR,
            [],
            true
        );

        if (this.network.storage.failureDialogShown) {
            return;
        }
        this.network.storage.failureDialogShown = true;
        this.dialog?.add(AlertDialog, {
            title: _t("Orders Could Not Be Saved Locally"),
            body: _t(
                "Some orders could not be saved on this device and only exist in this browser tab. Do not reload or close this page before they have been synced."
            ),
        });
    }

    async synchronizeLocalDataInIndexedDB() {
        const result = await this.indexedDBMutex.exec(
            async () => await this._synchronizeLocalDataInIndexedDB()
        );
        this.refreshPendingSyncState();
        return result;
    }

    /**
     * Private method that synchronizes local data and state in indexedDB.
     * DO NOT CALL THIS METHOD DIRECTLY, use synchronizeLocalDataInIndexedDB instead.
     */
    async _synchronizeLocalDataInIndexedDB() {
        // This methods will synchronize local data and state in indexedDB. This methods is mostly
        // used with models like pos.order, pos.order.line, pos.payment etc. These models are created
        // in the frontend and are not loaded from the backend.
        const modelsParams = Object.entries(this.opts.databaseTable);
        const data = {};
        const dataToKeep = {};
        const writeFailures = [];
        let orderlinesToKeep = [];

        for (const [model, params] of modelsParams) {
            if (!params.getRecordsBasedOnLines) {
                const allRecords = this.models[model].getAll();
                const recordsToPut = allRecords.filter((record) => !params.condition(record));

                if (model === "pos.order.line") {
                    orderlinesToKeep = recordsToPut;
                }

                const serializedRecords = recordsToPut.map((r) => r.serializeForIndexedDB());
                data[model] = serializedRecords;

                if (recordsToPut.length) {
                    const result = await this.indexedDB.create(model, serializedRecords);
                    if (result?.ok === false) {
                        writeFailures.push(model);
                    }
                    dataToKeep[model] = recordsToPut.map((r) => r[params.key]);
                }
            }
        }

        for (const [model, params] of modelsParams) {
            if (params.getRecordsBasedOnLines) {
                const recordsToPut = params.getRecordsBasedOnLines(orderlinesToKeep);

                if (recordsToPut?.length) {
                    const uniqueRecords = [
                        ...new Map(recordsToPut.map((r) => [r[params.key], r])).values(),
                    ];

                    const serializedRecords = uniqueRecords.map((r) => r.serializeForIndexedDB());
                    data[model] = serializedRecords;

                    const result = await this.indexedDB.create(model, serializedRecords);
                    if (result?.ok === false) {
                        writeFailures.push(model);
                    }
                    dataToKeep[model] = uniqueRecords.map((r) => r[params.key]);
                }
            }
        }

        if (writeFailures.length) {
            this.handleLocalPersistenceFailure(writeFailures);
            return data;
        }

        const idbData = await this.indexedDB.readAll(Object.keys(this.opts.databaseTable));
        if (idbData) {
            for (const [model, records] of Object.entries(idbData)) {
                const key = this.opts.databaseTable[model].key;
                const keysToDelete = [];
                const orphanedLocalKeys = [];

                for (const record of records) {
                    const localRecord = this.models[model].get(record.id);
                    if (!localRecord) {
                        if (typeof record.id !== "number") {
                            orphanedLocalKeys.push(record[key]);
                        } else {
                            keysToDelete.push(record[key]);
                        }
                        continue;
                    }
                    if (!dataToKeep[model] || !dataToKeep[model].includes(record[key])) {
                        keysToDelete.push(record[key]);
                    }
                }

                if (orphanedLocalKeys.length) {
                    logPosMessage(
                        "IndexedDB",
                        "orphanedLocalRecords",
                        `Kept ${
                            orphanedLocalKeys.length
                        } unsynced ${model} record(s) that could not be loaded in memory: ${orphanedLocalKeys.join(
                            ", "
                        )}`,
                        CONSOLE_COLOR,
                        [],
                        true
                    );
                }

                if (model === "pos.order") {
                    const idbOrdersByUuid = new Map(records.map((r) => [r[key], r]));
                    for (const trackedUuid of [...this.localUnsyncedPaidOrderUuids()]) {
                        const idbRecord = idbOrdersByUuid.get(trackedUuid);
                        if (!idbRecord) {
                            logPosMessage(
                                "IndexedDB",
                                "localUnsyncedPaidOrderUuids",
                                `Paid order ${trackedUuid} is flagged but not found in IndexedDB — potential data loss`,
                                CONSOLE_COLOR,
                                [],
                                true
                            );
                            continue;
                        }
                        const localRecord = this.models[model].get(idbRecord.id);
                        if (idbRecord.state === "paid" || !localRecord?.isUnsyncedPaid) {
                            this.localUnsyncedPaidOrderUuids().delete(trackedUuid);
                        } else {
                            logPosMessage(
                                "IndexedDB",
                                "localUnsyncedPaidOrderUuids",
                                `Paid order ${trackedUuid} is in IndexedDB but has state "${idbRecord.state}" instead of "paid"`,
                                CONSOLE_COLOR,
                                [],
                                true
                            );
                        }
                    }
                }

                if (keysToDelete.length) {
                    await this.indexedDB.delete(model, keysToDelete);
                }
            }
        }

        return data;
    }

    async synchronizeServerDataInIndexedDB(serverData = {}) {
        for (const [model, data] of Object.entries(serverData)) {
            const result = await this.indexedDB.create(model, data);
            if (result?.ok === false) {
                const reasons = result.failures
                    ?.map((f) => f.reason?.message || String(f.reason))
                    .join("; ");
                logPosMessage(
                    "DataService",
                    "synchronizeServerDataInIndexedDB",
                    `Error while updating ${model} in indexedDB: ${reasons}`,
                    CONSOLE_COLOR,
                    [],
                    true
                );
            }
        }
    }

    async getLocalDataFromIndexedDB(data = false) {
        // Used to retrieve models containing states from the indexedDB.
        // This method will load the records directly via loadData.
        const models = Object.keys(this.opts.databaseTable);

        if (!data) {
            data = await this.indexedDB.readAll(models);
        }

        if (!data) {
            return;
        }

        const preLoadData = await this.preLoadData(data);
        const missing = await this.missingRecursive(preLoadData);

        const serverProductIds = this.models["product.product"].map((p) => p.id);
        const databaseProductIds = missing["product.product"]?.map((p) => p.id) ?? [];
        const loadedProductIds = new Set([...databaseProductIds, ...serverProductIds]);
        if (missing["pos.order.line"]) {
            const droppedLines = missing["pos.order.line"].filter(
                (line) => !loadedProductIds.has(line.product_id)
            );
            if (droppedLines.length) {
                logPosMessage(
                    "DataService",
                    "getLocalDataFromIndexedDB",
                    `Could not load ${
                        droppedLines.length
                    } order line(s): product no longer available. Affected lines: ${droppedLines
                        .map((line) => `${line.uuid} (product ${line.product_id})`)
                        .join(", ")}`,
                    CONSOLE_COLOR,
                    [],
                    true
                );
            }
            missing["pos.order.line"] = missing["pos.order.line"].filter((line) =>
                loadedProductIds.has(line.product_id)
            );
        }

        const results = this.models.loadConnectedData(missing, []);

        await this.checkAndDeleteMissingOrders(results);

        return results;
    }

    async getCachedServerDataFromIndexedDB() {
        // Used to load models that have not yet been loaded into related_models.
        // These models have been sent to the indexedDB directly after the RPC load_data.
        const data = await this.indexedDB.readAll();
        const results = {};

        for (const name in data) {
            results[name] = data[name];
        }

        return results;
    }

    async getCachedServerIdsFromIndexedDB(models = []) {
        const allModels = this.indexedDB.dbStores.map((store) => store[1]);
        const modelsToIgnore = allModels.filter((model) => !models.includes(model));
        const data = await this.indexedDB.readAllExceptStores(modelsToIgnore);
        const results = {};

        for (const name in data) {
            results[name] = data[name].reduce((acc, item) => {
                if (typeof item.id === "number") {
                    // deserializeDateTime(item.write_date) is precise to the second,
                    // we can divide by 1000 without losing precision.
                    // Timestamp in Python is giving timestamp in seconds,
                    // we will thus compare both in seconds.
                    const date = deserializeDateTime(item.write_date).ts / 1000 || 0; // seconds since epoch
                    acc[item.id] = date;
                }
                return acc;
            }, {});
        }

        return results;
    }

    initFieldsAndRelations(params) {
        const modelClasses = {};
        const fields = {};
        const relations = {};
        const dependencies = {};
        for (const [model, values] of Object.entries(params)) {
            dependencies[model] = values.dependencies;
            relations[model] = values.relations;
            fields[model] = values.fields;
        }

        for (const posModel of registry.category("pos_available_models").getAll()) {
            const pythonModel = posModel.pythonModel;
            const extraFields = posModel.extraFields || {};

            modelClasses[pythonModel] = posModel;
            relations[pythonModel] = {
                ...relations[pythonModel],
                ...extraFields,
            };
        }

        const { models, baseData } = createRelatedModels(relations, modelClasses, this.opts);

        this.baseData = baseData;
        this.dependencies = dependencies;
        this.fields = fields;
        this.relations = relations;
        this.models = proxy(models);
    }

    async loadInitialData() {
        // Here the order is important. We first init the indexedDB with stored params
        // about the models loaded in the PoS. Then we load the data from the server
        // and init the indexedDB with the new params. We then init the related models
        // with the more up to date params we have. Finally, we write the data we have
        // in the indexedDB.

        let params = {};

        if (odoo.debug === "assets") {
            window.performance.mark("pos_data_service_init");
        }

        let localData = {};
        let recordsWriteDate = {};
        let data;

        const key = `pos_data_params_${odoo.pos_config_id}`;
        params = JSON.parse(localStorage.getItem(key));
        if (params) {
            await this.initIndexedDB(params);
            localData = await this.getCachedServerDataFromIndexedDB();
        }
        this.dataLoadedFromCache.set(true);

        try {
            if (!this.network.offline) {
                if (this.indexedDB) {
                    recordsWriteDate = await this.getCachedServerIdsFromIndexedDB();
                }

                const testLocalData = {
                    models: Object.keys(recordsWriteDate),
                    records: recordsWriteDate,
                    search_params: {},
                };
                data = await this.orm.call("pos.session", "load_data", [
                    odoo.pos_session_id,
                    testLocalData,
                ]);
                params = this.getFieldsAndRelations(data);
                localStorage.setItem(key, JSON.stringify(params));
                await this.initIndexedDB(params);
                this.dataLoadedFromCache.set(true);
            }
        } catch (error) {
            return this.handleLoadingDataError(error, localData);
        } finally {
            this.initFieldsAndRelations(params);
        }

        try {
            await this.syncInitialData(data, localData);
        } catch (error) {
            return this.handleLoadingDataError(error, localData);
        }

        return localData;
    }

    async syncInitialData(data, localData) {
        for (const template of data["ir.ui.view"]["records"]) {
            if (template._template) {
                registerPythonTemplate(template.key, "", template._template);
            }
        }
        await this.cleanLocalData(data, localData);
        this.synchronizeServerDataInIndexedDB(localData);
    }

    async cleanOldModels(localData, data) {
        // Remove data related to models previously loaded but not anymore.
        // This can happen when uninstalling a module.
        const allModelNames = Object.keys(data);
        for (const [model, values] of Object.entries(localData)) {
            if (!allModelNames.includes(model)) {
                const idsToRemove = values.map((r) => r.id);
                await this.indexedDB.delete(model, idsToRemove);
                delete localData[model];
            }
        }
    }

    async cleanLocalData(data, localData) {
        await this.cleanOldModels(localData, data);
        for (const [model, values] of Object.entries(data)) {
            let local = localData[model] || [];

            if (this.opts.uniqueModels.includes(model) && values.records.length > 0) {
                this.indexedDB.delete(
                    model,
                    local.map((r) => r.id)
                );
                localData[model] = values.records;
            } else {
                const dataToRemove = values.to_remove || [];
                if (dataToRemove.length > 0) {
                    local = local.filter((r) => !dataToRemove.includes(r.id));
                    this.indexedDB.delete(model, dataToRemove);
                }
                localData[model] = local.concat(values.records);
            }
        }
    }

    handleLoadingDataError(error, localData) {
        const hasUsableSession = localData["pos.session"]?.some(
            (record) => record.id === parseInt(odoo.pos_session_id)
        );
        if (!hasUsableSession) {
            logPosMessage(
                "DataService",
                "loadInitialData",
                `Cannot load session ${odoo.pos_session_id} and no usable cached session is available.`,
                CONSOLE_COLOR,
                [],
                true
            );
            throw error;
        }

        let message = _t("An error occurred while loading the Point of Sale: \n");
        if (error instanceof RPCError) {
            message += error.data.message;
        } else {
            message += error.message;
        }
        window.alert(message);
        return localData;
    }

    getFieldsAndRelations(data) {
        const response = {};
        for (const [model, values] of Object.entries(data)) {
            response[model] = {
                dependencies: values.dependencies,
                fields: values.fields,
                relations: values.relations,
            };
        }
        return response;
    }

    async initData() {
        const data = await this.loadInitialData();
        const order = data["pos.order"] || [];
        const orderlines = data["pos.order.line"] || [];
        const posPrepOrder = data["pos.prep.order"] || [];
        const posPrepLine = data["pos.prep.line"] || [];

        delete data["pos.order"];
        delete data["pos.order.line"];
        delete data["pos.prep.order"];
        delete data["pos.prep.line"];

        this.models.loadConnectedData(data, this.modelToLoad);
        this.models.loadConnectedData(
            {
                "pos.order": order,
                "pos.order.line": orderlines,
                "pos.prep.order": posPrepOrder,
                "pos.prep.line": posPrepLine,
            },
            []
        );
    }

    async initializeDataRelation() {
        await this.initData();
        await this.getLocalDataFromIndexedDB();
        this.initListeners();

        if (this.debugMode.isActive("assets")) {
            window.performance.mark("pos_data_service_init_end");
            this.debugInfos();
        }

        this.network.loading = false;
    }

    debugInfos() {
        const measure = window.performance.measure(
            "pos_loading",
            "pos_data_service_init",
            "pos_data_service_init_end"
        );

        logPosMessage(
            "DataService",
            "debugInfos",
            `PosDataService initialized in ${measure.duration.toFixed(2)}ms`,
            CONSOLE_COLOR
        );
    }

    initListeners() {
        for (const dynamicModel of this.opts.dynamicModels) {
            if (!this.models[dynamicModel]) {
                continue;
            }

            this.models[dynamicModel].addEventListener(
                "update",
                this.debouncedSynchronizeLocalDataInIndexedDB.bind(this)
            );
        }

        const ignore = Object.keys(this.opts.databaseTable);
        for (const model of Object.keys(this.relations)) {
            if (ignore.includes(model)) {
                continue;
            }

            this.models[model].addEventListener("delete", (params) => {
                this.indexedDB.delete(model, [params.key]);
            });

            this.models[model].addEventListener("update", (params) => {
                const record = this.models[model].get(params.id)?.raw;
                if (!record) {
                    return; // the record may be deleted
                }
                for (const [key, value] of Object.entries(record)) {
                    if (value instanceof Base) {
                        record[key] = value.id;
                    } else if (Array.isArray(value) && value[0] instanceof Base) {
                        record[key] = value.map((v) => v.id);
                    }
                }

                this.synchronizeServerDataInIndexedDB({ [model]: [record] });
            });
        }
    }

    async execute({
        type,
        model,
        ids,
        values,
        method,
        queue,
        args = [],
        kwargs = {},
        fields = [],
        options = [],
        uuid = "",
    }) {
        this.network.loading = true;

        try {
            if (this.network.offline) {
                throw new ConnectionLostError();
            }

            let result = true;
            let limitedFields = false;
            if (fields.length === 0) {
                fields = this.fields[model] || [];
            }

            if (
                this.fields[model] &&
                fields.sort().join(",") !== this.fields[model].sort().join(",")
            ) {
                limitedFields = true;
            }

            switch (type) {
                case "write":
                    result = await this.orm.write(model, ids, values, {
                        context: { device_identifier: this.device.identifier },
                    });
                    break;
                case "delete":
                    result = await this.orm.unlink(model, ids, {
                        context: { device_identifier: this.device.identifier },
                    });
                    break;
                case "call":
                    result = await this.orm.call(model, method, args, kwargs);
                    break;
                case "read":
                    queue = false;
                    result = await this.orm.read(model, ids, fields, {
                        ...options,
                        load: false,
                    });
                    break;
                case "search_read":
                    queue = false;
                    result = await this.orm.searchRead(model, args, fields, {
                        ...options,
                        load: false,
                    });
            }

            if (type === "create") {
                const response = await this.orm.create(model, values, {
                    context: { device_identifier: this.device.identifier },
                });
                values[0].id = response[0];
                result = values;
            }

            const nonExistentRecords = [];
            if (limitedFields) {
                const X2MANY_TYPES = new Set(["many2many", "one2many"]);

                for (const record of result) {
                    const localRecord = this.models[model].get(record.id);

                    if (localRecord) {
                        const formattedForUpdate = {};
                        for (const [field, value] of Object.entries(record)) {
                            const fieldsParams = this.relations[model][field];

                            if (!fieldsParams) {
                                logPosMessage(
                                    "DataService",
                                    "execute",
                                    "Warning, attempt to load a non-existent field.",
                                    CONSOLE_COLOR
                                );
                                continue;
                            }

                            if (X2MANY_TYPES.has(fieldsParams.type)) {
                                formattedForUpdate[field] = value
                                    .filter((id) => this.models[fieldsParams.relation].get(id))
                                    .map((id) => [
                                        "link",
                                        this.models[fieldsParams.relation].get(id),
                                    ]);
                            } else if (fieldsParams.type === "many2one") {
                                if (this.models[fieldsParams.relation].get(value)) {
                                    formattedForUpdate[field] = [
                                        "link",
                                        this.models[fieldsParams.relation].get(value),
                                    ];
                                }
                            } else {
                                formattedForUpdate[field] = value;
                            }
                        }

                        localRecord.update(formattedForUpdate, { omitUnknownField: true });
                        this.synchronizeServerDataInIndexedDB({ [model]: [localRecord.raw] });
                    } else {
                        nonExistentRecords.push(record);
                    }
                }

                if (nonExistentRecords.length) {
                    logPosMessage(
                        "DataService",
                        "execute",
                        "Warning, attempt to load a non-existent record with limited fields.",
                        CONSOLE_COLOR
                    );
                    result = nonExistentRecords;
                }
            }

            if (
                this.models[model] &&
                this.opts.autoLoadedOrmMethods.includes(type) &&
                (!limitedFields || nonExistentRecords.length)
            ) {
                const data = await this.missingRecursive({ [model]: result });
                this.synchronizeServerDataInIndexedDB(data);
                const results = this.models.connectNewData(data);
                result = results[model];
            } else if (type === "write") {
                const localRecord = this.models[model].get(ids[0]);
                if (localRecord) {
                    localRecord.update(values, { omitUnknownField: true });
                    this.synchronizeServerDataInIndexedDB({ [model]: [localRecord.raw] });
                }
            }

            if (result === null || result === undefined) {
                // if request does not return something, we consider it went well
                return true;
            }
            return result;
        } catch (error) {
            let throwErr = true;
            const uuids = this.network.unsyncData.map((d) => d.uuid);
            if (
                queue &&
                !uuids.includes(uuid) &&
                method !== "sync_from_ui" &&
                error instanceof ConnectionLostError
            ) {
                this.network.unsyncData.push({
                    args: [...arguments],
                    date: DateTime.now(),
                    try: 1,
                    uuid: uuidv4(),
                });

                throwErr = false;
            }

            if (throwErr) {
                throw error;
            }
        } finally {
            this.network.loading = false;
        }
    }

    async missingRecursive(recordMap, idsMap = {}, acc = {}) {
        if (this.network.offline) {
            return acc;
        }

        const missingRecords = {};
        const recordInMapByModelIds = Object.entries(recordMap).reduce((acc, [model, records]) => {
            acc[model] = new Set(records.map((r) => r.id));
            return acc;
        }, {});

        for (const [model, records] of Object.entries(recordMap)) {
            if (!acc[model]) {
                acc[model] = records;
            } else {
                acc[model] = acc[model].concat(records);
            }

            if (!this.relations[model]) {
                continue;
            }

            const relations = Object.entries(this.relations[model]).filter(
                ([, rel]) => rel.relation && rel.type && this.models[rel.relation]
            );

            for (const [, rel] of relations) {
                if (this.opts.prohibitedAutoLoadedModels.includes(rel.relation)) {
                    continue;
                }

                if (this.opts.prohibitedAutoLoadedFields[rel.model]?.includes(rel.name)) {
                    continue;
                }

                const values = records.map((record) => record[rel.name]).flat();
                const missing = values.filter((value) => {
                    if (!value || typeof value !== "number" || idsMap[rel.relation]?.has(value)) {
                        return false;
                    }

                    const record = this.models[rel.relation].get(value);
                    return (
                        (!record || !record.id) && !recordInMapByModelIds[rel.relation]?.has(value)
                    );
                });

                if (missing.length > 0) {
                    if (!missingRecords[rel.relation]) {
                        missingRecords[rel.relation] = new Set(missing);
                    } else {
                        missingRecords[rel.relation] = new Set([
                            ...missingRecords[rel.relation],
                            ...missing,
                        ]);
                    }
                }
            }
        }

        const data = {
            models: [],
            records: {},
            search_params: {},
            only_records: true,
        };
        for (const [model, ids] of Object.entries(missingRecords)) {
            if (!idsMap[model]) {
                idsMap[model] = new Set(ids);
            } else {
                idsMap[model] = idsMap[model] = new Set([...idsMap[model], ...ids]);
            }

            const models = this.getRelatedModels(model);
            data.models.push(...models);

            const domain = [["id", "in", Array.from(ids)]];
            if (["product.product", "product.template"].includes(model)) {
                if (model === "product.product") {
                    data.search_params[model] = {
                        domain: domain,
                        context: { active_test: false },
                    };
                    data.search_params["product.template"] = {
                        domain: [["product_variant_ids", "in", Array.from(ids)]],
                        context: { active_test: false },
                    };
                } else {
                    data.search_params[model] = {
                        domain: domain,
                        context: { active_test: false },
                    };
                    data.search_params["product.product"] = {
                        domain: [["product_tmpl_id", "in", Array.from(ids)]],
                        context: { active_test: false },
                    };
                }
            } else {
                data.search_params[model] = {
                    domain: domain,
                };
            }
        }
        data.models = [...new Set(data.models)];
        data.records = await this.getCachedServerIdsFromIndexedDB(data.models);

        if (data.models.length > 0) {
            await this.callRelated(
                "pos.session",
                "load_data",
                [odoo.pos_session_id, data],
                {},
                true,
                false
            );
        }
        return acc;
    }

    async loadRecordsFromPos(
        models,
        domain = {},
        offset = {},
        limit = {},
        context = {},
        loadRelated = true
    ) {
        if (loadRelated) {
            models = new Set(models);
            for (const model of models) {
                const related = this.getRelatedModels(model);
                related.forEach((m) => models.add(m));
            }
            models = [...models];
        }
        const localData = await this.getCachedServerIdsFromIndexedDB(models);
        const search_params = {};
        for (const model of models) {
            search_params[model] = {
                domain: domain[model] || false,
                offset: offset[model] || 0,
                limit: limit[model] || false,
            };
        }
        const loadDataParams = {
            models: Array.from(models),
            records: localData,
            search_params,
            only_records: true,
        };
        return await this.callRelated(
            "pos.session",
            "load_data",
            [odoo.pos_session_id, loadDataParams],
            {
                context,
            },
            false
        );
    }

    getPendingSyncCount() {
        const unsyncedPaidOrders = (this.models?.["pos.order"]?.getAll() || []).filter(
            (order) => order.isUnsyncedPaid
        );
        return this.network.unsyncData.length + unsyncedPaidOrders.length;
    }

    refreshPendingSyncState() {
        this.network.pendingCount = this.getPendingSyncCount();
    }

    async syncData() {
        this.syncInProgress.set(true);

        await this.mutex.exec(async () => {
            while (this.network.unsyncData.length > 0) {
                const data = this.network.unsyncData[0];
                const result = await this.execute({ ...data.args[0], uuid: data.uuid });

                if (result) {
                    this.network.unsyncData.shift();
                } else {
                    this.network.unsyncData[0].try += 1;
                    break;
                }
            }
        });

        this.syncInProgress.set(false);
        this.refreshPendingSyncState();
    }

    async loadServerOrders(domain) {
        if (this.network.offline) {
            return [];
        }
        try {
            const result = await this.callRelated(
                "pos.order",
                "read_pos_orders",
                [domain],
                {},
                false,
                true
            );
            const config = this.models["pos.config"].get(odoo.pos_config_id);
            const session = this.models["pos.session"].get(odoo.pos_session_id);
            const orders = result["pos.order"] || [];
            for (const order of orders) {
                // Clear commands
                order.serializeForORM();
                order.config_id = config;
                order.session_id = session;
            }
            return orders;
        } catch (error) {
            if (error instanceof ConnectionLostError) {
                return [];
            }
            throw error;
        }
    }

    async checkAndDeleteMissingOrders(results) {
        if (this.network.offline) {
            return;
        }
        try {
            if (results && results["pos.order"]) {
                const ids = new Set(
                    results["pos.order"].filter((o) => o.isSynced).map((o) => o.id)
                );
                if (ids.size) {
                    const orders = await this.loadServerOrders([["id", "in", [...ids]]]);
                    const serverIds = orders.map((r) => r.id);
                    for (const id of [...ids]) {
                        if (!serverIds.includes(id)) {
                            this.localDeleteCascade(this.models["pos.order"].get(id));
                        }
                    }
                }
            }
        } catch (error) {
            if (error instanceof ConnectionLostError) {
                return;
            }
            throw error;
        }
    }

    write(model, ids, vals) {
        const records = [];

        for (const id of ids) {
            const record = this.models[model].get(id);
            if (!record) {
                continue;
            }

            delete vals.id;
            record.update(vals, { omitUnknownField: true });

            const dataToUpdate = {};
            const keysToUpdate = Object.keys(vals);

            for (const key of keysToUpdate) {
                dataToUpdate[key] = vals[key];
            }

            records.push(record);
            if (typeof id === "number") {
                this.ormWrite(model, [record.id], dataToUpdate);
            }
        }

        return records;
    }

    delete(model, ids) {
        const deleted = [];
        for (const id of ids) {
            const record = this.models[model].get(id);
            deleted.push(id);
            record.delete();
        }

        this.ormDelete(model, ids);
        return deleted;
    }

    async searchRead(model, domain = [], fields = [], options = {}, queue = false) {
        return await this.execute({
            type: "search_read",
            model,
            args: domain,
            fields,
            options,
            queue,
        });
    }

    async read(model, ids, fields = [], options = [], queue = false) {
        return await this.execute({ type: "read", model, ids, fields, options, queue });
    }

    async call(model, method, args = [], kwargs = {}, queue = false) {
        return await this.execute({ type: "call", model, method, args, kwargs, queue });
    }

    // In a silent call we ignore the error and return false instead
    async silentCall(model, method, args = [], kwargs = {}, queue = false) {
        try {
            return await this.execute({ type: "call", model, method, args, kwargs, queue });
        } catch (e) {
            logPosMessage("DataService", "silentCall", "Silent call failed", CONSOLE_COLOR, [e]);
            return false;
        }
    }

    async callRelated(
        model,
        method,
        args = [],
        kwargs = {},
        queue = true,
        loadMessingRecords = false
    ) {
        let data = await this.execute({ type: "call", model, method, args, kwargs, queue });

        if (loadMessingRecords) {
            data = await this.missingRecursive(data);
        }

        if (data) {
            this.deviceSync?.dispatch && this.deviceSync.dispatch(data);
            const result = this.models.connectNewData(data);
            this.synchronizeServerDataInIndexedDB(data);
            return result;
        }
        return false;
    }

    async create(model, values, queue = true) {
        return await this.execute({ type: "create", model, values, queue });
    }

    async ormWrite(model, ids, values, queue = true) {
        const result = await this.execute({ type: "write", model, ids, values, queue });
        this.deviceSync?.dispatch &&
            this.deviceSync.dispatch({ [model]: ids.map((id) => ({ id })) });
        return result;
    }

    async ormDelete(model, ids, queue = true) {
        return await this.execute({ type: "delete", model, ids, queue });
    }

    localDeleteCascade(record, removeFromServer = false) {
        const recordModel = record.model.name;

        const relationsToDelete = Object.values(this.relations[recordModel])
            .filter((rel) => this.opts.cascadeDeleteModels.includes(rel.relation))
            .map((rel) => rel.name);
        const recordsToDelete = relationsToDelete.flatMap((relation) => record[relation] || []);

        this.deleteRecordsInIndexedDB(recordModel, [this.getIndexedDBKey(record)]);
        for (const item of recordsToDelete) {
            this.deleteRecordsInIndexedDB(item.model.name, [this.getIndexedDBKey(item)]);
            item.delete({ silent: !removeFromServer });
        }

        // Delete the main record
        const result = record.delete({ silent: !removeFromServer });
        return result;
    }

    async preLoadData(data) {
        return data;
    }

    getRelatedModels(model) {
        // The list of dependent models can be compare to a graph.
        // We give it a node and it gives all nodes connected to it in the graph.
        // We also add the independent nodes at the end as those should always be loaded
        // if they change.
        const graph = this.dependencies;
        const adj = {};
        for (const [model, dep_models] of Object.entries(graph)) {
            if (!adj[model]) {
                adj[model] = new Set();
            }
            for (const dep_model of dep_models) {
                if (!adj[dep_model]) {
                    adj[dep_model] = new Set();
                }
                adj[model].add(dep_model);
                adj[dep_model].add(model);
            }
        }

        const visited = new Set();
        const stack = [model];

        while (stack.length) {
            const mod = stack.pop();
            if (!visited.has(mod)) {
                visited.add(mod);
                (adj[mod] || []).forEach((dep_model) => {
                    if (!visited.has(dep_model)) {
                        stack.push(dep_model);
                    }
                });
            }
        }

        return Array.from(visited);
    }

    isDataLoadedFromCache() {
        return this.dataLoadedFromCache();
    }
}

services.add(PosDataPlugin);
