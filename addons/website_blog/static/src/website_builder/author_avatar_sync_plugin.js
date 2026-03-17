import { registry } from "@web/core/registry";
import { Plugin } from "@html_editor/plugin";

export class AuthorAvatarSyncPlugin extends Plugin {
    static id = "authorAvatarSync";
    static dependencies = ["domMutation"];
    /** @type {import("plugins").WebsiteResources} */
    resources = {
        /**
         * @param {import("@html_editor/core/dom_mutation_plugin").SerializedMutation[]} records
         */
        on_new_records_handled_handlers: (records) => {
            records
                .filter((r) => r.type === "attributes" && r.attributeName === "data-oe-many2one-id")
                .map((r) => ({...r, target: this.dependencies.domMutation.getNodeById(r.nodeId)}))
                .filter((r) => r.target.dataset.oeField === "author_id")
                .forEach((r) => this.authorToUpdate.set(r.target.dataset.oeId, r.value));
        },
        normalize_processors: (root, stepState) => {
            const toUpdate = this.authorToUpdate;
            this.authorToUpdate = new Map();
            if (stepState !== "original") {
                return;
            }
            for (const [oeId, id] of toUpdate.entries()) {
                for (const node of this.editable.querySelectorAll(
                    `[data-oe-model="blog.post"][data-oe-id="${oeId}"][data-oe-field="author_avatar"]`
                )) {
                    node.querySelector("img").src = `/web/image/res.partner/${id}/avatar_1024`;
                }
            }
        },
    };

    setup() {
        this.authorToUpdate = new Map();
    }
}

registry.category("website-plugins").add(AuthorAvatarSyncPlugin.id, AuthorAvatarSyncPlugin);
