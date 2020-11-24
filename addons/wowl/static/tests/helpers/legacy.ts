const legacyExports = {};

export const legacyProm: Promise<any> = new Promise((resolve) => {
  const odoo = (window as any).odoo;

  odoo.define("wowl.fixTheHellOutOfMe", async (require: any) => {
    const session = require("web.session");
    await session.is_bound; // await for templates from server
    Object.assign(legacyExports, {
      makeTestEnvironment: require("web.test_env"),
      testUtils: require("web.test_utils"),
      Widget: require("web.Widget"),
      AbstractAction: require("web.AbstractAction"),
      core: require("web.core"),
    });
    resolve(legacyExports);
  });
});

export function getLegacy() {
  return legacyExports;
}
