import { onWillStart } from '@odoo/owl';
import { formatCurrency } from '@web/core/currency';
import { getActiveHotkey } from '@web/core/hotkeys/hotkey_service';
import { rpc } from '@web/core/network/rpc';
import { useBus } from '@web/core/utils/hooks';
import { useState } from "@web/owl2/utils";
import { SearchPanel } from '@web/search/search_panel/search_panel';


export class AccountProductCatalogSearchPanel extends SearchPanel {
    static template = 'account.ProductCatalogSearchPanel';

    setup() {
        super.setup();

        this.state = useState({
            ...this.state,
            sections: [],
            isAddingSection: '',
            newSectionName: "",
        });

        useBus(this.env.searchModel, 'section-line-count-change', this.updateSectionLineCount);

        onWillStart(async () => await this.loadSections());
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

    getFormattedSubTotal(section) {
        return formatCurrency(section.subtotal, section.currency_id);
    }

    toggle(section) {
        section.isOpen = !section.isOpen;
    }

    onDragStart(sectionId, ev) {
        ev.dataTransfer.setData('section_id', sectionId);
    }

    onDragOver(ev) {
        ev.preventDefault();
    }

    onDrop(targetSecId, ev) {
        ev.preventDefault();
        const moveSecId = parseInt(ev.dataTransfer.getData('section_id'));
        if (moveSecId !== targetSecId) this.reorderSections(moveSecId, targetSecId);
    }

    enableSectionInput(type, parentId = null) {
        this.state.isAddingSection = parentId
            ? `subsection_${parentId}`
            : type;
        setTimeout(() => document.querySelector('.o_section_input')?.focus(), 100);
    }

    onSectionInputKeydown(ev, parentId) {
        const hotkey = getActiveHotkey(ev);
        if (hotkey === 'enter') {
            this.createSection(parentId);
        } else if (hotkey === 'escape') {
            Object.assign(this.state, {
                isAddingSection: '',
                newSectionName: "",
            });
        }
    }

    setSelectedSection(sectionId=null, filtered=false) {
        this.env.searchModel.setSelectedSection(sectionId, filtered);
    }

    async createSection(parentId = null) {
        const sectionName = this.state.newSectionName.trim();
        if (!sectionName) return this.state.isAddingSection = '';

        const position = this.state.isAddingSection;
        const section = await rpc('/product/catalog/create_section',
            this._getSectionInfoParams({
                name: sectionName,
                position: position,
                parent_id: parentId,
            })
        );

        if (section) {
            let newLineCount = 0;

            if (position === 'top') {
                const noSection = this.state.sections.find(sec => sec.id === false);

                if (noSection) {
                    newLineCount = noSection.line_count;
                    this.state.sections = this.state.sections.filter(sec => sec.id !== false);
                }
            }
            const newNode = {
                ...section,
                name: sectionName,
                children: [],
                isOpen: true,
                parentId: parentId,
                line_count: newLineCount
            };

            if (parentId) {
                const parent = this._findSectionById(parentId, this.state.sections);
                parent?.children.push(newNode);
                parent.isOpen = true;
            } else {
                this.state.sections.push(newNode);
            }
            this._sortSectionsBySequence(this.state.sections);
            this.setSelectedSection(section.id);
        }
        Object.assign(this.state, {
            isAddingSection: '',
            newSectionName: "",
        });
    }

    async loadSections() {
        if (!this.showSections) return;
        const sections = await rpc('/product/catalog/get_sections', this._getSectionInfoParams());

        const map = new Map();
        const tree = [];
         for (const sec of sections) {
            map.set(sec.id, {
                ...sec,
                children: [],
                isOpen: true,
            });
        }
        for (const sec of map.values()) {
            if (sec.parent_id) {
                map.get(sec.parent_id)?.children.push(sec);
            } else {
                tree.push(sec);
            }
        }

        this.state.sections = tree;
        if (tree.length) {
            this.setSelectedSection(tree[0].id);
        }
    }

    async reorderSections(moveId, targetId) {
        const sections = this.state.sections;
        const moveSection = sections.get(moveId);
        const targetSection = sections.get(targetId);

        if (!moveSection || !targetSection) return;

        const updatedSequences = await rpc('/product/catalog/resequence_sections',
            this._getSectionInfoParams({
                sections: [
                    { id: moveId, sequence: moveSection.sequence },
                    { id: targetId, sequence: targetSection.sequence },
                ],
            })
        );
        for (const [id, sequence] of Object.entries(updatedSequences)) {
            const section = sections.get(parseInt(id));
            section && (section.sequence = sequence);
        }
        const noSection = sections.get(false);
        noSection && (noSection.sequence = 0); // Reset the sequence of the "No Section"
        this._sortSectionsBySequence(sections);
    }

    updateSectionLineCount({ detail: { sectionId, lineCountChange } }) {
        const section = this._findSectionById(sectionId, this.state.sections);
        if (!section) return;

        section.line_count = Math.max(0, (section.line_count || 0) + lineCountChange);

        if (section.line_count === 0 && sectionId === false && this.state.sections.length > 1) {
            this.state.sections = this.state.sections.filter(sec => sec.id !== sectionId);
            this.setSelectedSection(this.state.sections.length ? this.state.sections[0].id : null);
        }
    }

    _findSectionById(id, nodes) {
        for (const node of nodes) {
            if (node.id === id) return node;
            const found = this._findSectionById(id, node.children);
            if (found) return found;
        }
    }

    _getSectionInfoParams(extra = {}) {
        const ctx = this.env.model.config.context;
        return {
            res_model: ctx.product_catalog_order_model,
            order_id: ctx.order_id,
            child_field: ctx.child_field,
            ...extra,
        };
    }

    _sortSectionsBySequence(sections) {
        const sortRecursively = (nodes) => {
            nodes.sort((a, b) => a.sequence - b.sequence);
            for (const node of nodes) {
                if (node.children && node.children.length) {
                    sortRecursively(node.children);
                }
            }
        };

        sortRecursively(sections);
        this.state.sections = sections;
    }
}
