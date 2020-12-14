import * as owl from "@odoo/owl";
import { setTemplates } from "./utility";
import { legacyProm } from "./legacy";
import { makeTestOdoo } from "./mocks";

const { whenReady, loadFile } = owl.utils;

let templates: string;

owl.config.enableTransitions = false;
owl.QWeb.dev = true;

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

  // as we currently have two qweb engines (owl and legacy), owl templates are
  // flagged with attribute `owl="1"`. The following lines removes the 'owl'
  // attribute from the templates, so that it doesn't appear in the DOM. For now,
  // we make the assumption that 'templates' only contains owl templates. We
  // might need at some point to handle the case where we have both owl and
  // legacy templates. At the end, we'll get rid of all this.
  const doc = new DOMParser().parseFromString(templates, "text/xml");
  for (let child of doc.querySelectorAll("templates > [owl]")) {
    child.removeAttribute("owl");
  }
  templates = new XMLSerializer().serializeToString(doc);

  setTemplates(templates);
  await Promise.all([whenReady(), legacyProm]);
}

export { OdooEnv } from "../../src/types";

export { makeFakeUserService, makeFakeRPCService, makeMockXHR, makeMockFetch } from "./mocks";

export { getFixture, makeTestEnv, mount, nextTick, makeDeferred, click } from "./utility";
