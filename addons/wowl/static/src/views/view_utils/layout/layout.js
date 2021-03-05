/** @odoo-module **/
const { Component } = owl;
import { useService } from "../../../core/hooks";
export class Layout extends Component {
  constructor() {
    super(...arguments);
    this.am = useService("action");
  }
  /**
   * Called when an element of the breadcrumbs is clicked.
   *
   * @param {string} jsId
   */
  onBreadcrumbClicked(jsId) {
    this.am.restore(jsId);
  }
  /**
   * Called when a view is clicked in the view switcher.
   *
   * @param {ViewType} viewType
   */
  onViewClicked(viewType) {
    this.am.switchView(viewType);
  }
}
Layout.template = "wowl.Layout";
