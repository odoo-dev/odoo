// @odoo-module ignore

odoo.define(
    "@spreadsheet/o_spreadsheet/o_spreadsheet",
    ["@spreadsheet/spreadsheet_engine/o-spreadsheet-engine"],
    function (require) {
        "use strict";
        const spreadsheet = require("@spreadsheet/spreadsheet_engine/o-spreadsheet-engine");
        return spreadsheet;
    }
);
