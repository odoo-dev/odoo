/** @odoo-module **/

import { useService } from "@web/core/service_hook";
import { Field } from "@web/fields/field";
import { FormCompiler } from "@web/views/form/form_compiler";
import { Domain } from "@web/core/domain";
import { FieldColorPicker } from "../../fields/basic_fields";
import { fileTypeMagicWordMap } from "../../fields/basic_fields";
import { url } from "../../core/utils/urls";

const { Component } = owl;
const { useState, useSubEnv } = owl.hooks;

const { RECORD_COLORS } = FieldColorPicker;

const templateIds = {};
let nextKanbanCardId = 1;

const isBinSize = (value) => /^\d+(\.\d*)? [^0-9]+$/.test(value);

export class KanbanRenderer extends Component {
    setup() {
        let templateId = templateIds[this.props.info.arch];
        if (!templateId) {
            const formCompiler = new FormCompiler(
                this.env.qweb,
                this.props.info.fields
            );
            const xmldoc = formCompiler.compile(this.props.info.xmlDoc);
            console.group("Compiled template:");
            console.dirxml(xmldoc);
            console.groupEnd();
            templateId = `__kanban_card__${nextKanbanCardId++}`;
            this.env.qweb.addTemplate(templateId, xmldoc.outerHTML);
            templateIds[this.props.info.arch] = templateId;
        }
        this.cardTemplate = templateId;
        this.cards = this.props.info.cards;
        this.className = this.props.info.className;
        this.state = useState({});
        this.action = useService("action");
        useSubEnv({ model: this.props.model });

        console.log(this.props.model.root.data);
    }

    // TODO
    isGrouped() {
        return false;
    }

    openRecord(record) {
        const resIds = this.props.model.root.data.map(
            (datapoint) => datapoint.resId
        );
        this.action.switchView("form", { resId: record.resId, resIds });
    }

    evalDomain(domain) {
        domain = new Domain(domain);
        return domain.contains(this.record.data);
    }

    isFieldEmpty(fieldName, widgetName) {
        const cls = Field.getTangibleField(this.record, widgetName, fieldName);
        if ("isEmpty" in cls) {
            return cls.isEmpty(this.record, fieldName);
        }
        return !this.record.data[fieldName];
    }

    getWidget(widgetName) {
        class toImplement extends Component {}
        toImplement.template = owl.tags.xml`<div>${widgetName}</div>`;
        return toImplement;
    }

    //-------------------------------------------------------------------------
    // KANBAN SPECIAL FUNCTIONS
    //
    // Note: these are snake_cased with a not-so-self-explanatory name for the
    // sake of compatibility.
    //-------------------------------------------------------------------------

    /**
     * Returns the image URL of a given record.
     * @param {string} model model name
     * @param {string} field field name
     * @param {number | number[]} id
     * @param {string} placeholder
     * @returns {string}
     */
    kanban_image(model, field, id, placeholder) {
        id = (Array.isArray(id) ? id[0] : id) || null;
        const record = this.props.model.db[id] || { data: {} };
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
            return Math.round(value) % RECORD_COLORS.length;
        } else if (typeof value === "string") {
            const charCodeSum = [...value].reduce(
                (acc, _, i) => acc + value.charCodeAt(i),
                0
            );
            return charCodeSum % RECORD_COLORS.length;
        } else {
            return 0;
        }
    }

    /**
     * Returns the proper translated name of a record color.
     */
    kanban_getcolorname(value) {
        return KANBAN_RECORD_COLORS[this.kanban_getcolor(value)];
    }

    /**
     * Computes a given domain.
     */
    kanban_compute_domain(domain) {
        return new Domain(domain).compute(this.props.domain);
    }
}

KanbanRenderer.template = "web.KanbanRenderer";
KanbanRenderer.components = { Field };
