import { Component } from "@odoo/owl";
import { Registry } from "../../core/registry";
import { Dropdown } from "../../components/dropdown/dropdown";
import { DropdownItem } from "../../components/dropdown/dropdown_item";

export interface ActionMenusProps {
  selectedIds: number[];
  items: any; // TODO
}

/**
 * Action menus (or Action/Print bar, previously called 'Sidebar')
 *
 * The side bar is the group of dropdown menus located on the left side of the
 * control panel. Its role is to display a list of items depending on the view
 * type and selected records and to execute a set of actions on active records.
 * It is made out of 2 dropdown menus: Print and Action.
 *
 * This component also provides a registry to use custom components in the ActionMenus's
 * Action menu.
 * @extends Component
 */
export class ActionMenus extends Component {
  static registry = new Registry();

  static components = { Dropdown, DropdownItem };
  static props = {
    activeIds: { type: Array, element: [Number || String] }, // virtual IDs are strings.
    context: Object,
    domain: { type: Array, optional: 1 },
    isDomainSelected: { type: Boolean, optional: 1 },
    items: {
      type: Object,
      shape: {
        action: { type: Array, optional: 1 },
        print: { type: Array, optional: 1 },
        other: { type: Array, optional: 1 },
      },
    },
  };
  static template = "wowl.ActionMenus";

  // mounted() {
  //     this._addTooltips();
  // }

  // patched() {
  //     this._addTooltips();
  // }

  //---------------------------------------------------------------------
  // Getters
  //---------------------------------------------------------------------

  /**
   * @returns {Object[]}
   */
  get actionItems() {
    // Callback based actions
    const callbackActions = (this.props.items.other || []).map((action: any) =>
      Object.assign({ key: `action-${action.description}` }, action)
    );
    // Action based actions
    const actionActions = this.props.items.action || [];
    const relateActions = this.props.items.relate || [];
    const formattedActions = [...actionActions, ...relateActions].map((action) => ({
      callback: action.callback,
      name: action.name,
      key: action.id,
    }));
    // ActionMenus action registry components
    const registryActions = ActionMenus.registry
      .getAll()
      .map(({ Component, getProps }: any, index: any) => ({
        key: `registry-action-${index}`,
        Component,
        props: getProps(this.props),
      }));
    return [...callbackActions, ...formattedActions, ...registryActions];
  }

  /**
   * @returns {Object[]}
   */
  get printItems() {
    const printActions = this.props.items.print || [];
    const printItems = printActions.map((action: any) => ({
      callback: action.callback,
      name: action.name,
      key: action.id,
    }));
    return printItems;
  }

  //---------------------------------------------------------------------
  // Private
  //---------------------------------------------------------------------

  // /**
  //  * Add teh tooltips to the items
  //  * @private
  //  */
  // _addTooltips() {
  //     $(this.el.querySelectorAll('[title]')).tooltip({
  //         delay: { show: 500, hide: 0 }
  //     });
  // }

  //---------------------------------------------------------------------
  // Handlers
  //---------------------------------------------------------------------

  // /**
  //  * Perform the action for the item clicked after getting the data
  //  * necessary with a trigger.
  //  * @private
  //  * @param {OwlEvent} ev
  //  */
  // async _executeAction(action) {
  //     let activeIds = this.props.activeIds;
  //     if (this.props.isDomainSelected) {
  //         activeIds = await this.rpc({
  //             model: this.env.action.res_model,
  //             method: 'search',
  //             args: [this.props.domain],
  //             kwargs: {
  //                 limit: this.env.session.active_ids_limit,
  //             },
  //         });
  //     }
  //     const activeIdsContext = {
  //         active_id: activeIds[0],
  //         active_ids: activeIds,
  //         active_model: this.env.action.res_model,
  //     };
  //     if (this.props.domain) {
  //         // keep active_domain in context for backward compatibility
  //         // reasons, and to allow actions to bypass the active_ids_limit
  //         activeIdsContext.active_domain = this.props.domain;
  //     }

  //     const context = new Context(this.props.context, activeIdsContext).eval();
  //     const result = await this.rpc({
  //         route: '/web/action/load',
  //         params: { action_id: action.id, context },
  //     });
  //     result.context = new Context(result.context || {}, activeIdsContext)
  //         .set_eval_context(context);
  //     result.flags = result.flags || {};
  //     result.flags.new_window = true;
  //     this.trigger('do-action', {
  //         action: result,
  //         options: {
  //             on_close: () => this.trigger('reload'),
  //         },
  //     });
  // }

  /**
   * Handler used to determine which way must be used to execute a selected
   * action: it will be either:
   * - a callback (function given by the view controller);
   * - an action ID (string);
   * - an URL (string).
   * @private
   * @param {OwlEvent} ev
   */
  _onItemSelected(/* item */) {
    // if (item.callback) {
    //     item.callback([item]);
    // } else if (item.action) {
    //     this._executeAction(item.action);
    // } else if (item.url) {
    //     // Event has been prevented at its source: we need to redirect manually.
    //     this.env.services.navigate(item.url);
    // }
  }
}
