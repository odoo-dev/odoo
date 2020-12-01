import { Component, core, tags, hooks } from "@odoo/owl";
import type { OdooEnv, Service, Type } from "../types";

const { EventBus } = core;
const { useState } = hooks;

export interface DialogManagerService {
  open: (dialogClass: Type<Component>, props?: object) => void;
}

interface Dialog {
  id: number;
  class: Type<Component>;
  props?: object;
}

interface Dialogs {
  [key: number]: Dialog;
}

class DialogManager extends Component<{}, OdooEnv> {
  static template = tags.xml`
    <div class="o_dialog_manager">
      <t t-foreach="Object.values(dialogs)" t-as="dialog" t-key="dialog.id">
        <t t-component="dialog.class" t-props="dialog.props" t-on-dialog-closed="onDialogClosed(dialog.id)"/>
      </t>
    </div>
    `;
  dialogs = useState({} as Dialogs);
  dialogId: number = 1;

  addDialog(dialogClass: Type<Component>, props?: object) {
    const id = this.dialogId++;
    this.dialogs[id] = {
      id,
      class: dialogClass,
      props,
    };
  }
  onDialogClosed(id: number) {
    delete this.dialogs[id];
  }
}

export const dialogManagerService: Service<DialogManagerService> = {
  name: "dialog_manager",
  deploy(env: OdooEnv): DialogManagerService {
    const bus = new EventBus();

    class ReactiveDialogManager extends DialogManager {
      constructor() {
        super(...arguments);
        bus.on("UPDATE", this, (dialogClass, props) => {
          this.addDialog(dialogClass, props);
        });
      }
    }
    odoo.mainComponentRegistry.add("DialogManager", ReactiveDialogManager);

    function open(dialogClass: Type<Component>, props?: object) {
      bus.trigger("UPDATE", dialogClass, props);
    }

    return { open };
  },
};
