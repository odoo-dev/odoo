/* global owl */

import useStore from "../hooks/useStore.js";
import { CredentialDialog } from "./dialog/CredentialDialog.js";
import { HandlerDialog } from "./dialog/HandlerDialog.js";
import { LogsDialog } from "./dialog/LogsDialog.js";
import { RemoteDebugDialog } from "./dialog/RemoteDebugDialog.js";

const { Component, xml } = owl;

export class FooterButtons extends Component {
    static props = {};
    static components = {
        RemoteDebugDialog,
        HandlerDialog,
        CredentialDialog,
        LogsDialog,
    };

    setup() {
        this.store = useStore();
    }

    static template = xml`
    <div class="w-100 d-flex align-items-cente gap-2 justify-content-center">
        <a class="btn btn-primary btn-sm" t-att-href="'http://' + this.store.base.ip + '/point_of_sale/display'" target="_blank">PoS Display</a>
        <RemoteDebugDialog t-if="this.store.advanced" />
        <CredentialDialog t-if="this.store.advanced" />
        <HandlerDialog t-if="this.store.advanced" />
        <LogsDialog t-if="this.store.advanced" />
    </div>
  `;
}
