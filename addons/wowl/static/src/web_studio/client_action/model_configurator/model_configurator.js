odoo.define('web_studio.ModelConfigurator', function (require) {
    "use strict";

    const config = require('web.config');
    const Dialog = require('web.Dialog');
    const { WidgetAdapterMixin, ComponentWrapper} = require('web.OwlCompatibility');


    const { Component, hooks } = owl;
    const { useState } = hooks;

    class ModelConfigurator extends Component {
        constructor(parent, props) {
            super(parent, props);
            this.state = useState({
                /** You might wonder why I defined all these strings here and not in the template.
                 * The reason is that I wanted clear templates that use a single element to render an option,
                 * meaning that the label and helper text had to be defined here in the code.
                */
                options: {
                    use_partner: { label: this.env._t('Contact details'), help: this.env._t('Get contact, phone and email fields on records'), value: false },
                    use_responsible: { label: this.env._t('User assignment'), help: this.env._t('Assign a responsible to each record'), value: false },
                    use_date: { label: this.env._t('Date & Calendar'), help: this.env._t('Assign dates and visualize records in a calendar'), value: false },
                    use_double_dates: { label: this.env._t('Date range & Gantt'), help: this.env._t('Define start/end dates and visualize records in a Gantt chart'), value: false },
                    use_stages: { label: this.env._t('Pipeline stages'), help: this.env._t('Stage and visualize records in a custom pipeline'), value: false },
                    use_tags: { label: this.env._t('Tags'), help: this.env._t('Categorize records with custom tags'), value: false },
                    use_image: { label: this.env._t('Picture'), help: this.env._t('Attach a picture to a record'), value: false },
                    use_notes: { label: this.env._t('Notes'), help: this.env._t('Write additional notes or comments'), value: false },
                    use_value: { label: this.env._t('Monetary value'), help: this.env._t('Set a price or cost on records'), value: false },
                    use_company: { label: this.env._t('Company'), help: this.env._t('Restrict a record to a specific company'), value: false },
                    use_sequence: { label: this.env._t('Custom Sorting'), help: this.env._t('Manually sort records in the list view'), value: true },
                    use_mail: { label: this.env._t('Chatter'), help: this.env._t('Send messages, log notes and schedule activities'), value: true },
                    use_active: { label: this.env._t('Archiving'), help: this.env._t('Archive deprecated records'), value: true },
                },
                saving: false,
            });
            this.multiCompany = this.env.session.display_switch_company_menu;
        }

        /**
         * Handle the confirmation of the dialog, just fires an event
         * to whomever instaciated it.
         *
         * @private
         */
        _onConfirm() {
            this.trigger('confirm-options', Object.assign({}, this.state.options));
            this.state.saving = true;
        }

        /**
         * Handle the 'back button'' of the dialog, just fires an event
         * to whomever instaciated it.
         *
         * @private
         */
        _onPrevious() {
            this.trigger('previous');
        }
    }

    class ModelConfiguratorOption extends Component {
    };

    ModelConfigurator.template = "web_studio.ModelConfigurator";
    ModelConfigurator.components = { ModelConfiguratorOption };
    ModelConfigurator.props = {
        debug: { type: Boolean, optional: true },
        embed: { type: Boolean, optional: true },
        label: { type: String },
    };

    ModelConfiguratorOption.template = "web_studio.ModelConfiguratorOption";
    ModelConfiguratorOption.props = {
        name: String,
        option: {
            type: Object,
            shape: {
                label: String,
                debug: {
                    type: Boolean,
                    optional: true,
                },
                help: String,
                value: Boolean,
            }
        }
    };


    const _t = require('web.core')._t;
    /**
     * Wrapper to make the ModelConfigurator usable as a standalone dialog. Used notably
     * by the 'NewMenuDialog' in Studio. Note that since the ModelConfigurator does not
     * have its own modal, I choose to use the classic Dialog and use it as an adapter
     * instead of using an owlDialog + another adapter on top of it. Don't @ me.
     *
     * I've taken a few liberties with the standard Dialog: removed the footer
     * (there's no need for it, the modelconfigurator has its own footer), it's a single
     * size, etc. Nothing crazy.
     */
    const ModelConfiguratorDialog = Dialog.extend(WidgetAdapterMixin, {
        custom_events: Object.assign({}, Dialog.prototype.custom_events, {
            'previous': '_onPrevious',
        }),

        /**
         * @override
         */
        init(parent, options) {
            const res = this._super.apply(this, arguments);
            this.renderFooter = false;
            this.title = _t('Suggested features for your new model'),
            this.confirmLabel = options.confirmLabel;
            this.onForceClose = () => this.trigger_up('cancel_options');
            return res;
        },

        /**
         * Owl Wrapper override, as described in web.OwlCompatibility
         * @override
         */
        async start() {
            const res = await this._super.apply(this, arguments);
            this.component = new ComponentWrapper(this, ModelConfigurator, { label: this.confirmLabel, embed: true, debug: Boolean(config.isDebug()) });
            this.component.mount(this.el);
            return res;
        },

        /**
         * Proper handler calling since Dialog doesn't seem to do it
         * @override
         */
        close() {
            this.on_detach_callback();
            return this._super.apply(this, arguments);
        },

        /**
         * Needed because of the WidgetAdapterMixin
         * @override
         */
        destroy() {
            WidgetAdapterMixin.destroy.call(this);
            return this._super();
        },

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @override
         */
        on_attach_callback() {
            WidgetAdapterMixin.on_attach_callback.call(this);
            return this._super.apply(this, arguments);
        },

        /**
         * @override
         */
        on_detach_callback() {
            WidgetAdapterMixin.on_detach_callback.call(this);
            return this._super.apply(this, arguments);
        },

        /**
         * Handle the 'previous' button, which in this case should close the Dialog.
         * @private
         */
        _onPrevious(ev) {
            this.trigger_up('cancel_options');
            this.close();
        },
    });

    return {
        ModelConfigurator: ModelConfigurator,
        ModelConfiguratorDialog: ModelConfiguratorDialog,
    };

});
