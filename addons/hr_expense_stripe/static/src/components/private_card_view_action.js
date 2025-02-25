import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, useState, useEffect, onMounted } from "@odoo/owl";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { Dialog } from "@web/core/dialog/dialog";

class PrivateCardViewAction extends Component {
    static template = "hr_expense_stripe.privateCardViewAction";
    static components = { Dialog };

    static props = {
        ...standardActionServiceProps,
        action: Object
    }

    

    setup() {
        console.log(this);
        this.card_id = this.props.action.params.res_id;
        this.state = useState({
            ephemeralKey: undefined
        });

        useEffect(
            (ephemeral_key) => {
                console.log(ephemeral_key)
            },
            () => [this.state.ephemeralKey]
        );

        
        onMounted(() => {
            send2FARequest();
        })
    }

    send2FARequest() {

    }

    requestEphemeralKey() {

    }

    getPublishKey() {

    }
}

registry.category("actions").add("hr_expense_stripe.private_card_view_action", PrivateCardViewAction);
