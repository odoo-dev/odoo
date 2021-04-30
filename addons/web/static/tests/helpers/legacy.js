odoo.define("web.test_legacy", async (require) => {
  const legacyExports = {};

  const legacyProm = new Promise(async (resolve) => {
    const session = require("web.session");
    await session.is_bound; // await for templates from server
    Object.assign(legacyExports, {
      AbstractService: require("web.AbstractService"),
      ActionMenus: require("web.ActionMenus"),
      makeTestEnvironment: require("web.test_env"),
      testUtils: require("web.test_utils"),
      basicFields: require("web.basic_fields"),
      Widget: require("web.Widget"),
      AbstractAction: require("web.AbstractAction"),
      AbstractController: require("web.AbstractController"),
      ListController: require("web.ListController"),
      core: require("web.core"),
      ReportClientAction: require("report.client_action"),
      AbstractView: require("web.AbstractView"),
      legacyViewRegistry: require("web.view_registry"),
      FormView: require("web.FormView"),
      Registry: require("web.Registry"),
    });
    const LegacyCrashManager = require("web.CrashManager");
    LegacyCrashManager.disable();
    resolve(legacyExports);
  });
  function getLegacy() {
    return legacyExports;
  }

  return { legacyProm, getLegacy };
});
