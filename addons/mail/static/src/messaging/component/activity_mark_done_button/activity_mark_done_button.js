odoo.define('mail.component.ActivityMarkDoneButton', function (require) {
'use strict';

const ActivityMarkDonePopover = require('mail.component.ActivityMarkDonePopover');
const PopoverButtonWithComponent = require('mail.component.PopoverButtonWithComponent');

class ActivityMarkDoneButton extends PopoverButtonWithComponent {

    /**
     * @override
     * @param args
     */
    constructor(...args) {
        super(...args);
        this._onDiscardClicked = this._onDiscardClicked.bind(this);
    }

    /**
     * @override
     */
    async mounted() {
        await super.mounted();
        if (this._popoverComponent.el) {
            this._popoverComponent.el.addEventListener('o-discard-clicked', this._onDiscardClicked);
        }
    }

    /**
     * @override
     */
    willUnmount() {
        if (this._popoverComponent.el) {
            this._popoverComponent.el.removeEventListener('o-discard-clicked', this._onDiscardClicked);
        }
        super.willUnmount();
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @returns {ActivityMarkDonePopover}
     */
    _createPopoverComponent() {
        ActivityMarkDonePopover.env = this.env;
        return new ActivityMarkDonePopover(null, {
            activityLocalId: this.props.activityLocalId
        });
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onDiscardClicked(ev) {
        this._hidePopover();
    }
}

ActivityMarkDoneButton.props = Object.assign(
    {},
    PopoverButtonWithComponent.props,
    { activityLocalId: String }
);

return ActivityMarkDoneButton;

});
