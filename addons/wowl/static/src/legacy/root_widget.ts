import { Component } from "@odoo/owl";

const odoo = (window as any).odoo;

odoo.define("root.widget", function (require: any) {
  "use strict";

  require("wowl.legacySetup");

  const AbstractService = require("web.AbstractService");
  return new AbstractService(Component.env);
});
