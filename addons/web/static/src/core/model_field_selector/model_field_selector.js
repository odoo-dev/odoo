import { Component, onWillStart, onWillUpdateProps, proxy, t, useProps } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
import { KeepLast } from "@web/core/utils/concurrency";
import { useService } from "@web/core/utils/hooks";
import { ModelFieldSelectorPopover } from "./model_field_selector_popover";

export class ModelFieldSelector extends Component {
    static template = "web._ModelFieldSelector";
    static components = {
        Dropdown,
        Popover: ModelFieldSelectorPopover,
    };
    props = useProps({
        resModel: t.string(),
        path: t.any().optional(),
        allowEmpty: t.boolean().optional(false),
        readonly: t.boolean().optional(true),
        readProperty: t.boolean().optional(),
        showSearchInput: t.boolean().optional(true),
        isDebugMode: t.boolean().optional(false),
        update: t.function().optional(() => () => {}),
        filter: t.function().optional(),
        sort: t.function().optional(),
        followRelation: t.or([t.boolean(), t.function()]).optional(true),
        showDebugInput: t.boolean().optional(),
    });

    setup() {
        this.fieldService = useService("field");
        this.dropdownState = useDropdownState({
            onClose: async () => {
                const newPath = this.newPath;
                // close can be triggered twice (e.g. escape), only apply the path once
                this.newPath = null;
                if (newPath !== null) {
                    const fieldInfo = await this.fieldService.loadFieldInfo(
                        this.props.resModel,
                        newPath
                    );
                    this.props.update(newPath, fieldInfo);
                }
            },
        });
        this.keepLast = new KeepLast();
        this.state = proxy({ isInvalid: false, displayNames: [] });
        onWillStart(() => this.updateState(this.props));
        onWillUpdateProps((nextProps) => {
            const modelPathKeys = ["resModel", "path", "allowEmpty"];
            if (modelPathKeys.some((key) => this.props[key] !== nextProps[key])) {
                this.updateState(nextProps);
            }
        });
    }

    getPopoverProps() {
        return {
            close: () => this.dropdownState.close(),
            resModel: this.props.resModel,
            path: this.props.path,
            readProperty: this.props.readProperty,
            update: (path, _fieldInfo, debug = false) => {
                this.newPath = path;
                if (!debug) {
                    this.updateState({ ...this.props, path }, true);
                }
            },
            showSearchInput: this.props.showSearchInput,
            isDebugMode: this.props.isDebugMode,
            filter: this.props.filter,
            sort: this.props.sort,
            followRelation: this.props.followRelation,
            showDebugInput: this.props.showDebugInput,
        };
    }

    openPopover(currentTarget) {
        if (this.props.readonly) {
            return;
        }
        if (this.dropdownState.isOpen) {
            this.dropdownState.close();
            return;
        }
        this.newPath = null;
        // computed once, so that re-rendering the selector doesn't update the open popover
        this.popoverProps = this.getPopoverProps();
        this.dropdownState.open();
    }

    async updateState(params, isConcurrent) {
        const { resModel, path, allowEmpty } = params;
        let prom = this.fieldService.loadPathDescription(resModel, path, allowEmpty);
        if (isConcurrent) {
            prom = this.keepLast.add(prom);
        }
        const state = await prom;
        Object.assign(this.state, state);
    }

    clear() {
        if (this.dropdownState.isOpen) {
            this.newPath = "";
            this.dropdownState.close();
            return;
        }
        this.props.update("", { resModel: this.props.resModel, fieldDef: null });
    }
}
