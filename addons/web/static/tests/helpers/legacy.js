odoo.define("web.SessionOverrideForTests", (require) => {
  // Override the Session.session_reload function
  // The wowl test infrastructure does set a correct odoo global value before each test
  // while the session is built only once for all tests.
  // So if a test does a session_reload, it will merge the odoo global of that test
  // into the session, and will alter every subsequent test of the suite.
  // Obviously, we don't want that, ever.
  const initialOdoo = odoo;
  const Session = require("web.Session");
  const { patch } = require("@web/core/utils/patch");
  patch(Session.prototype, "web.SessionTestPatch", {
    async session_reload() {
      const oldOdoo = odoo;
      odoo = initialOdoo;
      const res = await this._super(...arguments);
      odoo = oldOdoo;
      return res;
    },
  });
});

odoo.define("web.test_legacy", async (require) => {
  const legacyExports = {};
  require("web.SessionOverrideForTests");

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
