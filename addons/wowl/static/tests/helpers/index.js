/** @odoo-module **/

import { setTemplates } from "./utility";
import { legacyProm } from "wowl.test_legacy";
import { makeTestOdoo } from "./mocks";

const { whenReady, loadFile } = owl.utils;

let templates;

owl.config.enableTransitions = false;
owl.QWeb.dev = true;

export async function setupTests() {
  const originalOdoo = odoo;
  const originalWindowAddEventListener = window.addEventListener;
  let windowListeners;

  QUnit.testStart(() => {
    odoo = makeTestOdoo();

    // Here we keep track of listeners added on the window object.
    // Some stuff with permanent state (e.g. services) may register
    // those kind of listeners without removing them at some point.
    // We manually remove them after each test (see below).
    windowListeners = [];
    window.addEventListener = function (eventName, callback) {
      windowListeners.push({ eventName, callback });
      originalWindowAddEventListener(...arguments);
    }
  });
  QUnit.testDone(() => {
    odoo = originalOdoo;

    // Cleanup the listeners added on window in the current test.
    windowListeners.forEach(listener => {
      window.removeEventListener(listener.eventName, listener.callback);
    });
    window.addEventListener = originalWindowAddEventListener;
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

export { makeFakeUserService, makeFakeRPCService, makeMockXHR, makeMockFetch } from "./mocks";

export { getFixture, makeTestEnv, mount, nextTick, makeDeferred, click } from "./utility";
