import { Component, proxy, useProps, t, signal } from "@odoo/owl";
import { scrollToSelected } from "@pos_self_order/app/utils/scroll_to_selected";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";
import { getDisplayDateInfo } from "@point_of_sale/utils";

/**
 * PillsSelectionPopup component
 *
 * @props title: string
 * @props subtitle: string
 * @props close: function
 * @props getPayload: function
 * @props isOptionValid: function, optional: checked on confirm, rejects options that expired since opening
 * @props options: {
 *   categories: {
 *     [categoryId]: {
 *       id: string,
 *       name: string,
 *       subCategories: {
 *         [subCategoryId]: {
 *           id: string,
 *           name: string,
 *           options: Array<{ id: string, name: string, disabled: boolean }>
 *         }
 *      }
 *   }
 */
export class PillsSelectionPopup extends Component {
    static template = "pos_self_order.PillsSelectionPopup";
    static components = { Dialog };
    props = useProps({
        options: t.object(),
        title: t.string(),
        subtitle: t.string(),
        close: t.function(),
        getPayload: t.function(),
        selectionType: t.string(),
        isOptionValid: t.function().optional(),
    });

    categoryListRef = signal.ref();

    setup() {
        this.ui = useService("ui");
        this.selfOrder = useService("self_order");
        this.state = proxy({
            selectedCategoryId: this.categories.length > 0 ? this.categories[0].id : null,
            selectedOptionId: null,
            rejectedOptionIds: [],
        });

        this.onClickScrollTracked = scrollToSelected(
            this.categoryListRef,
            this.selectCategory.bind(this)
        );
    }

    get categories() {
        return Object.values(this.props.options.categories);
    }

    get getSelectedCategorySubCategories() {
        const categoryId = this.state.selectedCategoryId;
        const category = this.props.options.categories[categoryId];
        return category ? Object.values(category.subCategories) : [];
    }

    get getSelectedCategoryOptions() {
        return this.props.options.options[this.state.selectedCategoryId] || [];
    }

    confirmSelection() {
        const optionId = this.state.selectedOptionId;
        if (this.props.isOptionValid && !this.props.isOptionValid(optionId)) {
            this.state.rejectedOptionIds.push(optionId);
            this.state.selectedOptionId = null;
            return;
        }
        this.props.getPayload(optionId);
        this.props.close();
    }

    selectOption(optionId) {
        this.state.selectedOptionId = optionId;
    }

    selectCategory(categId) {
        this.state.selectedCategoryId = categId;
        this.state.selectedOptionId = null;
    }

    get isTimeSelection() {
        return this.props.selectionType == "time";
    }

    get isTableSelection() {
        return this.props.selectionType == "table";
    }

    getCategoryInfo(category) {
        if (!this.isTimeSelection) {
            return { label: category.name };
        }

        return getDisplayDateInfo(category.id);
    }
}
