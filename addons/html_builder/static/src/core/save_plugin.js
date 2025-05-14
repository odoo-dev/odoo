import { Plugin } from "@html_editor/plugin";
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { groupBy } from "@web/core/utils/arrays";
import { uniqueId } from "@web/core/utils/functions";

const oeStructureSelector = "#wrapwrap .oe_structure[data-oe-xpath][data-oe-id]";
const oeFieldSelector = "#wrapwrap [data-oe-field]:not([data-oe-sanitize-prevent-edition])";
const OE_RECORD_COVER_SELECTOR = "#wrapwrap .o_record_cover_container[data-res-model]";
const oeCoverSelector = `#wrapwrap .s_cover[data-res-model], ${OE_RECORD_COVER_SELECTOR}`;
const SAVABLE_SELECTOR = `${oeStructureSelector}, ${oeFieldSelector}, ${oeCoverSelector}`;

export class SavePlugin extends Plugin {
    static id = "savePlugin";
    static shared = ["save"];

    resources = {
        handleNewRecords: this.handleMutations.bind(this),
        start_edition_handlers: this.startObserving.bind(this),
        // Resource definitions:
        before_save_handlers: [
            // async () => {
            //     called at the very beginning of the save process
            // }
        ],
        clean_for_save_handlers: [
            // ({root}) => {
            //     clean DOM before save (leaving edit mode)
            //     root is the clone of a node that was o_dirty
            // }
        ],
        save_handlers: [
            // async () => {
            //     called at the very end of the save process
            // }
        ],
        get_dirty_els: () => this.editable.querySelectorAll(".o_dirty"),
    };

    setup() {
        this.canObserve = false;
    }

    async save() {
        // TODO: implement the "group by" feature for save
        const proms = [];
        for (const fn of this.getResource("before_save_handlers")) {
            proms.push(fn());
        }
        await Promise.all(proms);
        const dirtyEls = [];
        for (const getDirtyEls of this.getResource("get_dirty_els")) {
            dirtyEls.push(...getDirtyEls());
        }
        // Group elements to save if possible.
        const groupedElements = groupBy(dirtyEls, (dirtyEl) => {
            const model = dirtyEl.dataset.oeModel;
            const field = dirtyEl.dataset.oeField;

            // There are elements which have no linked model as something
            // special is to be done "to save them" (potential override to
            // `_saveElement` which is expected to be called for each unique
            // dirty element). In that case, do not group those elements.
            if (!model) {
                return uniqueId("special-element-to-save-");
            }

            // Do not group elements which are parts of views, unless we are
            // in translate mode.
            if (!this.config.isTranslation && model === "ir.ui.view" && field === "arch") {
                return uniqueId("view-part-to-save-");
            }

            // Otherwise, group elements which are from the same field of the
            // same record (`_saveElement` will only consider the first one and
            // `_saveTranslationElement` can handle the set if it makes sense).
            return `${model}::${dirtyEl.dataset.oeId}::${field}`;
        });
        const saveProms = Object.values(groupedElements).map(async (dirtyEls) => {
            const cleanedEls = dirtyEls.map((dirtyEl) => {
                dirtyEl.classList.remove("o_dirty");
                const cleanedEl = dirtyEl.cloneNode(true);
                this.dispatchTo("clean_for_save_handlers", { root: cleanedEl });
                return cleanedEl;
            });

            if (this.config.isTranslation) {
                await this.saveTranslationElement(cleanedEls);
            } else {
                await this.saveView(cleanedEls[0]);
            }
        });
        // used to track dirty out of the editable scope, like header, footer or wrapwrap
        const willSaves = this.getResource("save_handlers").map((c) => c());
        await Promise.all(saveProms.concat(willSaves));
    }

    async saveCoverProperties(el) {
        const resModel = el.dataset.resModel;
        const resID = Number(el.dataset.resId);

        if (!resModel || !resID) {
            throw new Error("There should be a model and id associated to the cover");
        }

        const coverProps = {
            "background-image": el.dataset.bgImage,
            background_color_class: el.dataset.bgColorClass,
            background_color_style: el.dataset.bgColorStyle,
            opacity: el.dataset.filterValue,
            resize_class: el.dataset.coverClass,
            text_align_class: el.dataset.textAlignClass,
        };

        return this.services.orm.write(resModel, [resID], {
            cover_properties: JSON.stringify(coverProps),
        });
    }

    /**
     * Saves one (dirty) element of the page.
     *
     * @param {HTMLElement} el - the element to save.
     */
    async saveView(el) {
        const proms = [];
        const viewID = Number(el.dataset["oeId"]);

        if (el.classList.contains("o_record_cover_container")) {
            proms.push(this.saveCoverProperties(el));

            if (!viewID) {
                return Promise.all(proms);
            }
        }

        const delayTranslations = this.config.isTranslation ? {} : { delay_translations: false };
        const context = {
            website_id: this.services.website.currentWebsite.id,
            lang: this.services.website.currentWebsite.metadata.lang,
            // TODO: Restore the delay translation feature once it's
            // fixed, see commit msg for more info.
            ...delayTranslations,
        };

        proms.push(
            this.services.orm.call(
                "ir.ui.view",
                "save",
                [
                    viewID,
                    el.outerHTML,
                    (!el.dataset["oeExpression"] && el.dataset["oeXpath"]) || null,
                ],
                { context }
            )
        );
        return Promise.all(proms);
    }

    /**
     * If the element holds a translation, saves it. Otherwise, fallback to the
     * standard saving but with the lang kept.
     *
     * @param {Array<HTMLElement>} els - the elements to save.
     */
    async saveTranslationElement(els) {
        if (els[0].dataset["oeTranslationSourceSha"]) {
            const translations = {};
            translations[this.services.website.currentWebsite.metadata.lang] = Object.assign(
                {},
                ...els.map((el) => ({
                    [el.dataset["oeTranslationSourceSha"]]: this.getEscapedElement(el).innerHTML,
                }))
            );
            return rpc("/web_editor/field/translation/update", {
                model: els[0].dataset["oeModel"],
                record_id: [Number(els[0].dataset["oeId"])],
                field_name: els[0].dataset["oeField"],
                translations,
            });
        }
        // TODO: check what we want to modify in translate mode
        return this.saveView(els[0]);
    }

    getEscapedElement(el) {
        const escapedEl = el.cloneNode(true);
        const allElements = [escapedEl, ...escapedEl.querySelectorAll("*")];
        const exclusion = [];
        for (const element of allElements) {
            if (
                element.matches(
                    "object,iframe,script,style,[data-oe-model]:not([data-oe-model='ir.ui.view'])"
                )
            ) {
                exclusion.push(element);
                exclusion.push(...element.querySelectorAll("*"));
            }
        }
        const exclusionSet = new Set(exclusion);
        const toEscapeEls = allElements.filter((el) => !exclusionSet.has(el));
        for (const toEscapeEl of toEscapeEls) {
            for (const child of Array.from(toEscapeEl.childNodes)) {
                if (child.nodeType === 3) {
                    const divEl = document.createElement("div");
                    divEl.textContent = child.nodeValue;
                    child.nodeValue = divEl.innerHTML;
                }
            }
        }
        return escapedEl;
    }

    startObserving() {
        this.canObserve = true;
    }
    /**
     * Handles the flag of the closest savable element to the mutation as dirty
     *
     * @param {Object} records - The observed mutations
     * @param {String} currentOperation - The name of the current operation
     */
    handleMutations(records, currentOperation) {
        if (!this.canObserve) {
            return;
        }
        if (currentOperation === "undo" || currentOperation === "redo") {
            // Do nothing as `o_dirty` has already been handled by the history
            // plugin.
            return;
        }
        for (const record of records) {
            if (record.attributeName === "contenteditable") {
                continue;
            }
            let targetEl = record.target;
            if (!targetEl.isConnected) {
                continue;
            }
            if (targetEl.nodeType !== Node.ELEMENT_NODE) {
                targetEl = targetEl.parentElement;
            }
            if (!targetEl) {
                continue;
            }
            const savableEl = targetEl.closest(SAVABLE_SELECTOR);
            if (
                !savableEl ||
                savableEl.classList.contains("o_dirty") ||
                savableEl.hasAttribute("data-oe-readonly")
            ) {
                continue;
            }
            savableEl.classList.add("o_dirty");
        }
    }
}
registry.category("translation-plugins").add(SavePlugin.id, SavePlugin);
