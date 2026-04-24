import { Component } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";

export class SectionDropdown extends Component {
    static template = "account.SectionDropdown";
    static components = { Dropdown, DropdownItem };

    static props = {
        section: Object,
        state: Object,
    };

    async duplicateSection() {
        const duplicateSectionId = await rpc("/product/catalog/duplicate_section",
            this.env.getSectionInfoParams({
                section_id: this.props.section.id,
                parent_id: this.props.section.parent_id,
            })
        );
        await this.env.loadSections(duplicateSectionId);
    }

    async deleteSection() {
        const { section, state } = this.props;

        await rpc(
            "/product/catalog/delete_section",
            this.env.getSectionInfoParams({ section_id: section.id })
        );

         if (section.parent_id) {
            this.parent.children = this.parent.children.filter(c => c.id !== section.id);
        } else {
            state.sections = state.sections.filter(s => s.id !== section.id);
        }
        const selectedSectionId = this.env.searchModel.selectedSection.sectionId;
        if (selectedSectionId === section.id && state.sections.length) {
            this.env.setSelectedSection(state.sections[0].id, false);
        }

        if (!state.sections.length) {
            state.sections.push({
                id: false,
                name: _t("No Section"),
                line_count: 0,
                children: [],
                isOpen: true,
            });
            this.env.setSelectedSection(false);
        }
    }

    async toggleFieldOfSection(field) {
        const section = this.props.section;

        await rpc(
            "/product/catalog/toggle_field_of_section",
            this.env.getSectionInfoParams({
                section_id: section.id,
                field: field,
            })
        );
        section[field] = !section[field];

        // If enabled, disable others
        if (section[field]) {
            for (const f of this._getToggleFieldsOfSection()) {
                if (f !== field) {
                    section[f] = false;
                }
            }
        }
    }

    disableCompositionButton() {
        return !!this.parent?.collapse_composition;
    }

    disablePricesButton() {
        return !!(this.parent?.collapse_prices || this.parent?.collapse_composition);
    }

    get parent() {
        return this.env.findSectionById(this.props.section.parent_id);
    }

    _getToggleFieldsOfSection(){
        return ["collapse_prices", "collapse_composition"];
    }
}
