/** @odoo-module **/
import { Dialog } from "../components/dialog/dialog";
import { DEFAULT_COMMAND_CATEGORY } from "./command_category_registry";
import { useHotkey } from "../services/hotkey_service";
const { Component, hooks } = owl;
const { onMounted, onPatched, useExternalListener, useRef, useState } = hooks;

/**
 * @typedef {import("./command_service").Command} Command 
 */

/**
 * Util used to filter commands that are within category.
 * Note: for the default category, also get all commands having invalid category.
 *
 * @param {string} key the category key
 * @param {{label:string}} value the category object
 * @returns an array filter predicate
 */
function commandsWithinCategory(key, value) {
  return cmd => {
    const inCurrentCategory = key === cmd.category;
    const fallbackCategory = value === DEFAULT_COMMAND_CATEGORY && !odoo.commandCategoryRegistry.contains(cmd.category);
    return inCurrentCategory || fallbackCategory;
  }
}

export class CommandPalette extends Component {
  setup() {
    /**
     * @type Command[]
     */
    this.initialCommands = [];
    for (const [key, value] of odoo.commandCategoryRegistry.getEntries()) {
      const commands = this.props.commands.filter(commandsWithinCategory(key, value));
      this.initialCommands = this.initialCommands.concat(commands);
    }

    /**
     * @type {{commands:Command[], selectedCommand: Command}}
     */
    this.state = useState({
      commands: this.initialCommands,
      selectedCommand: null,
    });

    this.mouseSelectionActive = false;
    this.dialogRef = useRef("dialogRef");
    this.inputRef = useRef("inputRef");
    this.listboxRef = useRef("listboxRef");
    useExternalListener(window, "click", this.onWindowClicked);
    onMounted(() => {
      this.inputRef.el.focus();
      this.selectCommand(0);
      this.adaptScrollPosition();
    });
    onPatched(() => {
      this.adaptScrollPosition();
    });
    useHotkey("Enter", () => {
      if (this.state.selectedCommand) {
        this.executeCommand(this.state.selectedCommand)
      }
    }, { allowInEditable: true });
    useHotkey("ArrowUp", () => {
      this.mouseSelectionActive = false;
      const index = this.state.commands.indexOf(this.state.selectedCommand);
      if (index > 0) {
        this.selectCommand(index - 1);
      } else {
        this.selectCommand(this.state.commands.length - 1);
      }
    }, { allowInEditable: true });
    useHotkey("ArrowDown", () => {
      this.mouseSelectionActive = false;
      const index = this.state.commands.indexOf(this.state.selectedCommand);
      if (index < this.state.commands.length - 1) {
        this.selectCommand(index + 1);
      } else {
        this.selectCommand(0);
      }
    }, { allowInEditable: true });
  }

  get categories() {
    const categories = [];
    for (const [key, value] of odoo.commandCategoryRegistry.getEntries()) {
      const commands = this.state.commands.filter(commandsWithinCategory(key, value));
      if (commands.length) {
        categories.push({
          ...value,
          commands,
        });
      }
    }
    return categories;
  }

  selectCommand(index) {
    if (index === -1 || index >= this.state.commands.length) {
      this.state.selectedCommand = null;
      return;
    }
    this.state.selectedCommand = this.state.commands[index];
  }

  /**
   * 
   * @param {Command} command
   */
  executeCommand(command) {
    this.trigger("dialog-closed");
    command.action();
  }

  adaptScrollPosition() {
    const index = this.state.commands.indexOf(this.state.selectedCommand);
    const listbox = this.listboxRef.el;
    const command = listbox.querySelector(`#o_command_${index}`);
    // Scrollbar is present ?
    if (listbox.scrollHeight > listbox.clientHeight) {
      const scrollBottom = listbox.clientHeight + listbox.scrollTop;
      const commandBottom = command.offsetTop + command.offsetHeight;
      if (commandBottom > scrollBottom) {
        // Scroll down
        listbox.scrollTop = commandBottom - listbox.clientHeight;
      } else if (command.offsetTop < listbox.scrollTop) {
        // Scroll up
        listbox.scrollTop = command.offsetTop;
      }
    }
  }

  onCommandMouseEnter(index) {
    if (this.mouseSelectionActive) {
      this.selectCommand(index);
    } else {
      this.mouseSelectionActive = true;
    }
  }

  onSearchInput(ev) {
    const searchValue = ev.target.value;
    const newCommands = [];
    for (const command of this.initialCommands) {
      if (fuzzy.test(searchValue, command.name)) {
        newCommands.push(command);
      }
    }
    this.state.commands = newCommands;
    this.selectCommand(this.state.commands.length ? 0 : -1);
  }

  /**
  * Used to close ourself on outside click.
  */
  onWindowClicked(ev) {
    let element = ev.target;
    let gotClickedInside = element.closest(".o_command_palette") === this.dialogRef.comp.modalRef.el.querySelector(".o_command_palette");
    if (!gotClickedInside) {
      this.trigger("dialog-closed");
    }
  }
}
CommandPalette.template = "wowl.CommandPalette";
CommandPalette.components = { Dialog };
