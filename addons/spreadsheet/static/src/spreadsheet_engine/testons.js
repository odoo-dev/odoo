// @odoo-module ignore

const { Model } = odoo.loader.modules.get("@spreadsheet/spreadsheet_engine/o-spreadsheet-engine");

const data = {
    "sheets": [
        {
            "id": "sheet1",
            "name": "Documents by Created on (List #1)",
            "colNumber": 26,
            "rowNumber": 100,
            "merges": [],
            "cells": {
                "A1": "=ODOO.LIST.HEADER(1,\"is_favorited\",\"Is Favorited\")",
                "A2": "=ODOO.LIST(1,1,\"is_favorited\")",
                "B1": "=ODOO.LIST.HEADER(1,\"type\",\"Type\")",
                "B2": "=ODOO.LIST(1,1,\"type\")"
            },
        }
    ],
    "styles": {},
    "formats": {},
    "borders": {},
    "revisionId": "eb3f4451-5fc9-49c9-a6ec-f119cfe82172",
    "uniqueFigureIds": true,
    "lists": {
        "1": {
            "columns": [
                "is_favorited",
                "type",
                "name",
                "folder_id",
                "owner_id",
                "partner_id",
                "activity_exception_decoration",
                "write_date",
                "file_size"
            ],
            "domain": [],
            "model": "documents.document",
            "context": {},
            "orderBy": [
                {
                    "name": "create_date",
                    "asc": false
                }
            ],
            "id": "1",
            "name": "Documents by Created on",
            "actionXmlId": "documents.document_action",
            "fieldMatching": {}
        }
    },
    "listNextId": 2,
    "chartOdooMenusReferences": {}
}

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
const model = new Model(data, config);
debugger;
await new Promise(resolve => setTimeout(resolve, 1000)); // wait for async loads
console.log(model.getters.getEvaluatedCell({ sheetId: "sheet1", col: 0, row: 0 }));