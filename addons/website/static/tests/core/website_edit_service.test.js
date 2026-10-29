import { describe, expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { clearRegistry } from "@web/../tests/web_test_helpers";
import { setupInteractionWhiteList, startInteractions } from "@web/../tests/public/helpers";
import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

describe.current.tags("interaction_dev");
setupInteractionWhiteList([]);

class EditProbe extends Interaction {
    static selector = ".probe";
}
class PreviewProbe extends Interaction {
    static selector = ".probe";
}

test("page content never gets the preview interactions", async () => {
    clearRegistry(registry.category("public.interactions.edit"));
    clearRegistry(registry.category("public.interactions.preview"));
    registry.category("public.interactions.edit").add("EditProbe", { Interaction: EditProbe });
    registry
        .category("public.interactions.preview")
        .add("PreviewProbe", { Interaction: PreviewProbe });

    const { core } = await startInteractions(
        `<div id="wrapwrap"><section class="probe page"></section></div>`
    );
    const websiteEdit = core.env.services.website_edit;
    // Same as what the EditInteractionPlugin does when loading.
    const loadedEv = new CustomEvent("edit_interaction_plugin_loaded");
    loadedEv.shared = { history: { ignoreDOMMutations: (fn) => fn() } };
    window.parent.document.dispatchEvent(loadedEv);
    websiteEdit.installPatches();

    const pageEl = document.querySelector(".page");
    const namesOf = (el) =>
        core.interactions.filter((i) => i.el === el).map((i) => i.interaction.constructor.name);
    websiteEdit.update(core.el, "edit");
    await animationFrame();
    expect(namesOf(pageEl)).toEqual(["EditProbe"]);

    // Open the "Add snippet" dialog.
    const dialogEl = document.createElement("div");
    dialogEl.innerHTML = `<div class="o_snippets_preview_row"><section class="probe preview"></section></div>`;
    document.body.append(dialogEl);
    const previewRowEl = dialogEl.firstElementChild;
    const previewEl = previewRowEl.firstElementChild;
    websiteEdit.update(previewRowEl, "preview");
    await animationFrame();
    expect(namesOf(previewEl)).toEqual(["PreviewProbe"]);
    expect(namesOf(pageEl)).toEqual(["EditProbe"]);

    // A page interaction restarts interactions on the page content while the
    // dialog is open.
    core.stopInteractions(pageEl);
    await core.startInteractions(pageEl);
    expect(namesOf(pageEl)).toEqual(["EditProbe"]);

    // A preview interaction restarts interactions on its own content.
    core.stopInteractions(previewEl);
    await core.startInteractions(previewEl);
    expect(namesOf(previewEl)).toEqual(["PreviewProbe"]);

    websiteEdit.uninstallPatches();
    dialogEl.remove();
});
