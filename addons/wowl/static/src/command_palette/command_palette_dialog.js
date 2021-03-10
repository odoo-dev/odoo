/** @odoo-module **/
import { Dialog } from "../components/dialog/dialog";
const { Component } = owl;

export class CommandPaletteDialog extends Component {
  getHotkeyParts(item) {
    return item.hotkey.split("-").map(hotkeyPart => {
      switch (hotkeyPart) {
        case "arrowleft": return "←";
        case "arrowright": return "→";
        case "arrowup": return "↑";
        case "arrowdown": return "↓";
        case "control": return "ctrl";
        case "escape": return "esc";
        default: return hotkeyPart;
      }
    });
  }
}

CommandPaletteDialog.template = "wowl.CommandPaletteDialog";
CommandPaletteDialog.components = { Dialog };
