odoo.define('mail.form_renderer', function (require) {
"use strict";

const Chatter = require('mail.component.Chatter');
const FormRenderer = require('web.FormRenderer');

const { EventBus } = owl.core;

/**
 * Include the FormRenderer to instanciate the chatter area containing (a
 * subset of) the mail widgets (mail_thread, mail_followers and mail_activity).
 */
FormRenderer.include({
    async on_attach_callback() {
        this._super(...arguments);
        // Useful when (re)loading view
        if (this._hasChatter()) {
            if (!this._chatterComponent) {
                if (!this._chatterLocalId) {
                    this._chatterLocalId = this.env.store.dispatch('createChatter', {
                        initialThreadId: this.state.res_id,
                        initialThreadModel: this.state.model,
                    });
                }
                this._makeChatterComponent();
            }
            await this._mountChatterComponent();
        }
    },
    on_detach_callback() {
        this._super(...arguments);
        // When the view is detached, we totally delete chatter state from store
        // and chatter component to avoid any problem when view will be
        // reattached
        if (this._chatterComponent) {
            this._destroyChatter();
        }
    },
    /**
     * @override
     */
    init(parent, state, params) {
        this._super(...arguments);
        this.env = this.call('messaging', 'getMessagingEnv');
        this.mailFields = params.mailFields;
        this._chatterBus = new EventBus();
        this._chatterComponent = undefined;
        /**
         * The target of chatter, if chatter has to be appended to the DOM.
         * This is set when arch contains `div.oe_chatter`.
         */
        this._chatterContainerTarget = undefined;
        this._chatterLocalId = undefined;
        // Do not load chatter in form view dialogs
        this._isFromFormViewDialog = params.isFromFormViewDialog;

        this._chatterBus.on('o-chatter-rendered', this, (...args) => {
            this._onChatterUseStoreThreadAndAttachments(...args);
        });
    },
    /**
     * @override
     */
    destroy() {
        this._super(...arguments);
        if (this._hasChatter()) {
            this._destroyChatter();
        }
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Destroy the chatter component
     *
     * @private
     */
    _destroyChatter() {
        if (this._chatterComponent) {
            this._chatterComponent.destroy();
            this._chatterComponent = undefined;
        }
        if (this._chatterLocalId) {
            this.env.store.dispatch('deleteChatter', this._chatterLocalId);
            this._chatterLocalId = undefined;
        }
    },
    /**
     * Determine whether the form renderer has a chatter to display or not.
     * This is based on arch, which should have `div.oe_chatter`.
     *
     * @private
     * @return {boolean}
     */
    _hasChatter() {
        return !!this._chatterContainerTarget;
    },
    /**
     * @private
     */
    _makeChatterComponent() {
        this._chatterComponent = new Chatter(null, {
            chatterLocalId: this._chatterLocalId,
            formRendererBus: this._chatterBus,
        });
    },
    /**
     * Mount the chatter
     *
     * FIXME {xdu} could be better to mount in "replace" mode but the mount is
     * failing with that mode.
     * (just use { position: 'self' } as second parameter of mount)
     *
     * @private
     */
    async _mountChatterComponent() {
        /**
         * Force re-mounting chatter component in DOM. This is necessary
         * because each time `_renderView` is called, it puts old content
         * in a fragment.
         */
        this._chatterComponent.__owl__.isMounted = false;
        await this._chatterComponent.mount(this._chatterContainerTarget);
    },
    /**
     * @override
     * @private
     */
    _renderNode(node) {
        if (!this._isFromFormViewDialog && node.tag === 'div' && node.attrs.class === 'oe_chatter') {
            const $el = $('<div class="o_FormRenderer_chatterContainer"/>');
            this._chatterContainerTarget = $el[0];
            return $el;
        }
        return this._super(...arguments);
    },
    /**
     * Overrides the function to render the chatter once the form view is
     * rendered.
     *
     * @override
     * @private
     */
    async _renderView() {
        await this._super(...arguments);
        if (this._hasChatter()) {
            Chatter.env = this.env;
            if (!this._chatterLocalId) {
                this._chatterLocalId = this.env.store.dispatch('createChatter', {
                    initialThreadId: this.state.res_id,
                    initialThreadModel: this.state.model,
                });
            } else {
                this.env.store.dispatch('updateChatter', this._chatterLocalId, {
                    threadId: this.state.res_id,
                    threadModel: this.state.model
                });
            }
            if (!this._chatterComponent) {
                this._makeChatterComponent();
            }
            await this._mountChatterComponent();
        }
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @abstract
     * @private
     * @param {...any} args
     */
    _onChatterUseStoreThreadAndAttachments(...args) {},
});

});
