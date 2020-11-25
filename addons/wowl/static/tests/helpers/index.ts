import * as owl from "@odoo/owl";
import { setTemplates } from "./utility";
import { legacyProm } from "./legacy";
import { Odoo } from "../../src/types";
import { makeTestOdoo } from "./mocks";

declare let odoo: Odoo;

const { whenReady, loadFile } = owl.utils;

let templates: string;

owl.config.enableTransitions = false;

export async function setupTests(): Promise<void> {
  const originalOdoo = odoo;
  QUnit.testStart(() => {
    odoo = makeTestOdoo();
  });
  QUnit.testDone(() => {
    odoo = originalOdoo;
  });
  const templatesUrl = `/wowl/templates/${new Date().getTime()}`;
  templates = await loadFile(templatesUrl);
  setTemplates(templates);
  await Promise.all([whenReady(), legacyProm]);
}

export { OdooEnv } from "../../src/types";

export { makeFakeUserService, makeFakeRPCService, makeMockXHR, makeMockFetch } from "./mocks";

export { getFixture, makeTestEnv, mount, nextTick, makeDeferred, click } from "./utility";
