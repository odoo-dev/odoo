import { CallDropdown } from "@mail/discuss/call/common/call_dropdown";
import { attClassObjectToString } from "@mail/utils/common/format";
import { useRef } from "@web/owl2/utils";
import { Component, onMounted, onPatched, onWillUnmount } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";

import { useService } from "@web/core/utils/hooks";

const actionListProps = [
    "inline?",
    "dropdown?",
    "fw?",
    "hasBtnBg?",
    "odooControlPanelSwitchStyle?",
];

class Action extends Component {
    static props = [
        "action",
        "group?",
        "isFirstInGroup?",
        "isLastInGroup?",
        "onButtonRef?",
        "style?",
        ...actionListProps,
    ];
    static defaultProps = { fw: true };
    static components = { Action, DropdownItem };
    static template = "mail.Action";

    get ActionList() {
        return ActionList;
    }

    get Dropdown() {
        if (this.env.inDiscussCallView?.isPip) {
            return CallDropdown;
        }
        return Dropdown;
    }

    setup() {
        super.setup();
        this.store = useService("mail.store");
        this.ui = useService("ui");
        this.attClassObjectToString = attClassObjectToString;
        this.buttonRef = useRef("button");
        if (this.props.action.definition?.isMoreAction) {
            onWillUnmount(() => {
                this.props.action.dropdownState.close();
            });
        }
        onMounted(() => this.notifyButtonRef());
        onPatched(() => this.notifyButtonRef());
        onWillUnmount(() => this.props.onButtonRef?.(this.props.action.id, null));
    }

    get action() {
        return this.props.action;
    }

    get hasBtnBg() {
        return (
            this.props.odooControlPanelSwitchStyle ||
            this.props.hasBtnBg ||
            this.props.action.hasBtnBg
        );
    }

    onSelected(action, ev) {
        action.onSelected?.(ev);
        this.env.inCallDropdown?.close();
    }

    notifyButtonRef() {
        this.props.onButtonRef?.(this.props.action.id, this.buttonRef.el);
    }
}

export class ActionList extends Component {
    static components = { Action };
    static props = ["actions", "groupClass?", "onButtonRef?", ...actionListProps];
    static template = "mail.ActionList";

    getActionProps(action, group, { index, isFirstInGroup, isLastInGroup } = {}) {
        return {
            action,
            group,
            isFirstInGroup,
            isLastInGroup,
            ...Object.fromEntries(
                actionListProps.map((propName) => {
                    const actualPropName = propName.endsWith("?")
                        ? propName.substring(0, propName.length - 1)
                        : propName;
                    return [actualPropName, this.props[actualPropName]];
                })
            ),
            onButtonRef: this.props.onButtonRef,
            style: `z-index: ${group.length - index + (action.hotkey ? 1 : 0)}`,
        };
    }

    setup() {
        super.setup();
        this.store = useService("mail.store");
        this.ui = useService("ui");
        this.actionListProps = actionListProps;
    }

    get groups() {
        let groups;
        if (this.props.actions.find((i) => Array.isArray(i))) {
            groups = this.props.actions;
        } else {
            groups = [this.props.actions];
        }
        return groups.filter((group) => group.length); // don't show empty groups
    }

    get hasBtnBg() {
        return this.props.odooControlPanelSwitchStyle || this.props.hasBtnBg;
    }
}
