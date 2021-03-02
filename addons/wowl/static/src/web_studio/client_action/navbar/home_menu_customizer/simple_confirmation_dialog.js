/** @odoo-module */
import { Dialog } from "@wowl/components/dialog/dialog";

export class SimpleConfirmationDialog extends owl.Component {
  _close() {
    this.trigger("dialog-closed");
  }

  _confirm() {
    this.props.confirm();
    this._close();
  }

  get dialogProps() {
    const props = {};
    Object.entries(this.props).forEach(([k, v]) => {
      if (k in Dialog.props) {
        props[k] = v;
      }
    });
    return props;
  }
}

SimpleConfirmationDialog.template = owl.tags.xml`
  <Dialog t-props="dialogProps">
    <t t-esc="props.body" />
    <t t-set-slot="buttons">
      <button class="btn btn-primary" t-on-click="_confirm">
        Ok
      </button>
      <button class="btn btn-secondary" t-on-click="_close">
        Cancel
      </button>
    </t>
  </Dialog>
`;
SimpleConfirmationDialog.components = { Dialog };
