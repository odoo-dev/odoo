const legacyUtilsExports = {};
let legacyUtilsResolver: (...args: any[]) => void;

export const legacyUtilsProm: Promise<any> = new Promise((resolve) => {
  legacyUtilsResolver = resolve;
});

export function getLegacyUtils() {
  return legacyUtilsExports;
}

const odoo = (window as any).odoo;

odoo.define("wowl.fixTheHellOutOfMe", async (require: any) => {
  const session = require("web.session");
  await session.is_bound; // await for templates from server
  Object.assign(legacyUtilsExports, {
    webTestEnv: require("web.test_env"),
    webTestUtils: require("web.test_utils"),
  });
  legacyUtilsResolver(legacyUtilsExports);
});
