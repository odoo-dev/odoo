/** @odoo-module **/

import { registry } from "@web/core/registry";
import { _lt } from "@web/core/l10n/translation";
import { standardFieldProps } from "./standard_field_props";

import { CheckBox } from "@web/core/checkbox/checkbox";
import { ColorList } from "@web/core/colorlist/colorlist";
import { TagsList } from "@web/core/tags/tags_list";
import { AutoComplete } from "@web/core/autocomplete/autocomplete";
import { Domain } from "@web/core/domain";
import { useService } from "@web/core/utils/hooks";
import { sprintf } from "@web/core/utils/strings";
import { usePopover } from "@web/core/popover/popover_hook";

import { useX2ManyCrud, useActiveActions } from "@web/fields/x2many_utils";
import { useSelectCreate, useOpenMany2XRecord } from "./relational_utils";
import { makeContext } from "@web/core/context";

const { Component, useState, useEffect } = owl;

class Many2ManyTagsFieldColorListPopover extends Component {}
Many2ManyTagsFieldColorListPopover.template = "web.Many2ManyTagsFieldColorListPopover";
Many2ManyTagsFieldColorListPopover.components = {
    CheckBox,
    ColorList,
};

function useForceCloseAutocomplete(onShouldClose = () => {}) {
    let forceCloseAutocomplete = false;
    owl.onWillUpdateProps(() => {
        onShouldClose();
        forceCloseAutocomplete = true;
    });

    useEffect(() => {
        forceCloseAutocomplete = false;
    });

    return () => forceCloseAutocomplete;
}

export class Many2ManyTagsField extends Component {
    setup() {
        this.state = useState({
            autocompleteValue: "",
        });
        this.orm = useService("orm");
        this.previousColorsMap = {};
        this.popover = usePopover();
        this.dialog = useService("dialog");
        this.dialogClose = [];

        this.x2ManyCrud = useX2ManyCrud(() => this.props.value, true);

        const activeField = this.props.record.activeFields[this.props.name];

        this.activeActions = useActiveActions({
            isMany2Many: true,
            crudOptions: {
                create: this.props.canQuickCreate && activeField.options.create,
                onDelete: this.x2ManyCrud.remove,
            },
            getEvalParams: () => {
                return {
                    evalContext: this.props.record.evalContext,
                    readonly: this.props.readonly,
                };
            },
        });

        const resModel = this.props.relation;

        const onRecordSaved = async (record) => {
            const list = this.props.value;
            const currentIds = list.currentIds;
            return list.replaceWith([...currentIds, record.resId]);
        };

        this.openMany2X = useOpenMany2XRecord({
            resModel,
            onRecordSaved,
            activeField,
            activeActions: this.activeActions,
            isToMany: true,
        });
        const onCreateEdit = () => {
            const context = this.props.record.getFieldContext(this.props.name);
            return this.openMany2X({ context });
        };

        const onSelected = (resIds) => {
            return this.x2ManyCrud.saveToList(resIds);
        };

        this.selectCreate = useSelectCreate({
            resModel,
            activeActions: this.activeActions,
            onCreateEdit,
            onSelected,
        });

        // this.x2Many = useX2ManyInteractions({
        //     activeField,
        //     editable: false,
        //     x2ManyCrud: this.x2ManyCrud,
        // });

        this.forceCloseAutocomplete = useForceCloseAutocomplete(() => {
            this.state.autocompleteValue = "";
        });
    }
    get tags() {
        return this.props.value.records.map((record) => ({
            id: record.id, // datapoint_X
            text: record.data.display_name,
            colorIndex: record.data[this.props.colorField],
            onClick: (ev) => this.onBadgeClick(ev, record),
            onDelete: !this.props.readonly ? () => this.onDelete(record.id) : undefined,
        }));
    }
    get canOpenColorDropdown() {
        return this.handlesColor() && this.props.canEditColor;
    }
    get showM2OSelectionField() {
        return !this.props.readonly;
    }
    handlesColor() {
        return this.props.colorField !== undefined && this.props.colorField !== null;
    }
    switchTagColor(colorIndex, tag) {
        const tagRecord = this.props.value.records.find((record) => record.id === tag.id);
        tagRecord.update({ [this.props.colorField]: colorIndex });
        tagRecord.save();
        this.closePopover();
    }
    onTagVisibilityChange(isHidden, tag) {
        const tagRecord = this.props.value.records.find((record) => record.id === tag.id);
        if (tagRecord.data[this.props.colorField] != 0) {
            this.previousColorsMap[tagRecord.resId] = tagRecord.data[this.props.colorField];
        }
        tagRecord.update({
            [this.props.colorField]: isHidden ? 0 : this.previousColorsMap[tagRecord.resId] || 1,
        });
        tagRecord.save();
        this.closePopover();
    }

    closePopover() {
        this.popoverCloseFn();
        this.popoverCloseFn = null;
    }

    get sources() {
        return [this.tagsSource];
    }
    get tagsSource() {
        return {
            placeholder: this.env._t("Loading..."),
            options: this.loadTagsSource.bind(this),
        };
    }

    getDomain() {
        return Domain.and([
            this.props.domain,
            Domain.not([["id", "in", this.props.value.currentIds]]),
        ]).toList(this.props.context);
    }

    async loadTagsSource(request) {
        const records = await this.orm.call(this.props.relation, "name_search", [], {
            name: request,
            operator: "ilike",
            args: this.getDomain(),
            limit: this.props.searchLimit + 1,
            context: this.props.context,
        });

        const options = records.map((result) => ({
            value: result[0],
            label: result[1],
        }));

        if (
            this.activeActions.canCreate &&
            request.length &&
            !this.tagExist(
                request,
                options.map((o) => o.label)
            )
        ) {
            options.push({
                label: sprintf(this.env._t(`Create "%s"`), request), // LPE FIXME: escape make spaces look like %20;
                classList: "o_m2o_dropdown_option o_m2o_dropdown_option_create",
                action: async () => {
                    let created;
                    try {
                        created = await this.orm.call(
                            this.props.relation,
                            "name_create",
                            [request],
                            {
                                context: this.props.context,
                            }
                        );
                    } catch {
                        const context = makeContext([
                            this.props.context,
                            { [`default_${this.props.nameCreateField}`]: request },
                        ]);
                        return this.openMany2X({ context });
                    }
                    const ids = [...this.props.value.currentIds, created[0]];
                    this.props.value.replaceWith(ids);
                },
                unselectable: true,
            });
        }

        if (this.props.searchLimit < records.length) {
            options.push({
                label: this.env._t("Search More..."),
                action: this.onSearchMore.bind(this, request),
                classList: "o_m2o_dropdown_option o_m2o_dropdown_option_search_more",
                unselectable: true,
            });
        }

        if (!request.length && this.props.canQuickCreate) {
            options.push({
                label: this.env._t("Start typing..."),
                classList: "o_m2o_start_typing",
                unselectable: true,
            });
        }

        if (request.length && this.activeActions.canCreate) {
            const context = makeContext([{ default_name: request }]);
            options.push({
                label: this.env._t("Create and edit..."),
                classList: "o_m2o_dropdown_option",
                unselectable: true,
                action: () => this.openMany2X({ context }),
            });
        }

        if (!records.length && !this.activeActions.canCreate) {
            options.push({
                label: this.env._t("No records"),
                classList: "o_m2o_no_result",
                unselectable: true,
            });
        }

        return options;
    }

    tagExist(name, additionalTagNames) {
        return [
            ...this.props.value.records.map((r) => r.data.display_name),
            ...additionalTagNames,
        ].some((n) => n === name);
    }

    onInput({ inputValue }) {
        this.state.autocompleteValue = inputValue;
    }

    onSelect(option) {
        this.state.autocompleteValue = "";
        const ids = [...this.props.value.currentIds, option.value];
        this.props.value.replaceWith(ids);
    }

    onDelete(id) {
        const tagRecord = this.props.value.records.find((record) => record.id === id);
        const ids = this.props.value.currentIds.filter((id) => id !== tagRecord.resId);
        this.props.value.replaceWith(ids);
    }

    onBadgeClick(ev, record) {
        if (!this.canOpenColorDropdown) return;
        const isClosed = !document.querySelector(".o_tag_popover");
        if (isClosed) {
            this.currentPopoverEl = null;
        }
        if (this.popoverCloseFn) {
            this.closePopover();
        }
        if (isClosed || this.currentPopoverEl !== ev.currentTarget) {
            this.currentPopoverEl = ev.currentTarget;
            this.popoverCloseFn = this.popover.add(
                ev.currentTarget,
                this.constructor.components.Popover,
                {
                    colors: this.constructor.RECORD_COLORS,
                    tag: {
                        id: record.id,
                        colorIndex: record.data[this.props.colorField],
                    },
                    switchTagColor: this.switchTagColor.bind(this),
                    onTagVisibilityChange: this.onTagVisibilityChange.bind(this),
                }
            );
        }
    }

    async onSearchMore(request) {
        const domain = this.getDomain();
        const context = this.props.record.getFieldContext(this.props.name);

        let dynamicFilters = [];
        if (request.length) {
            const nameGets = await this.orm.call(this.props.relation, "name_search", [], {
                name: request,
                args: domain,
                operator: "ilike",
                limit: this.constructor.SEARCH_MORE_LIMIT,
                context,
            });

            dynamicFilters = [
                {
                    description: sprintf(this.env._t("Quick search: %s"), request),
                    domain: [["id", "in", nameGets.map((nameGet) => nameGet[0])]],
                },
            ];
        }

        const title = sprintf(
            this.env._t("Search: %s"),
            this.props.record.activeFields[this.props.name].string
        );
        this.selectCreate({
            domain,
            context,
            filters: dynamicFilters,
            title,
        });
    }
}

Many2ManyTagsField.RECORD_COLORS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
Many2ManyTagsField.SEARCH_MORE_LIMIT = 320;

Many2ManyTagsField.template = "web.Many2ManyTagsField";
Many2ManyTagsField.components = {
    AutoComplete,
    Popover: Many2ManyTagsFieldColorListPopover,
    TagsList,
};

Many2ManyTagsField.props = {
    ...standardFieldProps,
    canEditColor: { type: Boolean, optional: true },
    canQuickCreate: { type: Boolean, optional: true },
    colorField: { type: String, optional: true },
    placeholder: { type: String, optional: true },
    relation: { type: String },
    domain: { type: Domain },
    context: { type: Object },
    searchLimit: { type: Number, optional: true },
    nameCreateField: { type: String, optional: true },
};
Many2ManyTagsField.defaultProps = {
    canEditColor: true,
    canQuickCreate: true,
    searchLimit: 7,
    nameCreateField: "name",
};

Many2ManyTagsField.displayName = _lt("Tags");
Many2ManyTagsField.supportedTypes = ["many2many"];
Many2ManyTagsField.fieldsToFetch = {
    display_name: { name: "display_name", type: "char" },
};

Many2ManyTagsField.extractProps = (fieldName, record, attrs) => {
    return {
        colorField: attrs.options.color_field,
        nameCreateField: attrs.options.create_name_field,
        canEditColor:
            !attrs.options.no_edit_color && record.activeFields[fieldName].viewType !== "list",
        relation: record.activeFields[fieldName].relation,
        domain: record.getFieldDomain(fieldName),
        context: record.getFieldContext(fieldName),
        canQuickCreate: !attrs.options.no_quick_create,
    };
};

registry.category("fields").add("many2many_tags", Many2ManyTagsField);
registry.category("fields").add("form.many2many_tags", Many2ManyTagsField);
registry.category("fields").add("list.many2many_tags", Many2ManyTagsField);
