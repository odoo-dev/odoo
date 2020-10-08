import * as owl from "@odoo/owl";
import { setTemplates } from "./helpers";

// import qunit configurations and customizations
import "./qunit";

// import here every test suite files
import "./components/action_tests";
import "./components/navbar_tests";
import "./services/action_manager_tests";
import "./services/model_tests";
import "./services/notifications_tests";
import "./services/router_tests";
import "./services/rpc_tests";
import "./services/services_tests";
import "./components/webclient_tests";
import "./core/localization_tests";

const { whenReady, loadFile } = owl.utils;

(async () => {
  const templatesUrl = `/wowl/templates/${new Date().getTime()}`;
  const templates = await loadFile(templatesUrl);
  setTemplates(templates);
  await whenReady();
  QUnit.start();
})();
