/** @odoo-module **/

import { sortBy } from "../utils/arrays";
import { useModelField } from "./model_field_hook";

import { fuzzyLookup } from "@web/core/utils/search";

const { Component } = owl;

export class ModelFieldSelectorPopover extends Component {
    setup() {
        this.chain = Array.from(this.props.chain);
        this.modelField = useModelField();
        this.fields = {};
        this.fieldKeys = [];
        this.searchValue = "";
        this.fullFieldName = this.fieldNameChain.join(".");
    }
    async willStart() {
        await this.loadFields();
    }

    get currentNode() {
        return this.chain[this.chain.length - 1];
    }
    get currentFieldName() {
        const nodes = this.chain.filter((node) => node.field);
        return nodes.length ? nodes[nodes.length - 1].field.string : "";
    }

    get fieldNameChain() {
        return this.chain.filter((node) => node.field).map((node) => node.field.name);
    }

    async loadFields() {
        this.fields = await this.modelField.loadModelFields(this.currentNode.resModel);
        this.fieldKeys = this.sortedKeys(this.fields);
    }
    sortedKeys(obj) {
        const keys = Object.keys(obj);
        return sortBy(keys, (key) => obj[key].string);
    }
    async update() {
        const fieldNameChain = this.fieldNameChain;
        this.fullFieldName = fieldNameChain.join(".");
        await this.props.update(fieldNameChain);
        await this.loadFields();
        this.render();
    }

    onSearch(ev) {
        this.searchValue = ev.target.value;
        let fieldKeys = this.sortedKeys(this.fields);
        if (this.searchValue) {
            fieldKeys = fuzzyLookup(this.searchValue, fieldKeys, (key) => this.fields[key].string);
        }
        this.fieldKeys = fieldKeys;
        this.render();
    }
    onPreviousBtnClick() {
        this.searchValue = "";
        if (this.chain.length > 1) {
            this.chain.pop();
        }
        this.currentNode.field = null;
        this.update();
    }
    onFieldSelected(field) {
        this.searchValue = "";
        this.currentNode.field = field;
        if (!field.relation) {
            this.trigger("popover-closed");
        } else {
            this.chain.push({
                resModel: field.relation,
                field: null,
            });
        }
        this.update();
    }
    async onFieldNameChange(ev) {
        this.fullFieldName = ev.target.value.replace(/\s+/g, "");
        try {
            this.chain = await this.props.loadChain(this.fullFieldName);
            this.update();
        } catch (error) {
            this.chain = [{ resModel: this.props.chain[0], field: null }];
            await this.props.update([]);
            this.render();
        }
    }
}
ModelFieldSelectorPopover.template = "web.ModelFieldSelectorPopover";
