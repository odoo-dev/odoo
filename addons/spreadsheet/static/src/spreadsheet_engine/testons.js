// @odoo-module ignore

const { Model } = odoo.loader.modules.get("@spreadsheet/spreadsheet_engine/o-spreadsheet-engine");

// const data = {
//     "sheets": [
//         {
//             "id": "sheet1",
//             "name": "Pipeline Analysis by Stage (Pivot #1)",
//             "colNumber": 26,
//             "rowNumber": 100,
//             "rows": {},
//             "cols": {
//                 "0": {
//                     "size": 105
//                 },
//                 "1": {
//                     "size": 114
//                 },
//                 "2": {
//                     "size": 114
//                 },
//                 "3": {
//                     "size": 114
//                 },
//                 "4": {
//                     "size": 114
//                 },
//                 "5": {
//                     "size": 114
//                 }
//             },
//             "merges": [],
//             "cells": {
//                 "A1": "=PIVOT.VALUE(1,\"expected_revenue:sum\")",

//             },
//             "styles": {},
//             "formats": {},
//             "borders": {},
//             "conditionalFormats": [],
//             "dataValidationRules": [],
//             "figures": [],
//             "tables": [
//                 {
//                     "range": "A1:F6",
//                     "type": "static",
//                     "config": {
//                         "hasFilters": false,
//                         "totalRow": false,
//                         "firstColumn": true,
//                         "lastColumn": false,
//                         "numberOfHeaders": 1,
//                         "bandedRows": true,
//                         "bandedColumns": false,
//                         "styleId": "TableStyleMedium5",
//                         "automaticAutofill": false
//                     }
//                 }
//             ],
//             "areGridLinesVisible": true,
//             "isVisible": true,
//             "headerGroups": {
//                 "ROW": [],
//                 "COL": []
//             },
//             "comments": {}
//         }
//     ],
//     "styles": {},
//     "formats": {},
//     "borders": {},
//     "revisionId": "cfb67d45-cbda-422a-93df-ff2c9894c811",
//     "uniqueFigureIds": true,
//     "settings": {
//         "locale": {
//             "name": "English (US)",
//             "code": "en_US",
//             "thousandsSeparator": ",",
//             "decimalSeparator": ".",
//             "dateFormat": "mm/dd/yyyy",
//             "timeFormat": "hh:mm:ss a",
//             "formulaArgSeparator": ",",
//             "weekStart": 7
//         }
//     },
//     "pivots": {
//         "28f8d3ba-28cd": {
//             "type": "ODOO",
//             "domain": [],
//             "context": {
//                 "default_type": "opportunity",
//                 "show_user_team_stages": 1
//             },
//             "measures": [
//                 {
//                     "id": "expected_revenue:sum",
//                     "fieldName": "expected_revenue",
//                     "aggregator": "sum"
//                 }
//             ],
//             "model": "crm.lead",
//             "columns": [
//                 {
//                     "fieldName": "stage_id"
//                 }
//             ],
//             "rows": [
//                 {
//                     "granularity": "month",
//                     "fieldName": "create_date"
//                 }
//             ],
//             "name": "Pipeline Analysis by Stage",
//             "actionXmlId": "crm.crm_lead_action_pipeline",
//             "formulaId": "1",
//             "fieldMatching": {}
//         }
//     },
//     "pivotNextId": 2,
//     "customTableStyles": {},
//     "globalFilters": [],
//     "lists": {},
//     "listNextId": 1,
//     "chartOdooMenusReferences": {}
// }

const { ORM } = odoo.loader.modules.get("@web/core/orm_service");
const { fieldService } = odoo.loader.modules.get("@web/core/field_service");
const { OdooDataProvider } = odoo.loader.modules.get("@spreadsheet/data_sources/odoo_data_provider");
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

let inputChunks = [];
for await (const chunk of Deno.stdin.readable) {
    if (chunk) {
        inputChunks.push(chunk);
    }
}
const input = inputChunks.length === 1 ? inputChunks[0] : new Uint8Array(inputChunks.reduce((acc, chunk) => [...acc, ...chunk], []));
const decoder = new TextDecoder("utf-8");
const jsonString = decoder.decode(input, {});
console.log("read stdin", inputChunks.length, "chunks,", input.length, "bytes");
const data = JSON.parse(jsonString);
console.log(data);
delete data.version; // TODO include migration steps in the bundle
const model = new Model(data, config);
config.custom.odooDataProvider.on("data-source-updated", model, () =>
    model.dispatch("EVALUATE_CELLS")
);
debugger;
await new Promise(resolve => setTimeout(resolve, 3000)); // wait for async loads
const sheetId = model.getters.getSheetIds()[0];
const A1 = { sheetId, col: 0, row: 0 };
console.log(model.getters.getCell(A1).content);
console.log(model.getters.getEvaluatedCell(A1));
