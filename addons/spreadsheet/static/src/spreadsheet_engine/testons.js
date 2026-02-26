// @odoo-module ignore

const { Model } = odoo.loader.modules.get("@spreadsheet/spreadsheet_engine/o-spreadsheet-engine");

const { sendStdStreamRequest, outputResult } = odoo.loader.modules.get("@spreadsheet/spreadsheet_engine/rpc/std_streams");
const { ORM } = odoo.loader.modules.get("@web/core/orm_service");
const { fieldService } = odoo.loader.modules.get("@web/core/field_service");
const { OdooDataProvider } = odoo.loader.modules.get("@spreadsheet/data_sources/odoo_data_provider");
const { waitForDataLoaded } = odoo.loader.modules.get("@spreadsheet/spreadsheet_engine/model");
const orm = new ORM();
const field = fieldService.start({}, { orm });

const env = {
    services: {
        orm: orm,
        field: field,
    }
}
const odooDataProvider = new OdooDataProvider(env);
const config = {
    custom: {
        env,
        orm,
        odooDataProvider,
        translationNamespace: "noqsdflkjqsdflqsdfklmlqsdfj",
    },
};

const { data } = await sendStdStreamRequest({ message_type: "data" });
const model = new Model(data, config);
config.custom.odooDataProvider.on("data-source-updated", model, () =>
    model.dispatch("EVALUATE_CELLS")
);
await waitForDataLoaded(model);
const sheetId = model.getters.getSheetIds()[0];
const A1 = { sheetId, col: 0, row: 0 };
const evalCell = model.getters.getEvaluatedCell(A1);
console.log(model.getters.getCell(A1)?.content);
console.log(model.getters.getEvaluatedCell(A1));
console.log(model.getters.getEvaluatedCell(A1));
console.log(model.getters.getEvaluatedCell(A1));

await outputResult(model.getters.getEvaluatedCell(A1));
