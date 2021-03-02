/** @odoo-module **/
import { ExpirationPanel } from "./expiration_panel";
import { useService } from "../../../core/hooks";

const { Component, hooks } = owl;
const { useExternalListener, useState, useRef } = hooks;

/**
 * Home menu
 *
 * This component handles the display and navigation between the different
 * available applications and menus.
 * @extends Component
 */
export class HomeMenu extends Component {
  /**
   * @param {Object} props
   * @param {Object[]} props.apps application icons
   * @param {number} props.apps[].actionID
   * @param {number} props.apps[].id
   * @param {string} props.apps[].label
   * @param {string} props.apps[].parents
   * @param {(boolean|string|Object)} props.apps[].webIcon either:
   *      - boolean: false (no webIcon)
   *      - string: path to Odoo icon file
   *      - Object: customized icon (background, class and color)
   * @param {string} [props.apps[].webIconData]
   * @param {string} props.apps[].xmlid
   * @param {Object[]} props.menuItems menu paths
   * @param {number} props.menuItems[].actionID
   * @param {number} props.menuItems[].id
   * @param {string} props.menuItems[].label
   * @param {number} props.menuItems[].menu_id
   * @param {string} props.menuItems[].parents
   * @param {string} props.menuItems[].webIcon
   * @param {string} props.menuItems[].xmlid
   */
  constructor() {
    super(...arguments);
    this.menus = useService("menu");
    this.homeMenuService = useService("home_menu");

    this.availableApps = this.props.apps;
    this.displayedMenuItems = [];
    this.inputRef = useRef("input");
    this.mainContentRef = useRef("mainContent");
    this.state = useState({
      focusedIndex: null,
      isSearching: false,
      query: "",
    });

    if (!this.env.isSmall) {
      useExternalListener(window, "keydown", this._onKeydown);
    }
  }

  async willUpdateProps() {
    // State is reset on each remount
    this.state.focusedIndex = null;
    this.state.isSearching = false;
    this.state.query = "";
    this.inputRef.el.value = "";

    this.availableApps = this.props.apps;
    this.displayedMenuItems = [];
  }

  mounted() {
    this._updateScrollBarWidth();
  }

  patched() {
    if (this.state.focusedIndex !== null && !this.env.isSmall) {
      const selectedItem = document.querySelector(".o_home_menu .o_menuitem.o_focused");
      // When TAB is managed externally the class o_focused disappears.
      if (selectedItem) {
        // Center window on the focused item
        selectedItem.scrollIntoView({ block: "center" });
      }
    }
    this._updateScrollBarWidth();
  }

  //--------------------------------------------------------------------------
  // Getters
  //--------------------------------------------------------------------------

  /**
   * @returns {(number|null)}
   */
  get appIndex() {
    const appLength = this.displayedApps.length;
    const focusedIndex = this.state.focusedIndex;
    return focusedIndex < appLength ? focusedIndex : null;
  }

  /**
   * @returns {Object[]}
   */
  get displayedApps() {
    return this.availableApps;
  }

  /**
   * @returns {number}
   */
  get maxIconNumber() {
    const w = window.innerWidth;
    if (w < 576) {
      return 3;
    } else if (w < 768) {
      return 4;
    } else {
      return 6;
    }
  }

  /**
   * @returns {(number|null)}
   */
  get menuIndex() {
    const appLength = this.displayedApps.length;
    const focusedIndex = this.state.focusedIndex;
    return focusedIndex >= appLength ? focusedIndex - appLength : null;
  }

  //--------------------------------------------------------------------------
  // Private
  //--------------------------------------------------------------------------

  /**
   * @private
   * @param {Object[]} array
   * @returns {Object[]}
   */
  _filter(array) {
    const options = {
      extract: (el) => (el.parents + " / " + el.label).split("/").reverse().join("/"),
    };
    return fuzzy.filter(this.state.query, array, options).map((el) => el.original);
  }

  /**
   * @private
   * @param {Object} menu
   * @returns {Promise}
   */
  _openMenu(menu) {
    return this.menus.selectMenu(menu);
  }

  /**
   * Update this.state.focusedIndex if not null.
   * @private
   * @param {string} cmd
   */
  _updateFocusedIndex(cmd) {
    const nbrApps = this.displayedApps.length;
    const nbrMenuItems = this.displayedMenuItems.length;
    const lastIndex = nbrApps + nbrMenuItems - 1;
    let oldIndex = this.state.focusedIndex;
    if (lastIndex < 0) {
      return;
    }
    if (!this.state.isSearching) {
      if (document.activeElement.classList.contains("o_menuitem")) {
        oldIndex = [...this.el.getElementsByClassName("o_menuitem")].indexOf(
          document.activeElement
        );
      } else {
        this.el.getElementsByClassName("o_menuitem")[0].focus();
        return;
      }
    }
    const appIndex = this.state.isSearching ? this.appIndex : oldIndex;
    const lastAppIndex = nbrApps - 1;
    const appFocused = appIndex !== null;
    const lineNumber = Math.ceil(nbrApps / this.maxIconNumber);
    const currentLine = appFocused ? Math.ceil((appIndex + 1) / this.maxIconNumber) : null;
    let newIndex;
    switch (cmd) {
      case "previousElem":
        newIndex = oldIndex - 1;
        break;
      case "nextElem":
        newIndex = oldIndex + 1;
        break;
      case "previousColumn":
        if (!appFocused) {
          newIndex = oldIndex;
        } else if (oldIndex % this.maxIconNumber) {
          // app is not the first one on its line
          newIndex = oldIndex - 1;
        } else {
          newIndex = oldIndex + Math.min(lastAppIndex - oldIndex, this.maxIconNumber - 1);
        }
        break;
      case "nextColumn":
        if (!appFocused) {
          newIndex = oldIndex;
        } else if (oldIndex === lastAppIndex || (oldIndex + 1) % this.maxIconNumber === 0) {
          // app is the last one on its line
          newIndex = (currentLine - 1) * this.maxIconNumber;
        } else {
          newIndex = oldIndex + 1;
        }
        break;
      case "previousLine":
        if (!appFocused) {
          if (oldIndex > lastAppIndex + 1) {
            // there is a menu item 'above' -> select it
            newIndex = oldIndex - 1;
          } else {
            // select first app of last line
            newIndex = (lineNumber - 1) * this.maxIconNumber;
          }
        } else if (currentLine === 1) {
          // app is in first line
          if (nbrMenuItems > 0) {
            // there is at least a menu item -> select the last one
            newIndex = lastIndex;
          } else {
            // no menu item -> select the app in the closest column on last line
            newIndex = oldIndex + (lineNumber - 1) * this.maxIconNumber;
            if (newIndex > lastAppIndex) {
              newIndex = lastAppIndex;
            }
          }
        } else {
          // we go to the previous line on same column
          newIndex = oldIndex - this.maxIconNumber;
        }
        break;
      case "nextLine":
        if (!appFocused) {
          newIndex = oldIndex + 1;
        } else if (currentLine === lineNumber) {
          // app is in last line
          if (nbrMenuItems > 0) {
            // there is at least a menu item -> select the first one
            newIndex = lastAppIndex + 1;
          } else {
            // no menu item -> select the app in the same column on first line
            newIndex = oldIndex % this.maxIconNumber;
          }
        } else {
          // we go to the next line on the closest column
          newIndex = oldIndex + Math.min(this.maxIconNumber, lastAppIndex - oldIndex);
        }
        break;
    }
    // if newIndex is out of bounds -> normalize it
    if (newIndex < 0) {
      newIndex = lastIndex;
    } else if (newIndex > lastIndex) {
      newIndex = 0;
    }
    if (this.state.isSearching) {
      this.state.focusedIndex = newIndex;
    } else {
      const item = this.el.getElementsByClassName("o_menuitem")[newIndex];
      item.focus();
    }
  }

  /**
   * Update query and recompute 'global' state (this.state and displayed elements).
   * @private
   * @param {string} query
   */
  _updateQuery(query) {
    // Update input and search state
    this.state.query = query;
    this.inputRef.el.value = this.state.query;
    this.state.isSearching = true;

    // Keep elements matching search query
    if (query === "") {
      this.availableApps = this.props.apps;
      this.displayedMenuItems = [];
    } else {
      this.availableApps = this._filter(this.props.apps);
      this.displayedMenuItems = this._filter(this.props.menuItems);
    }
    const total = this.displayedApps.length + this.displayedMenuItems.length;
    this.state.focusedIndex = total ? 0 : null;
  }

  /**
   * Compensates the width of the scrollbar to avoid flickering when
   * elongating the content of the home menu.
   * @private
   */
  _updateScrollBarWidth() {
    const { clientWidth, offsetWidth, style } = this.mainContentRef.el;
    style.paddingLeft = `${offsetWidth - clientWidth}px`;
  }

  //--------------------------------------------------------------------------
  // Handlers
  //--------------------------------------------------------------------------

  /**
   * @private
   * @param {Object} app
   */
  _onAppClick(app) {
    this._openMenu(app);
  }

  /**
   * @private
   * @param {InputEvent} ev
   */
  _onInputSearch(ev) {
    this._updateQuery(ev.target.value);
  }

  /**
   * @private
   * @param {KeyboardEvent} ev
   */
  _onKeydown(ev) {
    const isEditable =
      ev.target.tagName === "INPUT" ||
      ev.target.tagName === "TEXTAREA" ||
      ev.target.isContentEditable;

    const input = this.inputRef.el;
    if (isEditable && ev.target !== input) {
      return;
    }

    switch (ev.key) {
      case "ArrowDown":
        this._updateFocusedIndex("nextLine");
        ev.preventDefault();
        break;
      case "ArrowRight":
        if (input === document.activeElement && input.selectionEnd < this.state.query.length) {
          return;
        }
        this._updateFocusedIndex("nextColumn");
        ev.preventDefault();
        break;
      case "ArrowUp":
        this._updateFocusedIndex("previousLine");
        ev.preventDefault();
        break;
      case "ArrowLeft":
        if (input === document.activeElement && input.selectionStart > 0) {
          return;
        }
        this._updateFocusedIndex("previousColumn");
        ev.preventDefault();
        break;
      case "Tab":
        if (!this.state.isSearching) {
          return;
        }
        ev.preventDefault();
        this._updateFocusedIndex(ev.shiftKey ? "previousElem" : "nextElem");
        break;
      case "Enter":
        if (this.state.focusedIndex !== null) {
          const isApp = this.appIndex !== null;
          const menu = isApp
            ? this.displayedApps[this.appIndex]
            : this.displayedMenuItems[this.menuIndex];
          this._openMenu(menu);
          ev.preventDefault();
        }
        return;
      case "Alt":
      case "AltGraph":
      case "Control":
      case "PageDown":
      case "PageUp":
      case "Shift":
        break;
      case "Escape": {
        // Clear search query and hide search bar if there was no content
        // before ESC
        // Hide home menu if there is an inner action
        const currentQuery = this.state.query;
        if (currentQuery) {
          this._updateQuery("");
        } else {
          this.homeMenuService.toggle(false);
        }
        break;
      }
      case "c":
      case "x":
        // keep focus and selection on keyboard copy and cut
        if (ev.ctrlKey || ev.metaKey) {
          break;
        }
      default:
        // If any other key:
        // Input is focused and the key is automatically processed by it
        // just as if it were directly typed in it.
        if (document.activeElement !== input) {
          input.focus();
        }
    }
  }

  /**
   * @private
   * @param {Object} menu
   */
  _onMenuitemClick(menu) {
    this._openMenu(menu);
  }
}
HomeMenu.components = { ExpirationPanel };
HomeMenu.props = {
  apps: {
    type: Array,
    element: {
      type: Object,
      shape: {
        actionID: Number,
        appID: Number,
        id: Number,
        label: String,
        parents: String,
        webIcon: [
          Boolean,
          String,
          {
            type: Object,
            optional: 1,
            shape: {
              iconClass: String,
              color: String,
              backgroundColor: String,
            },
          },
        ],
        webIconData: { type: String, optional: 1 },
        xmlid: String,
      },
    },
  },
  menuItems: {
    type: Array,
    element: {
      type: Object,
      shape: {
        actionID: Number,
        appID: Number,
        id: Number,
        label: String,
        menuID: Number,
        parents: String,
        webIcon: Boolean,
        xmlid: String,
      },
    },
  },
};
HomeMenu.template = "web_enterprise.HomeMenu";
