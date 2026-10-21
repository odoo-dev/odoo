/** Selectors of the standard screens (lists, forms, search), shared by lessons. */

/*
 * Lists and kanbans embedded in a form (a contact's contacts, quote lines)
 * carry the same classes as real views: page-level selectors exclude them.
 */
const NOT_EMBEDDED = ":not(.o_field_x2many *)";
/** The record's name: an input or, in some forms (products, contacts), a text area. */
export const NAME_FIELD = `.o_form_view .o_field_widget[name=name]${NOT_EMBEDDED} :is(input, textarea)`;
export const NEW_BUTTON = `.o_control_panel .o_list_button_add, .o_control_panel .o-kanban-button-new`;
export const KANBAN_RECORD = `.o_kanban_record${NOT_EMBEDDED}:not(.o_kanban_ghost):not(.o-kanban-button-new)`;
export const SAVE_BUTTON = ".o_form_view .o_form_button_save";
export const DISCARD_BUTTON = ".o_form_view .o_form_button_cancel";
export const BACK_TO_LIST = ".o_breadcrumb li.o_back_button a";
// rows open on a click in one of their cells
export const LIST_ROW = `.o_list_view .o_data_row${NOT_EMBEDDED} .o_data_cell`;
/** The "⋮" actions menu of a form (its hotkey is stable across versions). */
export const ACTIONS_MENU = ".o_cp_action_menus button[data-hotkey=u]";
export const ACTIONS_MENU_ITEM = ".o_cp_action_menus .o_menu_item, .o-dropdown--menu .o_menu_item";
export const DIALOG_CONFIRM = ".o_dialog .modal-footer .btn-primary";
export const SEARCH_INPUT = ".o_searchview_input";
export const SEARCH_FACET = ".o_searchview_facet";
export const SEARCH_FACET_REMOVE = ".o_searchview_facet .o_facet_remove";
export const FILTERS_TOGGLER = ".o_searchview_dropdown_toggler";
export const FILTER_ITEM = ".o_filter_menu .o_menu_item";
export const AUTOCOMPLETE_OPTION = ".o-autocomplete--dropdown-item";
export const X2MANY_ADD = ".o_field_x2many_list_row_add button";
export const DIALOG = ".o_dialog";

/** Selector of a field's input in the form, e.g. `fieldInput("email")`. */
export const fieldInput = (name, tag = "input") => `.o_form_view .o_field_widget[name=${name}] ${tag}`;
