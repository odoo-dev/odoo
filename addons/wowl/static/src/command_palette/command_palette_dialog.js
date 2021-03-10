/** @odoo-module **/
import { Dialog } from "../components/dialog/dialog";
const { Component, hooks } = owl;
const { useExternalListener } = hooks;

export class CommandPaletteDialog extends Component {
  setup() {
    useExternalListener(window, "keydown", this._onKeydown);
  }
  _onKeydown(ev) {
    switch (ev.key) {
      case "Enter":
        break;
      case "ArrowUp":
        break;
      case "ArrowDown":
        break;
      // case "PageUp":
      //   break;
      // case "PageDown":
      //   break;
      // case "Home":
      //   break;
      // case "End":
      //   break;
    }
  }
}
CommandPaletteDialog.template = "wowl.CommandPaletteDialog";
CommandPaletteDialog.components = { Dialog };
