import { Component, xml, onWillDestroy } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { SidePanel } from "@web/views/sidepanel/sidepanel";

// -----------------------------------------------------------------------------
// ActionContainer (Component)
// -----------------------------------------------------------------------------
export class ActionContainer extends Component {
    static components = { SidePanel };
    static props = {};
    static template = xml`
        <t t-name="web.ActionContainer">
          <div class="o_action_manager">
            <t t-if="info.Component" t-component="info.Component" className="'o_action'" t-props="info.componentProps" t-key="info.id"/>
            <SidePanel/>
          </div>
        </t>`;

    setup() {
        this.info = {};
        this.sidepanel = useService("sidepanel");

        this.onActionManagerUpdate = ({ detail: info }) => {
            this.info = info;
            this.render();
        };
        this.env.bus.addEventListener("ACTION_MANAGER:UPDATE", this.onActionManagerUpdate);
        onWillDestroy(() => {
            this.env.bus.removeEventListener("ACTION_MANAGER:UPDATE", this.onActionManagerUpdate);
        });
    }
}
