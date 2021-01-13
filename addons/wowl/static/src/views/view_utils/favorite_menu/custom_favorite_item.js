/** @odoo-module **/
const { Component, hooks } = owl;
import { useService } from "../../../core/hooks";
import { SearchModel } from "../search_model";
import { Dropdown } from "../../../components/dropdown/dropdown";
const { useRef } = hooks;
let favoriteId = 0;
/**
 * Favorite generator menu
 *
 * This component is used to add a new favorite linked which will take every
 * information out of the current context and save it to a new `ir.filter`.
 *
 * There are 3 additional inputs to modify the filter:
 * - a text input (mandatory): the name of the favorite (must be unique)
 * - 'use by default' checkbox: if checked, the favorite will be the default
 *                              filter of the current model (and will bypass
 *                              any existing default filter). Cannot be checked
 *                              along with 'share with all users' checkbox.
 * - 'share with all users' checkbox: if checked, the favorite will be available
 *                                    with all users instead of the current
 *                                    one.Cannot be checked along with 'use
 *                                    by default' checkbox.
 * Finally, there is a 'Save' button used to apply the current configuration
 * and save the context to a new filter.
 * @extends DropdownMenuItem
 */
export class CustomFavoriteItem extends Component {
  constructor() {
    super(...arguments);
    this._notificationService = useService("notifications");
    this.descriptionRef = useRef("description");
    this.interactive = true;
    this.state = {
      description: /** this.env.action.name ||*/ "",
      isDefault: false,
      isShared: false,
    };
    const favId = favoriteId++;
    this.useByDefaultId = `o_favorite_use_by_default_${favId}`;
    this.shareAllUsersId = `o_favorite_share_all_users_${favId}`;
    // useAutofocus();
  }
  static shouldBeDisplayed() {
    return true;
  }
  //---------------------------------------------------------------------
  // Private
  //---------------------------------------------------------------------
  /**
   * @private
   */
  saveFavorite() {
    if (!this.state.description.length) {
      this._notificationService.create(
        this.env._t("A name for your favorite filter is required."),
        { type: "danger" }
      );
      return this.descriptionRef.el.focus();
    }
    const favorites = this.props.searchModel.getSearchItems((f) => f.type === "favorite");
    if (favorites.some((f) => f.description === this.state.description)) {
      this._notificationService.create(this.env._t("Filter with same name already exists."), {
        type: "danger",
      });
      return this.descriptionRef.el.focus();
    }
    this.props.searchModel.createNewFavorite({
      description: this.state.description,
      isDefault: this.state.isDefault,
      isShared: this.state.isShared,
    });
    // Reset state
    Object.assign(this.state, {
      description: /** this.env.action.name ||*/ "",
      isDefault: false,
      isShared: false,
    });
  }
  //---------------------------------------------------------------------
  // Handlers
  //---------------------------------------------------------------------
  /**
   * @private
   * @param {Event} ev change Event
   */
  _onCheckboxChange(ev) {
    const { checked, id } = ev.target;
    if (this.useByDefaultId === id) {
      this.state.isDefault = checked;
      if (checked) {
        this.state.isShared = false;
      }
    } else {
      this.state.isShared = checked;
      if (checked) {
        this.state.isDefault = false;
      }
    }
  }
  _onInputKeydown(ev) {
    switch (ev.key) {
      case "Enter":
        ev.preventDefault();
        this.saveFavorite();
        break;
      case "Escape":
        // Gives the focus back to the component.
        ev.preventDefault();
        ev.target.blur();
        break;
    }
  }
}
CustomFavoriteItem.props = { searchModel: SearchModel };
CustomFavoriteItem.template = "wowl.CustomFavoriteItem";
CustomFavoriteItem.components = { Dropdown };
CustomFavoriteItem.groupNumber = 3; // have 'Save Current Search' in its own group
