import { registry } from "@web/core/registry";
import { clickOnEditAndWaitEditMode } from "@website/js/tours/tour_utils";

registry.category("web_tour.tours").add("restricted_editor", {
    steps: () => [...clickOnEditAndWaitEditMode()],
});
