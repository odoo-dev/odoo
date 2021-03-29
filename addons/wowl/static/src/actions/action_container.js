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

  onDialogClosed() {
    this.dialog = {};
    this.render();
  }

  /**
   * Listen to click event to allow having links with href towards an anchor.
   * Since odoo use hashtag to represent the current state of the view, we can't
   * easily distinguish between a link towards an anchor and a link towards
   * another view/state. If we want to navigate towards an anchor, we must not
   * change the hash of the url otherwise we will be redirected to the app switcher
   * instead To check if we have an anchor, first check if we have an href
   * attribute starting with #. Try to find a element in the DOM using JQuery
   * selector. If we have a match, it means that it is probably a link to an
   * anchor, so we jump to that anchor.
   *
   * @param {MouseEvent} ev
   */
  onClick(ev) {
    const target = ev.target;
    if (target.tagName.toUpperCase() !== "A") {
      return;
    }
    const disableAnchor = target.attributes.getNamedItem("disable_anchor");
    if (disableAnchor && disableAnchor.value === "true") {
      return;
    }
    const href = target.attributes.getNamedItem("href");
    if (href) {
      if (href.value[0] === "#") {
        if (href.value.length === 1) {
          return;
        }
        let matchingEl = null;
        try {
          matchingEl = this.el.querySelector(`.o_content #${href.value.substr(1)}`);
        } catch (e) {
          // Invalid selector: not an anchor anyway
        }
        if (matchingEl) {
          ev.preventDefault();
          const offset = matchingEl.getBoundingClientRect();
          setScrollPosition(this, offset);
        }
      }
    }
  }
}
ActionContainer.components = { ActionDialog };
ActionContainer.template = tags.xml`
    <div t-name="wowl.ActionContainer" class="o_action_manager" t-on-click="onClick">
      <t t-if="main.Component" t-component="main.Component" t-props="main.componentProps" t-key="main.id"/>
      <ActionDialog t-if="dialog.id" t-props="dialog.props" t-key="dialog.id" t-on-dialog-closed="onDialogClosed"/>
    </div>`;
