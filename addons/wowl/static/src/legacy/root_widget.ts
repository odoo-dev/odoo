import { Component } from "@odoo/owl";

(window as any).odoo.define("root.widget", function (require: any) {
  require("wowl.legacySetup");

  const { ComponentAdapter } = require("web.OwlCompatibility");
  return new ComponentAdapter(null, { Component }); // for its method _trigger_up
});
