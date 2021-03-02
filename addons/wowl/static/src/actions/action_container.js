/** @odoo-module **/

import { ActionDialog } from "./action_dialog";
import { setScrollPosition } from "./action_hook";

const { Component, tags } = owl;

// -----------------------------------------------------------------------------
// ActionContainer (Component)
// -----------------------------------------------------------------------------
export class ActionContainer extends Component {
  setup() {
    this.main = {};
    this.dialog = {};
    this.env.bus.on("ACTION_MANAGER:UPDATE", this, (info) => {
      switch (info.type) {
        case "MAIN":
          this.main = info;
          break;
        case "OPEN_DIALOG": {
          const { onClose } = this.dialog;
          this.dialog = {
            id: info.id,
            props: info.props,
            onClose: onClose || info.onClose,
          };
          break;
        }
        case "CLOSE_DIALOG": {
          let onClose;
          if (this.dialog.id) {
            onClose = this.dialog.onClose;
          } else {
            onClose = info.onClose;
          }
          if (onClose) {
            onClose(info.onCloseInfo);
          }
          this.dialog = {};
          break;
        }
      }
      this.render();
    });
  }
  _onDialogClosed() {
    this.dialog = {};
    this.render();
  }
  _onGenericClick(ev) {
    //this._domCleaning();
    const target = ev.target;
    if (target.tagName.toUpperCase() !== "A") {
      return;
    }
    const disable_anchor = target.attributes.getNamedItem("disable_anchor");
    if (disable_anchor && disable_anchor.value === "true") {
      return;
    }
    const href = target.attributes.getNamedItem("href");
    if (href) {
      if (href.value[0] === "#") {
        ev.preventDefault();
        if (href.value.length === 1 || !this.el) {
          return;
        }
        let matchingEl = null;
        try {
          matchingEl = this.el.querySelector(`.o_content #${href.value.substr(1)}`);
        } catch (e) {} // Invalid selector: not an anchor anyway
        if (matchingEl) {
          const offset = matchingEl.getBoundingClientRect();
          setScrollPosition(this, offset);
        }
      }
    }
  }
}
ActionContainer.components = { ActionDialog };
ActionContainer.template = tags.xml`
    <div t-name="wowl.ActionContainer" class="o_action_manager" t-on-click="_onGenericClick">
      <t t-if="main.Component" t-component="main.Component" t-props="main.componentProps" t-key="main.id"/>
      <ActionDialog t-if="dialog.id" t-props="dialog.props" t-key="dialog.id" t-on-dialog-closed="_onDialogClosed"/>
    </div>`;
