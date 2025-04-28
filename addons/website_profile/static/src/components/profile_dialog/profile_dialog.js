import {Component, onMounted, useRef, useState} from "@odoo/owl";
import {ConfirmationDialog} from "@web/core/confirmation_dialog/confirmation_dialog";
import {_t} from "@web/core/l10n/translation";
import {loadWysiwygFromTextarea} from "@web_editor/js/frontend/loadWysiwygFromTextarea";
import {user} from "@web/core/user";
// import { Wysiwyg } from "@html_editor/wysiwyg";

export class ProfileDialog extends ConfirmationDialog {
    static template = "website_profile.ProfileDialog";
    // static components = { Wysiwyg };
    static props = {
        ...ConfirmationDialog.props,
    };
    static defaultProps = {
        ...ConfirmationDialog.defaultProps,
        cancel: () => {},
        dismiss: () => {},
        title: _t("Profile"),
        confirmLabel: _t("Update"),
        cancelLabel: _t("Discard"),
    };

    setup() {
        super.setup();
        this.state = useState({
            name: "test98",
            email: "test98@test.com",
        });
        this.form = useRef("form");
        this.description = useRef("description");
        this.csrf_token = odoo.csrf_token;
        onMounted(async () => {
            await loadWysiwygFromTextarea(this, this.description.el, { // TODO: change
                allowCommandImage: user.isInternalUser,
                recordInfo: {
                    context: { uid: 2, website_id: 1, lang: "en_US", user_lang: undefined },
                    res_model: "res.users",
                    res_id: 2,
                },
                value: "<p><b>Test</b></p>",
                resizable: true,
                userGeneratedContent: true,
            });
        });
    }

    async _confirm() {
        this.form.el.submit();
    }
}
