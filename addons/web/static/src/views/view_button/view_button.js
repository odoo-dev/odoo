/** @odoo-module */

import { debounce as debounceFn } from "@web/core/utils/timing";

const { Component } = owl;

const explicitRankClasses = [
    "btn-primary",
    "btn-secondary",
    "btn-link",
    "btn-success",
    "btn-info",
    "btn-warning",
    "btn-danger",
];

const odooToBootstrapClasses = {
    oe_highlight: "btn-primary",
    oe_link: "btn-link",
};

function iconFromString(iconString) {
    const icon = {};
    if (iconString.startsWith("fa-")) {
        icon.tag = "i";
        icon.class = `fa fa-fw o_button_icon ${iconString}`;
    } else {
        icon.tag = "img";
        icon.src = iconString;
    }
    return icon;
}

export class ViewButton extends Component {
    setup() {
        if (this.props.icon) {
            this.icon = iconFromString(this.props.icon);
        }
        const { debounce } = this.clickParams;
        if (debounce) {
            this.onClick = debounceFn(this.onClick.bind(this), debounce, true);
        }
        this.tooltip = JSON.stringify({
            debug: Boolean(odoo.debug),
            button: {
                string: this.props.string,
                help: this.clickParams.help,
                context: this.clickParams.context,
                modifiers: this.clickParams.modifiers,
                special: this.clickParams.special,
                type: this.clickParams.type,
                name: this.clickParams.name,
                title: this.props.title,
            },
            context: this.props.record && this.props.record.context,
            model: (this.props.record && this.props.record.resModel) || this.props.resModel,
        });
    }

    get clickParams() {
        return { context: this.props.context, ...this.props.clickParams };
    }

    get hasBigTooltip() {
        return Boolean(odoo.debug) || this.clickParams.help;
    }

    get hasSmallToolTip() {
        return !this.hasBigTooltip && this.props.title;
    }

    get disabled() {
        const { name, type, special } = this.clickParams;
        return (!name && !type && !special) || this.props.disabled;
    }

    /**
     * @param {MouseEvent} ev
     */
    onClick(ev) {
        if (this.props.tag === "a") {
            ev.preventDefault();
        }
        this.env.onClickViewButton({
            clickParams: this.clickParams,
            record: this.props.record,
        });
    }

    getClassName() {
        const classNames = [];
        let hasExplicitRank = false;
        for (let cls of this.props.className.split(" ")) {
            if (cls in odooToBootstrapClasses) {
                cls = odooToBootstrapClasses[cls];
            }
            classNames.push(cls);
            if (!hasExplicitRank && explicitRankClasses.includes(cls)) {
                hasExplicitRank = true;
            }
        }
        if (this.props.tag === "button") {
            classNames.push("btn");
            if (!hasExplicitRank) {
                classNames.push(this.props.defaultRank || "btn-secondary");
            }
            if (this.props.size) {
                classNames.push(`btn-${this.props.size}`);
            }
        }
        return classNames.join(" ");
    }
}
ViewButton.template = "views.ViewButton";
ViewButton.props = [
    "tag?",
    "record?",
    "className?",
    "context?",
    "clickParams?",
    "icon?",
    "defaultRank?",
    "disabled?",
    "size?",
    "tabindex?",
    "title?",
    "string?",
    "slots?",
];
ViewButton.defaultProps = {
    tag: "button",
    className: "",
    clickParams: {},
};
