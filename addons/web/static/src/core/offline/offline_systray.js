import { Component, useState, xml } from "@odoo/owl";
import { registry } from "../registry";
import { useService } from "../utils/hooks";

// FIXME: This code is here only to test the offlineService !
class OfflineSystray extends Component {
    static template = xml`
        <div t-if="offlineService.offline" title="offline" class="o_nav_entry">
            <i class="fa fa-chain-broken" role="img"/>
        </div>
    `;

    setup() {
        this.offlineService = useState(useService("offline"));
    }
}

const offlineSystrayItem = {
    Component: OfflineSystray,
};

registry.category("systray").add("OfflineSystrayItem", offlineSystrayItem, { sequence: 1000 });
