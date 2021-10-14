/** @odoo-module **/

import { Domain } from "@web/core/domain";
import { useService } from "@web/core/utils/hooks";
import { url } from "@web/core/utils/urls";
import { FieldColorPicker, fileTypeMagicWordMap } from "@web/fields/basic_fields";
import { Field } from "@web/fields/field";
import { useFormCompiler } from "@web/views/form/form_compiler";
import { ViewButton } from "@web/views/view_button/view_button";
import { View } from "@web/views/view";
import { sprintf } from "../../core/utils/strings";

const { Component, hooks } = owl;
const { useState, useSubEnv } = hooks;

const { RECORD_COLORS } = FieldColorPicker;

const GLOBAL_CLICK_CANCEL_SELECTORS = [".dropdown", ".oe_kanban_action"];
const isBinSize = (value) => /^\d+(\.\d*)? [^0-9]+$/.test(value);

export class KanbanRenderer extends Component {
    setup() {
        const { arch, cards, className, fields, xmlDoc } = this.props.info;
        this.cards = cards;
        this.className = className;
        this.cardTemplate = useFormCompiler(arch, fields, xmlDoc);
        this.state = useState({
            quickCreate: [],
        });
        this.action = useService("action");
        this.notification = useService("notification");
        this.colors = RECORD_COLORS;
        if (!this.env.model) {
            useSubEnv({ model: this.props.record.model });
        }
    }

    quickCreate(group) {
        const [groupByField] = this.props.record.model.root.groupBy;
        const value = group.groupData[groupByField];
        this.state.quickCreate[group.id] = {
            [groupByField]: Array.isArray(value) ? value[0] : value,
        };
    }

    openRecord(record, mode = "readonly") {
        const resIds = this.props.record.data.map((datapoint) => datapoint.resId);
        this.action.switchView("form", { resId: record.resId, resIds, mode });
    }

    selectColor(record, colorIndex) {
        // TODO
        console.warn("TODO: Update record", record.id, {
            [this.props.info.colorField]: colorIndex,
        });
    }

    triggerAction(record, params) {
        const { type } = params;
        switch (type) {
            case "edit": {
                this.openRecord(record, "edit");
                break;
            }
            case "open": {
                this.openRecord(record);
                break;
            }
            case "delete": {
                // TODO
                console.warn("TODO: Delete record", record.id);
                break;
            }
            case "action":
            case "object": {
                // TODO
                console.warn("TODO: Button clicked for record", record.id, { params });
                break;
            }
            case "set_cover": {
                const { fieldName, widget, autoOpen } = params;
                const field = this.props.record.fields[fieldName];
                if (
                    field.type === "many2one" &&
                    field.relation === "ir.attachment" &&
                    widget === "attachment_image"
                ) {
                    // TODO
                    console.warn("TODO: Update record", record.id, { fieldName, autoOpen });
                } else {
                    const warning = sprintf(
                        this.env._t(
                            `Could not set the cover image: incorrect field ("%s") is provided in the view.`
                        ),
                        fieldName
                    );
                    this.notification.add({ title: warning, type: "danger" });
                }
                break;
            }
            default: {
                this.notification.add(this.env._t("Kanban: no action for type: ") + type, {
                    type: "danger",
                });
            }
        }
    }

    getColumnTitle(group) {
        const { groupData } = group;
        const [groupByField] = this.props.record.groupBy;
        const value = groupData[groupByField];
        return Array.isArray(value) ? value[1] : value;
    }

    onCardClicked(record, ev) {
        if (ev.target.closest(GLOBAL_CLICK_CANCEL_SELECTORS.join(","))) {
            return;
        }
        this.openRecord(record);
    }

    //-------------------------------------------------------------------------
    // KANBAN SPECIAL FUNCTIONS
    //
    // Note: these are snake_cased with not-so-self-explanatory names for the
    // sake of compatibility.
    //-------------------------------------------------------------------------

    /**
     * Returns the image URL of a given record.
     * @param {string} model model name
     * @param {string} field field name
     * @param {number | number[]} idOrIds
     * @param {string} placeholder
     * @returns {string}
     */
    kanban_image(model, field, idOrIds, placeholder) {
        const id = (Array.isArray(idOrIds) ? idOrIds[0] : idOrIds) || null;
        const record = this.record.model.get({ resId: id }) || { data: {} };
        const value = record.data[field];
        if (value && !isBinSize(value)) {
            // Use magic-word technique for detecting image type
            const type = fileTypeMagicWordMap[value[0]];
            return `data:image/${type};base64,${value}`;
        } else if (placeholder && (!model || !field || !id || !value)) {
            // Placeholder if either the model, field, id or value is missing or null.
            return placeholder;
        } else {
            // Else: fetches the image related to the given id.
            return url("/web/image", { model, field, id });
        }
    }

    /**
     * Returns the class name of a record according to its color.
     */
    kanban_color(value) {
        return `oe_kanban_color_${this.kanban_getcolor(value)}`;
    }

    /**
     * Returns the index of a color determined by a given record.
     */
    kanban_getcolor(value) {
        if (typeof value === "number") {
            return Math.round(value) % this.colors.length;
        } else if (typeof value === "string") {
            const charCodeSum = [...value].reduce((acc, _, i) => acc + value.charCodeAt(i), 0);
            return charCodeSum % this.colors.length;
        } else {
            return 0;
        }
    }

    /**
     * Returns the proper translated name of a record color.
     */
    kanban_getcolorname(value) {
        return this.colors[this.kanban_getcolor(value)];
    }

    /**
     * Computes a given domain.
     */
    kanban_compute_domain(domain) {
        return new Domain(domain).compute(this.props.domain);
    }
}

KanbanRenderer.template = "web.KanbanRenderer";
KanbanRenderer.components = { Field, View, ViewButton };
