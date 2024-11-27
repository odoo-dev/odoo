import { GoogleMap } from "../000";
import { registry } from "@web/core/registry";

export class GoogleMapEdit extends GoogleMap {

    async willStart() {
        if (typeof google !== 'object' || typeof google.maps !== 'object') {
            await new Promise(resolve => {
                this.env.bus.trigger("gmap_api_request", {
                    editableMode: true,
                    onSuccess: () => resolve(),
                });
            });
            // The animation will be restarted for all maps as soon as the
            // google map script has been executed.
        }
    }

}

registry
    .category("website.edit_active_elements")
    .add("website.google_map", GoogleMapEdit);
