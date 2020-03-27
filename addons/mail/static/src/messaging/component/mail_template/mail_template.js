odoo.define('mail.messaging.component.MailTemplate', function (require) {
'use strict';

const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;
const { useDispatch } = owl.hooks;

class MailTemplate extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.storeDispatch = useDispatch();
        this.storeProps = useStore((state, props) => {
            const mailTemplate = state.mailTemplates[props.mailTemplateLocalId];
            const activity = state.activities[props.activityLocalId];
            return { activity, mailTemplate };
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.messaging.entity.MailTemplate}
     */
    get mailTemplate() {
        return this.storeProps.mailTemplate;
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickPreview(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        this.storeDispatch('previewMailTemplate', this.props.mailTemplateLocalId, this.props.activityLocalId);
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickSend(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        this.storeDispatch('sendMailTemplate', this.props.mailTemplateLocalId, this.props.activityLocalId);
    }
}

Object.assign(MailTemplate, {
    props: {
        activityLocalId: String,
        mailTemplateLocalId: String,
    },
    template: 'mail.messaging.component.MailTemplate',
});

return MailTemplate;

});
