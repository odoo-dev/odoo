/** @odoo-module **/

import { useService } from "../services/service_hook";
import { mainComponentRegistry } from "../webclient/main_component_registry";
import { serviceRegistry } from "../webclient/service_registry";

const { Component, core, tags, useState } = owl;
const { EventBus } = core;

class ErrorHandler extends Component {
  catchError(error) {
    this.props.callback();
    throw error;
  }
}
ErrorHandler.template = tags.xml`<t t-component="props.dialog.class" t-props="props.dialog.props" />`;

export class DialogContainer extends Component {
  setup() {
    this.dialogs = useState({});
    this.dialogId = 1;
    const { bus } = useService("dialog");
    bus.on("UPDATE", this, (dialogClass, props, options) => {
      this.addDialog(dialogClass, props, options);
    });
  }

  addDialog(dialogClass, props, options) {
    const id = this.dialogId++;
    this.dialogs[id] = {
      id,
      class: dialogClass,
      props,
      options,
    };
  }

  onDialogClosed(id) {
    this.doCloseDialog(id);
  }

  doCloseDialog(id) {
    if (this.dialogs[id].options && this.dialogs[id].options.onCloseCallback) {
      this.dialogs[id].options.onCloseCallback();
    }
    delete this.dialogs[id];
  }

  errorCallBack(id) {
    return () => this.doCloseDialog(id);
  }
}
DialogContainer.components = { ErrorHandler };
DialogContainer.template = tags.xml`
    <div class="o_dialog_manager">
      <t t-foreach="Object.values(dialogs)" t-as="dialog" t-key="dialog.id">
        <ErrorHandler dialog="dialog" t-on-dialog-closed="onDialogClosed(dialog.id)" callback="errorCallBack(dialog.id)" />
      </t>
    </div>
    `;

mainComponentRegistry.add("DialogContainer", DialogContainer);

export const dialogService = {
  start() {
    const bus = new EventBus();
    function open(dialogClass, props, options) {
      bus.trigger("UPDATE", dialogClass, props, options);
    }
    return {
      open,
      bus,
      get isReady() {
        return document.getElementsByClassName("o_dialog_manager").length;
      },
    };
  },
};

serviceRegistry.add("dialog", dialogService);
