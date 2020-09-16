/** @odoo-module alias=mail.components.ComposerSuggestion **/

import useUpdate from 'mail.componentHooks.useUpdate';
import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;

class ComposerSuggestion extends usingModels(Component) {

    constructor(...args) {
        super(...args);
        useUpdate({ func: () => this._update() });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {boolean}
     */
    get isCannedResponse() {
        return this.modelName === 'CannedResponse';
    }

    /**
     * @returns {boolean}
     */
    get isChannel() {
        return this.modelName === 'Thread';
    }

    /**
     * @returns {boolean}
     */
    get isCommand() {
        return this.modelName === 'ChannelCommand';
    }

    /**
     * @returns {boolean}
     */
    get isPartner() {
        return this.modelName === 'Partner';
    }

    /**
     * Returns a descriptive title for this suggestion. Useful to be able to
     * read both parts when they are overflowing the UI.
     *
     * @returns {string}
     */
    title() {
        if (this.isCannedResponse) {
            return _.str.sprintf(
                "%s: %s",
                this.record.source(this),
                this.record.substitution(this),
            );
        }
        if (this.isChannel) {
            return this.record.name(this);
        }
        if (this.isCommand) {
            return _.str.sprintf(
                "%s: %s",
                this.record.name(this),
                this.record.help(this),
            );
        }
        if (this.isPartner) {
            if (this.record.email(this)) {
                return _.str.sprintf(
                    "%s (%s)",
                    this.record.nameOrDisplayName(this),
                    this.record.email(this),
                );
            }
            return this.record.nameOrDisplayName(this);
        }
        return "";
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _update() {
        if (
            this.composer &&
            this.composer.hasToScrollToActiveSuggestion(this) &&
            this.isActive
        ) {
            this.el.scrollIntoView({
                block: 'center',
            });
            this.env.services.action.dispatch(
                'Record/update',
                this.composer,
                { hasToScrollToActiveSuggestion: false },
            );
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onClick(ev) {
        ev.preventDefault();
        this.env.services.action.dispatch(
            'Record/update',
            this.composer,
            {
                [this.composer.activeSuggestedRecordName(this)]:
                    this.env.services.action.dispatch(
                        'RecordFieldCommand/link',
                        this.record,
                    ),
            },
        );
        this.env.services.action.dispatch(
            'Composer/insertSuggestion',
            this.composer,
        );
        this.env.services.action.dispatch(
            'Composer/closeSuggestions',
            this.composer,
        );
        this.trigger('o-composer-suggestion-clicked');
    }

}

Object.assign(ComposerSuggestion, {
    defaultProps: {
        isActive: false,
    },
    props: {
        composer: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Composer') {
                    return false;
                }
                return true;
            },
        },
        isActive: Boolean,
        modelName: String,
        record: {
            type: Object,
            validate(p) {
                if (!p.constructor.modelName) {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.ComposerSuggestion',
});

QWeb.registerComponent('ComposerSuggestion', ComposerSuggestion);

export default ComposerSuggestion;
