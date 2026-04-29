import { onWillStart } from "@odoo/owl";
import { getActiveHotkey } from "@web/core/hotkeys/hotkey_service";
import { rpc } from "@web/core/network/rpc";
import { useBus } from "@web/core/utils/hooks";
import { useNestedSortable } from "@web/core/utils/nested_sortable";
import { useState, useRef, useSubEnv } from "@web/owl2/utils";
import { SearchPanel } from "@web/search/search_panel/search_panel";
import { SectionRow } from "../section_row/section_row";

export class AccountProductCatalogSearchPanel extends SearchPanel {
    static template = "account.ProductCatalogSearchPanel";
    static components = { SectionRow };

    setup() {
        super.setup();

        this.state = useState({
            ...this.state,
            sections: [],
            isAddingSection: "",
            newSectionName: "",
            dragging: false,
            renamingSectionId: null,
        });

        useSubEnv({
            setSelectedSection: this.setSelectedSection.bind(this),
            enableSectionInput: this.enableSectionInput.bind(this),
            enableRenameSectionInput: this.enableRenameSectionInput.bind(this),
            createSection: this.createSection.bind(this),
            loadSections: this.loadSections.bind(this),
            renameSection: this.renameSection.bind(this),
            onSectionInputKeydown: this.onSectionInputKeydown.bind(this),
            findSectionById: this.findSectionById.bind(this),
            getSectionInfoParams: this.getSectionInfoParams.bind(this),
            sortSectionsBySequence : this.sortSectionsBySequence.bind(this),
        })

        useBus(this.env.searchModel, "section-subtotal-change", this.updateSectionSubtotal);

        onWillStart(async () => await this.loadSections());

        this.sectionTreeRef = useRef("sectionTreeRef");

        useNestedSortable({
            ref: this.sectionTreeRef,
            elements: "li.o_section",
            nest: true,
            listTagName: "ul",
            useElementSize: true,
            maxLevels: 2,
            preventDrag: (el) => {
                const id = el.dataset.id;
                return !id;
            },
            isAllowed: ({ element, placeHolder }) => {
                const id = parseInt(element.dataset.id);
                const node = id && this.findSectionById(id);
                if (!node) return false;

                const targetParentId =
                    placeHolder.parentElement?.closest("li.o_section")?.dataset.id || false;

                // allow only if both are same level (section <-> section OR
                // subsection <-> subsection)
                return Boolean(node.parent_id) === Boolean(targetParentId);
            },

            onDragStart: () => {
                this.state.dragging = true;
            },

            onDragEnd: () => {
                this.state.dragging = false;
            },

            onDrop: (params) => this.resequenceSections(params),

        });
    }

    updateActiveValues() {
        super.updateActiveValues();
        this.state.sidebarExpanded ||= this.showSections;
    }

    get showSections() {
        return this.env.model.config.context.show_sections;
    }

    get selectedSection() {
        return this.env.searchModel.selectedSection;
    }

    enableSectionInput(parentId = null) {
        this.state.isAddingSection = parentId
            ? `subsection_${parentId}`
            : "section";
        setTimeout(() => document.querySelector(".o_section_input")?.focus(), 100);
    }

    enableRenameSectionInput(sectionId) {
        const section = this.findSectionById(sectionId);
        if (!section) return;

        this.state.renamingSectionId = sectionId;
        this.state.newSectionName = section.name;

        setTimeout(() => document.querySelector(".o_section_input")?.focus(), 100);
    }

    onSectionInputKeydown(ev, parentId, renameId = null) {
        const hotkey = getActiveHotkey(ev);
        if (hotkey === "enter") {
            if (renameId) {
                this.renameSection(renameId);
            } else {
                this.createSection(parentId);
            }
        } else if (hotkey === "escape") {
            Object.assign(this.state, {
                isAddingSection: "",
                newSectionName: "",
                renamingSectionId: null,
            });
        }
    }

    setSelectedSection(sectionId=null, filtered=false) {
        this.env.searchModel.setSelectedSection(sectionId, filtered);
    }

    async createSection(parentId = null) {
        const sectionName = this.state.newSectionName.trim();
        if (!sectionName) return this.state.isAddingSection = '';

        const section = await rpc("/product/catalog/create_section",
            this.getSectionInfoParams({
                name: sectionName,
                parent_id: parentId,
            })
        );

        if (section) {
            const newNode = {
                ...section,
                name: sectionName,
                children: [],
                isOpen: true,
                parent_id: parentId,
            };

            if (parentId) {
                const parent = this.findSectionById(parentId);
                parent.children.push(newNode);
                parent.isOpen = true;
            } else {
                this.state.sections.push(newNode);
            }
            this.sortSectionsBySequence(this.state.sections);
            this.setSelectedSection(section.id);
        }
        Object.assign(this.state, {
            isAddingSection: "",
            newSectionName: "",
        });
    }

    async loadSections(sectionId) {
        if (!this.showSections) return;
        const sections = await rpc("/product/catalog/get_sections", this.getSectionInfoParams());

        const sectionsById = new Map();
        const sectionTree = [];
         for (const sec of sections) {
            sectionsById.set(sec.id, {
                ...sec,
                children: [],
                isOpen: false,
            });
        }
        for (const section of sectionsById.values()) {
            if (section.parent_id) {
                sectionsById.get(section.parent_id)?.children.push(section);
            } else {
                sectionTree.push(section);
            }
        }

        this.state.sections = sectionTree;
        if (sectionTree.length) {
            this.setSelectedSection(sectionId ?? sectionTree[0].id);
        }
    }

    async renameSection(sectionId) {
        const name = this.state.newSectionName.trim();
        if (!name) {
            this.state.renamingSectionId = null;
            return;
        }

        await rpc(
            "/product/catalog/rename_section",
            this.getSectionInfoParams({
                section_id: sectionId,
                new_name: name,
            })
        );

        const section = this.findSectionById(sectionId);
        if (section) {
            section.name = name;
        }

        this.state.renamingSectionId = null;
        this.state.newSectionName = "";
    }

    resequenceSections({ element, parent, next }) {
        const id = parseInt(element.dataset.id);
        if (!id) return;

        const parentId = parent ? parseInt(parent.dataset.id) : false;
        const nextId = next ? parseInt(next.dataset.id) : null;

        const node = this._extractNode(id);
        if (!node) return;

        node.parent_id = parentId;

        const list = parentId
            ? this.findSectionById(parentId).children
            : this.state.sections;

        const index = nextId
            ? list.findIndex(n => n.id === nextId)
            : list.length;

        list.splice(index === -1 ? list.length : index, 0, node);

        list.forEach((n, i) => n.sequence = i + 1);

        rpc("/product/catalog/resequence_sections",
            this.getSectionInfoParams({
                moved_section_id: id,
                new_parent_section_id: parentId,
                insert_before_section_id: nextId,
            })
        );
    }

    _extractNode(id) {
        const rootIdx = this.state.sections.findIndex(n => n.id === id);
        if (rootIdx !== -1) {
            return this.state.sections.splice(rootIdx, 1)[0];
        }
        for (const section of this.state.sections) {
            const idx = section.children.findIndex(n => n.id === id);
            if (idx !== -1) {
                return section.children.splice(idx, 1)[0];
            }
        }
        return null;
    }

    updateSectionSubtotal({ detail: { sectionId, subtotalDelta } }) {
        const section = this.findSectionById(sectionId);
        if (!section) return;

        section.subtotal += subtotalDelta;

        if (section.parent_id) {
            const parent = this.findSectionById(section.parent_id);
            if (parent) {
                parent.subtotal += subtotalDelta;
            }
        }
    }

    findSectionById(id) {
        for (const sec of this.state.sections) {
            if (sec.id === id) return sec;

            const child = sec.children.find(c => c.id === id);
            if (child) return child;
        }
        return null;
    }

    getSectionInfoParams(extra = {}) {
        const ctx = this.env.model.config.context;
        return {
            res_model: ctx.product_catalog_order_model,
            order_id: ctx.order_id,
            child_field: ctx.child_field,
            ...extra,
        };
    }

    sortSectionsBySequence() {
        this.state.sections.sort((a, b) => a.sequence - b.sequence);

        for (const sec of this.state.sections) {
            if (sec.children && sec.children.length) {
                sec.children.sort((a, b) => a.sequence - b.sequence);
            }
        }
        this.state.sections = [...this.state.sections];
    }
}
