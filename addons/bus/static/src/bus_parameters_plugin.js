import { Plugin, signal } from "@odoo/owl";
import { services } from "@web/core/services";

export class BusParametersPlugin extends Plugin {
    serverURL = signal(window.origin);
}

services.add(BusParametersPlugin);
