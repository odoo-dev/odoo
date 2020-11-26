import { setupTests } from "./helpers/index";

// import qunit configurations and customizations
import "./qunit";

// import here every test suite files
import "./action_manager/action_manager_tests";
import "./components/dropdown_tests";
import "./components/dialog_tests";
import "./core/context_tests";
import "./core/domain_tests";
import "./core/localization_tests";
import "./core/utils_tests";
import "./crash_manager/error_dialogs_tests";
import "./notifications/notifications_tests";
import "./py/py_tests";
import "./services/crash_manager_tests";
import "./services/dialog_manager_tests";
import "./services/model_tests";
import "./services/router_tests";
import "./services/rpc_tests";
import "./services/services_tests";
import "./services/title_tests";
import "./services/ui_tests";
import "./webclient/loading_indicator_tests";
import "./webclient/navbar_tests";
import "./webclient/user_menu_tests";
import "./webclient/webclient_tests";
import "./webclient/web_client_integrated_tests";

(async () => {
  await setupTests();
  QUnit.start();
})();
