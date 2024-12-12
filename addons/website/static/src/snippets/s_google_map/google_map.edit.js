/* GLOBAL VARIABLE : google */

import { GoogleMap } from "./google_map";
import { registry } from "@web/core/registry";

const GoogleMapEdit = I => class extends I {
    async willStart() {
        if (typeof google !== 'object' || typeof google.maps !== 'object') {
            await new Promise(resolve => {
                this.trigger_up('gmap_api_request', {
                    editableMode: true,
                    onSuccess: () => resolve(),
                });
            });
            return;
        }
        this.canStart = true
    }
}

registry
    .category("website.editable_active_elements_builders")
    .add("website.google_map", {
        Interaction: GoogleMap,
        mixin: GoogleMapEdit,
    });
