import { Component, hooks } from "@odoo/owl";
import { ControllerProps, Type } from "../types";
import { ActionType } from "./action_manager";
import { Dialog, DialogProps } from "../components/dialog/dialog";
import { DebugManager } from "../debug_manager/debug_manager";

export interface ActionDialogProps extends DialogProps {
  ActionComponent: Type<Component>;
  actionProps: ControllerProps;
}

const LEGACY_SIZE_CLASSES: { [key: string]: "modal-xl" | "modal-lg" | "modal-sm" } = {
  "extra-large": "modal-xl",
  large: "modal-lg",
  small: "modal-sm",
};

// -----------------------------------------------------------------------------
// Action Dialog (Component)
// -----------------------------------------------------------------------------

/**
 * TrueActionDialog is the "true" ActionDialog class.
 * You should add new web client code in this TrueActionDialog class.
 * If you need to add legacy compatibility layer stuffs, please add them to
 * the ActionDialog exported class (see below).
 */
class TrueActionDialog extends Dialog<ActionDialogProps> {
  static components = { ...Dialog.components, DebugManager };
  static template = "wowl.TrueActionDialog";
  static props = {
    ...Dialog.props,
    ActionComponent: { optional: true },
    actionProps: { optional: true },
  };
  actionRef = hooks.useRef("actionRef");
  actionType: ActionType;

  constructor(parent?: Component | null, props?: ActionDialogProps) {
    super(...arguments);
    const actionProps = props && props.actionProps;
    const action = actionProps && actionProps.action;
    this.actionType = action && action.type;
  }
}

/**
 * This ActionDialog class will disappear when legacy code will be entirely rewritten.
 * The "TrueActionDialog" class will get renamed to "ActionDialog"
 * and exported from this file when the cleaning will occur.
 */
export class ActionDialog extends TrueActionDialog {
  static template = "wowl.ActionDialog";
  isLegacy: boolean;

  constructor(parent?: Component | null, props?: ActionDialogProps) {
    super(...arguments);
    const actionProps = props && props.actionProps;
    const action = actionProps && actionProps.action;
    const actionContext = action && action.context;
    const actionDialogSize = actionContext && actionContext.dialog_size;
    this.props.size = LEGACY_SIZE_CLASSES[actionDialogSize] || (props && props.size);

    const ControllerComponent: any = this.props && this.props.ActionComponent;
    const Controller = ControllerComponent && ControllerComponent.Component;
    this.isLegacy = Controller && Controller.isLegacy;

    hooks.onMounted(() => {
      if (this.isLegacy) {
        // Retrieve the widget climbing the wrappers
        const componentController: any = this.actionRef.comp!;
        const controller = componentController.componentRef.comp;
        const viewAdapter = controller.controllerRef.comp;
        const widget = viewAdapter.widget;

        // Render legacy footer buttons
        const footer = this.modalRef.el!.querySelector("footer")!;
        widget.renderButtons(footer);
      }
    });
  }
}
