import { Component } from "@odoo/owl";

export enum ParentClosingMode {
  None = "none",
  ClosestParent = "closest",
  AllParents = "all",
}

export interface DropdownItemSelectedPayload {
  payload: Object;
  dropdownClosingRequest: {
    mode: ParentClosingMode;
    isFresh: boolean;
  };
}

export class DropdownItem extends Component {
  static template = "wowl.DropdownItem";
  static props = {
    payload: {
      type: Object,
      optional: true,
    },
    parentClosingMode: {
      type: ParentClosingMode,
      optional: true,
    },
  };
  static defaultProps = {
    parentClosingMode: ParentClosingMode.AllParents,
  };

  /**
   * Handlers
   */
  onClick(ev: MouseEvent) {
    const payload: DropdownItemSelectedPayload = {
      payload: this.props.payload,
      dropdownClosingRequest: {
        isFresh: true,
        mode: this.props.parentClosingMode,
      },
    };
    this.trigger("dropdown-item-selected", payload);
  }
}
