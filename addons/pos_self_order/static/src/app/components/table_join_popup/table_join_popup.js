import { Component, useProps, t } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

/**
 * Popups of the table join flow (secure table sessions):
 * - ``join``: the guest scanned a table with an ongoing order and must ask to join it;
 * - ``waiting``: the join request is waiting for the table lead (or staff) approval;
 * - ``approve``: the table lead is asked to allow another guest to join.
 */
export class TableJoinPopup extends Component {
    static template = "pos_self_order.TableJoinPopup";
    props = useProps({
        mode: t.selection(["join", "waiting", "approve"]),
        tableNumber: t.or([t.string(), t.number()]).optional(),
        confirm: t.function().optional(),
        cancel: t.function().optional(),
        close: t.function(),
    });

    get content() {
        return {
            join: {
                icon: "lock",
                color: "text-bg-warning",
                title: _t("This table is already ordering"),
                text: _t(
                    "Someone at this table started an order. Ask to join it to add your items to the shared order."
                ),
                confirmIcon: "login",
                confirmLabel: _t("Request to Join"),
                cancelLabel: _t("Not now"),
            },
            waiting: {
                icon: "hourglass_top",
                color: "text-bg-info",
                title: _t("Waiting for approval"),
                text: _t(
                    "The table host has been notified on their phone. You can also ask a waiter to approve your request."
                ),
                cancelLabel: _t("Close"),
            },
            approve: {
                icon: "person_add",
                color: "text-bg-primary",
                title: _t("Someone wants to join your table"),
                text: _t(
                    "Once allowed, they can add items to your shared order. Only allow people seated with you."
                ),
                confirmIcon: "check",
                confirmLabel: _t("Allow"),
                cancelIcon: "close",
                cancelLabel: _t("Decline"),
            },
        }[this.props.mode];
    }

    get steps() {
        const stepStates = {
            join: ["done", "active", "todo"],
            waiting: ["done", "done", "active"],
        }[this.props.mode];
        if (!stepStates) {
            return [];
        }
        return [
            { icon: "qr_code", label: _t("Scanned") },
            { icon: "person_add", label: _t("Request") },
            { icon: "check", label: _t("Approved") },
        ].map((step, index) => ({ ...step, state: stepStates[index] }));
    }

    onConfirm() {
        this.props.close();
        this.props.confirm?.();
    }

    onCancel() {
        this.props.close();
        this.props.cancel?.();
    }
}
