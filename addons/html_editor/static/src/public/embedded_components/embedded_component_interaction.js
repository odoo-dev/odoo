import { TableOfContentManager } from "@html_editor/others/embedded_components/core/table_of_content/table_of_content_manager";
import { Component, onMounted, useSubEnv, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { memoize } from "@web/core/utils/functions";
import { Interaction } from "@web/public/interaction";
import { PUBLIC_EMBEDDINGS } from "@html_editor/public/embedding_sets";

class EmbeddedDummy extends Component {
    static template = xml``;
    static props = ["*"];
}

export const getEmbeddingMap = memoize(
    (embeddings) => new Map(embeddings.map((embedding) => [embedding.name, embedding]))
);

const getTocManager = memoize((element) => new TableOfContentManager({ el: element }));

/**
 * Mount EmbeddedComponent in the Knowledge public view.
 */
export class EmbeddedComponentInteraction extends Interaction {
    static selector = "[data-embedded]";

    dynamicContent = {
        _root: {
            "t-component": () => {
                const embedding = this.getEmbedding(this.el.dataset.embedded) ?? {
                    Component: EmbeddedDummy,
                };
                return this.getComponentInfo(embedding);
            },
        },
    };

    destroy() {
        // Ensure editableDescendants are preserved in the DOM
        this.el.append(...Object.values(this.editableDescendants || {}));
    }

    getComponentInfo({ Component: ComponentClass, getEditableDescendants, getProps, name }) {
        const host = this.el;
        if (ComponentClass !== EmbeddedDummy) {
            ComponentClass = class extends ComponentClass {
                static props = {
                    ...ComponentClass.props,
                    subEnv: Object,
                };

                setup() {
                    onMounted(() => {
                        for (const node of [...host.childNodes]) {
                            // Ensure that only OWL renderings are kept inside
                            // the host.
                            if (node.nodeName !== "OWL-COMPONENT") {
                                node.remove();
                            }
                        }
                    });
                    useSubEnv(this.props.subEnv);
                    super.setup();
                }
            };
        }
        const subEnv = {};
        if (getEditableDescendants) {
            // Keep a reference to editableDescendants.
            this.editableDescendants = getEditableDescendants(host);
            subEnv.getEditableDescendants = getEditableDescendants;
        }
        const props = {
            ...(getProps?.(host) || {}),
            subEnv,
        };
        this.setupNewComponent({ name: name, env: subEnv, props });
        return [ComponentClass, props];
    }

    getEmbedding(name) {
        return getEmbeddingMap(PUBLIC_EMBEDDINGS).get(name);
    }

    setupNewComponent({ name, env, props }) {
        if (name === "tableOfContent") {
            Object.assign(props, {
                // Define the TOC scope to its siblings.
                manager: getTocManager(this.el.parentElement),
            });
        }
    }
}

registry
    .category("public.interactions")
    .add("html_editor.embedded_component", EmbeddedComponentInteraction);
