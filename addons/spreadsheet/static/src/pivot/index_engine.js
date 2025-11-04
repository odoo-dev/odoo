import { _t } from "@web/core/l10n/translation";

import * as spreadsheet from "@odoo/o-spreadsheet";

import { PivotOdooCorePlugin } from "./plugins/pivot_odoo_core_plugin";
import { PivotCoreViewGlobalFilterPlugin } from "./plugins/pivot_core_view_global_filter_plugin";
import { PivotUIGlobalFilterPlugin } from "./plugins/pivot_ui_global_filter_plugin";
import { PivotCoreGlobalFilterPlugin } from "./plugins/pivot_core_global_filter_plugin";
import { PivotOdooUIPlugin } from "./plugins/pivot_odoo_ui_plugin";

const { coreTypes, invalidateEvaluationCommands } = spreadsheet;


const { inverseCommandRegistry, corePluginRegistry, coreViewsPluginRegistry, featurePluginRegistry } = spreadsheet.registries;

function identity(cmd) {
    return [cmd];
}

coreTypes.add("UPDATE_ODOO_PIVOT_DOMAIN");

invalidateEvaluationCommands.add("UPDATE_ODOO_PIVOT_DOMAIN");

inverseCommandRegistry.add("UPDATE_ODOO_PIVOT_DOMAIN", identity);


corePluginRegistry.add("PivotOdooCorePlugin", PivotOdooCorePlugin);
corePluginRegistry.add("OdooPivotGlobalFiltersCorePlugin", PivotCoreGlobalFilterPlugin);

coreViewsPluginRegistry.add(
    "OdooPivotGlobalFiltersCoreViewPlugin",
    PivotCoreViewGlobalFilterPlugin
);

featurePluginRegistry.add("OdooPivotGlobalFilterUIPlugin", PivotUIGlobalFilterPlugin);
featurePluginRegistry.add("odooPivotUIPlugin", PivotOdooUIPlugin);

export { PivotOdooCorePlugin, PivotCoreViewGlobalFilterPlugin, PivotUIGlobalFilterPlugin };
