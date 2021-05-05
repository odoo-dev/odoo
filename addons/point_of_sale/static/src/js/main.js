/** @odoo-module */

import { startWebClient } from "@web/setup";

import { ChromeAdapter } from "@point_of_sale/js/chrome_adapter";
import Registries from "point_of_sale.Registries";
import { mainComponentRegistry } from "@web/webclient/main_component_registry";

// For consistency's sake, we should trigger"WEB_CLIENT_READY" on the bus when PosApp is mounted
// But we can't since mail and some other poll react on that cue, and we don't want those services started
class PosApp extends owl.Component {
  setup() {
    this.Components = mainComponentRegistry.getEntries();
  }
}
PosApp.template = owl.tags.xml`
  <body>
    <ChromeAdapter />
    <div>
      <t t-foreach="Components" t-as="Component" t-key="Component[0]">
        <t t-component="Component[1]"/>
      </t>
    </div>
  </body>
`;
PosApp.components = { ChromeAdapter };

function startPosApp() {
  Registries.Component.add(owl.misc.Portal);
  Registries.Component.freeze();
  startWebClient(PosApp);
}

startPosApp();
