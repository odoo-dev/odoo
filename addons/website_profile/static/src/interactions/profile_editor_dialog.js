import {Interaction} from "@web/public/interaction";
import {_t} from "@web/core/l10n/translation";
import {registry} from "@web/core/registry";
import {ProfileDialog} from "../components/profile_dialog/profile_dialog";

export class ProfileEditorDialog extends Interaction {
    static selector = ".o_wprofile_editor_dialog";
    dynamicContent = {
        _root: {
            "t-on-click.prevent": this.openDialog,
        },
    };

    openDialog() {
        this.services.dialog.add(ProfileDialog, {
            title: _t("Test"),
            // body: _t("Test?"),
            // confirmLabel: _t("Test"),
            // confirm: async () => {
            //     window.location.reload();
            // },
            // cancelLabel: _t("Cancel"),
            // cancel: () => {},
        });
    }
}

registry
    .category("public.interactions")
    .add("website_profile.profile_editor_dialog", ProfileEditorDialog);
