// @odoo-module ignore

// replace rpc without our own implemention.

odoo.define("@web/core/network/rpc", ["@spreadsheet/spreadsheet_engine/rpc/rpc"], function (require) {
    "use strict";
    return require("@spreadsheet/spreadsheet_engine/rpc/rpc");
});
