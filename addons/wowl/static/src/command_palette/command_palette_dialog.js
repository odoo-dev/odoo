/** @odoo-module **/
import { Dialog } from "../components/dialog/dialog";
const { Component, hooks } = owl;
const { useExternalListener, useState } = hooks;

export class CommandPaletteDialog extends Component {
  setup() {
    useExternalListener(window, "keydown", this._onKeydown);
    this.state = useState({
      searchValue: "",
      filterCategories: this.props.categories,
    });
  }

  _search(ev) {
    console.log(this.state.searchValue);
    console.log(this.state.filterCategories);
    //this.state.filterCategories = {};
    const searchValue = this.state.searchValue.toLowerCase();
    for (const key in this.props.categories) {
      if (Object.hasOwnProperty.call(this.props.categories, key)) {
        let commands = this.props.categories[key].items.filter((command) => fuzzysearch(searchValue, command.name.toLowerCase()));

          this.state.filterCategories[key].items = commands;
      }
    }
    console.log(this.state.filterCategories);
    //this.state.filterCategories = result;
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


function fuzzysearch (needle, haystack) {
  var hlen = haystack.length;
  var nlen = needle.length;
  if (nlen > hlen) {
    return false;
  }
  if (nlen === hlen) {
    return needle === haystack;
  }
  outer: for (var i = 0, j = 0; i < nlen; i++) {
    var nch = needle.charCodeAt(i);
    while (j < hlen) {
      if (haystack.charCodeAt(j++) === nch) {
        continue outer;
      }
    }
    return false;
  }
  return true;
}
