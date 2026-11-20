import { Dialog } from "@web/core/dialog/dialog";
import { Component, proxy, t, useProps } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { _t } from "@web/core/l10n/translation";

const { DateTime } = luxon;

/**
 * Lists the pending self-order join requests of a table so that a waiter can answer them
 * when a guest asks for help (fallback when the table lead does not answer).
 */
export class TableJoinRequestsDialog extends Component {
    static template = "pos_self_order.TableJoinRequestsDialog";
    static components = { Dialog };
    props = useProps({
        table: t.object(),
        close: t.function(),
    });

    setup() {
        this.pos = usePos();
        this.state = proxy({ busy: false });
    }

    get title() {
        return _t("Join requests");
    }

    get requests() {
        return this.pos.getTableJoinRequests(this.props.table);
    }

    getRequestAge(request) {
        return DateTime.fromSeconds(request.time).toRelative();
    }

    async answer(request, action) {
        this.state.busy = true;
        try {
            await this.pos.answerTableJoinRequest(this.props.table, request, action);
        } finally {
            this.state.busy = false;
        }
        if (!this.requests.length) {
            this.props.close();
        }
    }
}
