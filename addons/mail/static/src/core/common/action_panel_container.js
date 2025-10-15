import { Component } from "@odoo/owl";
import { UseActions } from "./action";

/**
 * @typedef {Object} Props
 * @property {ThreadActionDefinition.id} [autoOpenAction]
 * @extends {Component<Props, Env>}
 */
export class ActionPanelContainer extends Component {
    static template = "mail.ActionPanelContainer";
    static props = { actions: UseActions, class: { optional: true, type: String } };
}
