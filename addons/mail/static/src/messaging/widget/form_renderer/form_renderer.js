odoo.define('mail.messaging.widget.FormRenderer', function (require) {
"use strict";

const components = {
    Chatter: require('mail.messaging.component.Chatter'),
};

const FormRenderer = require('web.FormRenderer');

const { EventBus } = owl.core;

/**
 * Include the FormRenderer to instantiate the chatter area containing (a
 * subset of) the mail widgets (mail_thread, mail_followers and mail_activity).
 */
FormRenderer.include({
    /**
     * @override
     */
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
    /**
     * @override
     */
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
        this.env = this.call('messaging', 'getEnv');
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
     * Returns whether the form renderer has a chatter to display or not.
     * This is based on arch, which should have `div.oe_chatter`.
     *
     * @private
     * @returns {boolean}
     */
    _hasChatter() {
        return !!this._chatterContainerTarget;
    },
    /**
     * Returns whether the chatter of the form renderer should display
     * activities.
     *
     * @private
     * @returns {boolean}
     */
    _hasChatterActivities() {
        return !!this.mailFields.mail_activity;
    },
    /**
     * Returns whether the chatter of the form renderer should display
     * followers.
     *
     * @private
     * @returns {boolean}
     */
    _hasChatterFollowers() {
        return !!this.mailFields.mail_followers;
    },
    /**
     * Determine whether the chatter of the form renderer should display thread.
     *
     * @private
     * @returns {boolean}
     */
    _hasChatterThread() {
        return !!this.mailFields.mail_thread;
    },
    /**
     * @private
     */
    _makeChatterComponent() {
        const ChatterComponent = components.Chatter;
        this._chatterComponent = new ChatterComponent(null, {
            chatterLocalId: this._chatterLocalId,
            formRendererBus: this._chatterBus,
        });
    },
    /**
     * Mount the chatter
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
     */
    _renderNode(node) {
        if (
            !this._isFromFormViewDialog &&
            node.tag === 'div' &&
            node.attrs.class === 'oe_chatter'
        ) {
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
     */
    async _renderView() {
        await this._super(...arguments);
        if (this._hasChatter()) {
            const ChatterComponent = components.Chatter;
            ChatterComponent.env = this.env;
            const context = this.record ? this.record.getContext() : {};
            const activityIds = this.state.data.activity_ids
                ? this.state.data.activity_ids.res_ids
                : [];
            const hasActivities = this._hasChatterActivities();
            const hasFollowers = this._hasChatterFollowers();
            const hasThread = this._hasChatterThread();
            if (!this._chatterLocalId) {
                this._chatterLocalId = this.env.store.dispatch('createChatter', {
                    activityIds,
                    context,
                    hasActivities,
                    hasFollowers,
                    hasThread,
                    initialThreadId: this.state.res_id,
                    initialThreadModel: this.state.model,
                });
            } else {
                this.env.store.dispatch('updateChatter', this._chatterLocalId, {
                    activityIds,
                    context,
                    hasActivities,
                    hasFollowers,
                    hasThread,
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
