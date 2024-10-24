import publicWidget from '@web/legacy/js/public/public_widget';
import { rpc } from '@web/core/network/rpc';

import { PortalLoyaltyCardDialog } from './loyalty_card_dialog/loyalty_card_dialog'

publicWidget.registry.PortalLoyaltyWidget = publicWidget.Widget.extend({
    selector: '.o_loyalty_container',
    events: {
        'click .o_loyalty_card': '_onClickLoyaltyCard',
    },

    async _onClickLoyaltyCard(ev) {
        const card_id = ev.currentTarget.dataset.card_id;
        let data = await rpc(`/my/loyalty_card/${card_id}/values`);
        this.call("dialog", "add", PortalLoyaltyCardDialog, data);
    },

});

// -----------------------------------------------------------------------------
// Version 1
// -----------------------------------------------------------------------------
import { registry } from '@web/core/registry';
import { Component } from '@odoo/owl';
import { useService } from '@web/core/utils/hooks';
import { rpc } from '@web/core/network/rpc';
import { PortalLoyaltyCardDialog } from './loyalty_card_dialog/loyalty_card_dialog'

class PortalLoyalty extends Component {
    static selector = ".o_loyalty_container";

    setup() {
        this.dialogService = useService("dialog");
        useDelegatedEvents({
            "click .o_loyalty_card": "onClickLoyaltyCard",
        });
    }

    async onClickLoyaltyCard(ev) {
        const cardId = ev.currentTarget.dataset.card_id;
        let data = await rpc(`/my/loyalty_card/${cardId}/values`);
        this.dialogService.add(PortalLoyaltyCardDialog, data);
    }
}

registry.category("public_components").add("loyalty.card", PortalLoyalty);


// -----------------------------------------------------------------------------
// Version 2
// -----------------------------------------------------------------------------
import { registry } from '@web/core/registry';
import { Component } from '@odoo/owl';
import { useService } from '@web/core/utils/hooks';
import { rpc } from '@web/core/network/rpc';
import { PortalLoyaltyCardDialog } from './loyalty_card_dialog/loyalty_card_dialog'

class PortalLoyalty extends Component {
    static selector = ".o_loyalty_container";
    static template = xml`
        <xpath expr="//div[hasclass('o_loyalty_card')]" position="attributes">
            <attribute name="t-on-click">onClickLoyaltyCard</attribute>
        </xpath>`;

    setup() {
        this.dialogService = useService("dialog");
    }

    async onClickLoyaltyCard(ev) {
        const cardId = ev.currentTarget.dataset.card_id;
        let data = await rpc(`/my/loyalty_card/${cardId}/values`);
        this.dialogService.add(PortalLoyaltyCardDialog, data);
    }
}

registry.category("public_components").add("loyalty.card", PortalLoyalty);