import { setupTests } from "./helpers/index";

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

(async () => {
  await setupTests();
  QUnit.start();
})();
