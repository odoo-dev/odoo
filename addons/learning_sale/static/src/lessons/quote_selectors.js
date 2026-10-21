import { AUTOCOMPLETE_OPTION, fieldInput, X2MANY_ADD } from "@learning/lessons/common_selectors";
import { findTarget } from "@learning/core/dom_target";

/** Selectors and conditions shared by the lessons on quotes. */

export const CUSTOMER = ".o_form_view .o_field_widget[name=partner_id]";
export const CUSTOMER_INPUT = fieldInput("partner_id");
export const CUSTOMER_OPTION = `${CUSTOMER} ${AUTOCOMPLETE_OPTION}`;

export const LINES = ".o_form_view .o_field_widget[name=order_line]";
export const ADD_TO_LINES = `${LINES} ${X2MANY_ADD}`;
/** The line being edited: products and sections are typed in its text area. */
export const EDITED_LABEL = `${LINES} .o_selected_row textarea`;
export const EDITED_QUANTITY = `${LINES} .o_selected_row .o_field_widget[name=product_uom_qty] input`;
export const LINE_OPTION = `${LINES} .o_selected_row ${AUTOCOMPLETE_OPTION}`;

const valueOf = (selector) => document.querySelector(selector)?.value || "";

export const lineCount = () => document.querySelectorAll(`${LINES} .o_data_row`).length;

/** Done once `name` was picked in the dropdown (it closed with that value). */
export const picked = (input, option, name) => () =>
    !findTarget({ trigger: option }) && valueOf(input).includes(name);

/** Done once a new, empty line was started. */
export const newLineStarted = (count) => () => lineCount() > count && valueOf(EDITED_LABEL) === "";
