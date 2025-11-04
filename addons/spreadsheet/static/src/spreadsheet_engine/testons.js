// @odoo-module ignore

const { Model } = odoo.loader.modules.get("@spreadsheet/spreadsheet_engine/o-spreadsheet-engine");

const data = {"sheets":[{"id":"sheet1","name":"Pipeline Analysis by Stage (Pivot #1)","colNumber":26,"rowNumber":100,"rows":{},"cols":{"0":{"size":105},"1":{"size":114},"2":{"size":114},"3":{"size":114},"4":{"size":114},"5":{"size":114}},"merges":[],"cells":{"A1":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,9,1),\"stage_id\",2)","A3":"=PIVOT.HEADER(1,\"create_date:month\",DATE(2025,9,1))","A4":"=PIVOT.HEADER(1,\"create_date:month\",DATE(2025,10,1))","A5":"=PIVOT.HEADER(1,\"create_date:month\",DATE(2025,11,1))","A6":"=PIVOT.HEADER(1)","B1":"=PIVOT.HEADER(1,\"stage_id\",1)","B2":"=PIVOT.HEADER(1,\"stage_id\",1,\"measure\",\"expected_revenue:sum\")","B3":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,9,1),\"stage_id\",1)","B4":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,10,1),\"stage_id\",1)","B5":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,11,1),\"stage_id\",1)","B6":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"stage_id\",1)","C1":"=PIVOT.HEADER(1,\"stage_id\",2)","C2":"=PIVOT.HEADER(1,\"stage_id\",2,\"measure\",\"expected_revenue:sum\")","C3":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,9,1),\"stage_id\",2)","C4":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,10,1),\"stage_id\",2)","C5":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,11,1),\"stage_id\",2)","C6":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"stage_id\",2)","D1":"=PIVOT.HEADER(1,\"stage_id\",3)","D2":"=PIVOT.HEADER(1,\"stage_id\",3,\"measure\",\"expected_revenue:sum\")","D3":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,9,1),\"stage_id\",3)","D4":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,10,1),\"stage_id\",3)","D5":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,11,1),\"stage_id\",3)","D6":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"stage_id\",3)","E1":"=PIVOT.HEADER(1,\"stage_id\",4)","E2":"=PIVOT.HEADER(1,\"stage_id\",4,\"measure\",\"expected_revenue:sum\")","E3":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,9,1),\"stage_id\",4)","E4":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,10,1),\"stage_id\",4)","E5":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,11,1),\"stage_id\",4)","E6":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"stage_id\",4)","F1":"=PIVOT.HEADER(1)","F2":"=PIVOT.HEADER(1,\"measure\",\"expected_revenue:sum\")","F3":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,9,1))","F4":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,10,1))","F5":"=PIVOT.VALUE(1,\"expected_revenue:sum\",\"create_date:month\",DATE(2025,11,1))","F6":"=PIVOT.VALUE(1,\"expected_revenue:sum\")"},"styles":{},"formats":{},"borders":{},"conditionalFormats":[],"dataValidationRules":[],"figures":[],"tables":[{"range":"A1:F6","type":"static","config":{"hasFilters":false,"totalRow":false,"firstColumn":true,"lastColumn":false,"numberOfHeaders":1,"bandedRows":true,"bandedColumns":false,"styleId":"TableStyleMedium5","automaticAutofill":false}}],"areGridLinesVisible":true,"isVisible":true,"headerGroups":{"ROW":[],"COL":[]},"comments":{}}],"styles":{},"formats":{},"borders":{},"revisionId":"cfb67d45-cbda-422a-93df-ff2c9894c811","uniqueFigureIds":true,"settings":{"locale":{"name":"English (US)","code":"en_US","thousandsSeparator":",","decimalSeparator":".","dateFormat":"mm/dd/yyyy","timeFormat":"hh:mm:ss a","formulaArgSeparator":",","weekStart":7}},"pivots":{"28f8d3ba-28cd":{"type":"ODOO","domain":"[\"&\", (\"type\", \"=\", \"opportunity\"), (\"user_id\", \"=\", uid)]","context":{"default_type":"opportunity","show_user_team_stages":1},"measures":[{"id":"expected_revenue:sum","fieldName":"expected_revenue","aggregator":"sum"}],"model":"crm.lead","columns":[{"fieldName":"stage_id"}],"rows":[{"granularity":"month","fieldName":"create_date"}],"name":"Pipeline Analysis by Stage","actionXmlId":"crm.crm_lead_action_pipeline","formulaId":"1","fieldMatching":{}}},"pivotNextId":2,"customTableStyles":{},"globalFilters":[],"lists":{},"listNextId":1,"chartOdooMenusReferences":{}}

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
// await new Promise(resolve => setTimeout(resolve, 1000)); // wait for async loads
console.log(model.getters.getEvaluatedCell({ sheetId: "sheet1", col: 0, row: 0 }));