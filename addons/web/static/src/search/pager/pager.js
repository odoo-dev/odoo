/** @odoo-module **/

import { useAutofocus } from "@web/core/utils/hooks";

const { Component } = owl;
const { useState } = owl.hooks;

/**
 * Pager
 *
 * The pager goes from 1 to size (included).
 * The current value is currentMinimum if limit === 1 or the interval:
 *      [currentMinimum, currentMinimum + limit[ if limit > 1].
 * The value can be manually changed by clicking on the pager value and giving
 * an input matching the pattern: min[,max] (in which the comma can be a dash
 * or a semicolon).
 * The pager also provides two buttons to quickly change the current page (next
 * or previous).
 * @extends Component
 */
export class Pager extends Component {
    setup() {
        this.state = useState({
            isEditing: false,
            isDisabled: false,
        });

        useAutofocus();
    }
    async willUpdateProps() {
        Object.assign(this.state, {
            isEditing: false,
            isDisabled: false,
        });
    }

    /**
     * @returns {number}
     */
    get minimum() {
        return this.props.offset + 1;
    }
    /**
     * @returns {number}
     */
    get maximum() {
        return Math.min(this.props.offset + this.props.limit, this.props.size);
    }
    /**
     * @returns {string}
     */
    get value() {
        const parts = [this.minimum];
        if (this.props.limit > 1) {
            parts.push(this.maximum);
        }
        return parts.join("-");
    }
    /**
     * @returns {boolean} true iff there is only one page
     */
    get isSinglePage() {
        return this.minimum === 1 && this.maximum === this.props.size;
    }

    /**
     * @param {-1 | 1} direction
     */
    navigate(direction) {
        const { offset, limit, size } = this.props;

        let minimum = offset + limit * direction;
        if (minimum >= size) {
            minimum = 0;
        } else if (minimum < 0 && limit === 1) {
            minimum = size - 1;
        } else if (minimum < 0 && limit > 1) {
            minimum = size - (size % limit || limit);
        }

        this.update(minimum, this.props.limit);
    }
    /**
     * @param {string} value
     * @returns {{ minimum: number, maximum: number }}
     */
    parse(value) {
        let [minimum, maximum] = value.trim().split(/\s*[\-\s,;]\s*/);
        const clamp = (value) => Math.min(Math.max(value, 1), this.props.size);
        return {
            minimum: clamp(parseInt(minimum, 10)) - 1,
            maximum: clamp(maximum ? parseInt(maximum, 10) : minimum),
        };
    }
    /**
     * @param {string} value
     */
    setValue(value) {
        const { minimum, maximum } = this.parse(value);

        if (!isNaN(minimum) && !isNaN(maximum) && minimum < maximum) {
            this.update(minimum, maximum - minimum);
        }
    }
    /**
     * @param {number} offset
     * @param {number} limit
     */
    update(offset, limit) {
        if (offset !== this.props.offset || limit !== this.props.limit) {
            this.state.isDisabled = true;
        } else {
            // In this case we want to trigger an update, but since it will
            // not re-render the pager (current props === next props) we
            // have to disable the edition manually here.
            this.state.isEditing = false;
        }
        this.props.onUpdate({ offset, limit });
    }

    onInputBlur() {
        this.state.isEditing = false;
    }
    /**
     * @param {Event} ev
     */
    onInputChange(ev) {
        this.setValue(ev.target.value);
        if (!this.state.isDisabled) {
            ev.preventDefault();
        }
    }
    /**
     * @param {KeyboardEvent} ev
     */
    onInputKeydown(ev) {
        switch (ev.key) {
            case "Enter":
                ev.preventDefault();
                ev.stopPropagation();
                this.setValue(ev.currentTarget.value);
                break;
            case "Escape":
                ev.preventDefault();
                ev.stopPropagation();
                this.state.isEditing = false;
                break;
        }
    }
    onPreviousPageClick() {
        this.navigate(-1);
    }
    onNextPageClick() {
        this.navigate(1);
    }
    onValueClick() {
        if (this.props.isEditable && !this.state.isEditing && !this.state.isDisabled) {
            this.state.isEditing = true;
        }
    }
}
Pager.template = "web.Pager";

Pager.defaultProps = {
    isEditable: true,
    withAccessKey: true,
    onUpdate: async () => {},
};
Pager.props = {
    offset: Number,
    limit: Number,
    size: Number,
    isEditable: Boolean,
    withAccessKey: Boolean,
    onUpdate: Function,
};
