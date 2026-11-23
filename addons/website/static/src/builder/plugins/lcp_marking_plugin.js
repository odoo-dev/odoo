import { Plugin } from "@html_editor/plugin";
import { withSequence } from "@html_editor/utils/resource";
import { registry } from "@web/core/registry";
import { lcpMeasurement } from "@website/components/dialog/lcp_measurement_utils";

/**
 * @typedef {{ model: string, id: number }} LcpRecord
 */

const VIEW_MODELS = ["ir.ui.view", "website.page", "website.controller.page"];
const DYNAMIC_CONTENT_SELECTOR = ".s_dynamic_snippet .dynamic_snippet_template";

export class LcpMarkingPlugin extends Plugin {
    static id = "lcpMarking";
    resources = {
        on_will_save_handlers: withSequence(4, this.keepDynamicContent.bind(this)),
        on_ready_to_save_document_handlers: this.saveLcpImages.bind(this),
    };

    /**
     * @returns {Promise<void>}
     */
    async saveLcpImages() {
        const record = this.lcpRecord();
        if (!record) {
            return;
        }
        const pageDocument = this.snapshotDocument();
        if (!(await this.canSaveLcpImages(record))) {
            return;
        }
        const values = await lcpMeasurement.measureLcpImages(pageDocument);
        if (!Object.keys(values).length) {
            return;
        }
        const { id, metadata } = this.services.website.currentWebsite;
        await this.services.orm.write(record.model, [record.id], values, {
            context: { lang: metadata.lang, website_id: id },
        });
    }

    /**
     * @returns {LcpRecord | undefined} the record that holds the SEO data of
     *   the page
     */
    lcpRecord() {
        if (!this.services.website.isDesigner) {
            return;
        }
        const { seoObject, mainObject, canOptimizeSeo } =
            this.services.website.currentWebsite.metadata;
        return seoObject || (canOptimizeSeo && mainObject) || undefined;
    }

    /**
     * A view that is not specific to a website is copied when it is written
     * from that website. The hints must not cause such a copy.
     *
     * @param {LcpRecord} record
     * @returns {Promise<boolean>}
     */
    async canSaveLcpImages(record) {
        if (VIEW_MODELS.includes(record.model)) {
            const [{ website_id }] = await this.services.orm.read(
                record.model,
                [record.id],
                ["website_id"]
            );
            return !!website_id;
        }
        return this.services.orm.call(record.model, "has_access", [[record.id], "write"]);
    }

    /**
     * Dynamic snippets render their content with an interaction and lose it
     * when the interactions stop for the save. A visitor sees that content.
     *
     * @param {HTMLElement} rootEl the element that is saved
     * @returns {void}
     */
    keepDynamicContent(rootEl) {
        if (rootEl !== this.editable) {
            return;
        }
        this.dynamicContentEls = [...this.editable.querySelectorAll(DYNAMIC_CONTENT_SELECTOR)].map(
            (el) => el.cloneNode(true)
        );
    }

    /**
     * @returns {Document} a copy of the page as it is saved, with the content
     *   of its dynamic snippets
     */
    snapshotDocument() {
        const pageDocument = this.document.cloneNode(true);
        pageDocument.body.classList.remove("editor_enable");
        const editableEl = pageDocument.getElementById(this.editable.id);
        editableEl.replaceWith(this.processThrough("clean_for_save_processors", editableEl));
        pageDocument.querySelectorAll(DYNAMIC_CONTENT_SELECTOR).forEach((el, index) => {
            el.replaceChildren(...this.dynamicContentEls[index].childNodes);
        });
        return pageDocument;
    }
}

registry.category("website-plugins").add(LcpMarkingPlugin.id, LcpMarkingPlugin);
registry.category("translation-plugins").add(LcpMarkingPlugin.id, LcpMarkingPlugin);
