
import { Interaction } from "@web/public/interaction";
import { isEmail } from "@web/core/utils/strings";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";

import { loadWysiwygFromTextarea } from "@web_editor/js/frontend/loadWysiwygFromTextarea";

export class ProfileEditor extends Interaction {
    static selector = ".o_wprofile_editor_form";
    dynamicContent = {
        ".o_forum_file_upload": { "t-on-change": this.onFileChange },
        ".o_forum_profile_pic_edit": { "t-on-click.prevent": this.onEditProfilePicClick },
        ".o_forum_profile_pic_clear": { "t-on-click": this.onClearProfilePicClick },
        ".o_forum_profile_bio_edit": {
            "t-on-click.prevent": () => this.isEditingBio = true,
            "t-att-class": () => ({ "d-none": this.isEditingBio }),
        },
        ".o_forum_profile_bio_cancel_edit": {
            "t-on-click.prevent": () => this.isEditingBio = false,
            "t-att-class": () => ({ "d-none": !this.isEditingBio }),
        },
        ".o_forum_profile_bio_form": { "t-att-class": () => ({ "d-none": !this.isEditingBio }) },
        ".o_forum_profile_bio": { "t-att-class": () => ({ "d-none": this.isEditingBio, }) },
        "form.o_wprofile_editor_form #user_email": {
            "t-on-change": () => this.validateInputs(),
        },
        'form.o_wprofile_editor_form button[type="submit"]': {
            "t-on-click": (ev) => this.onSubmit(ev),
        },
    };

    setup() {
        this.isEditingBio = false;

        this.textareaEl = this.el.querySelector("textarea.o_wysiwyg_loader");

        this.options = {
            allowCommandImage: user.isInternalUser,
            recordInfo: {
                context: this.services.website_page.context,
                res_model: "res.users",
                res_id: parseInt(this.el.querySelector("input[name=user_id]").value),
            },
            value: this.textareaEl.getAttribute("content"),
            resizable: true,
            userGeneratedContent: true,
        };
        console.log('this.services.website_page.context', this.services.website_page.context);

        if (this.textareaEl.attributes.placeholder) {
            this.options.placeholder = this.textareaEl.attributes.placeholder.value;
        }

        this.fileUploadEl = this.el.querySelector(".o_forum_file_upload");
        this.avatarImgEl = this.el.querySelector(".o_wforum_avatar_img");
    }

    async willStart() {
        await loadWysiwygFromTextarea(this, this.textareaEl, this.options);
    }

    onEditProfilePicClick() {
        this.fileUploadEl.click();
    }

    onClearProfilePicClick() {
        this.fileUploadEl.value = null;
        this.avatarImgEl.src = "/web/static/img/placeholder.png";
        const inputElement = document.createElement("input");
        inputElement.setAttribute("name", "clear_image");
        inputElement.setAttribute("id", "forum_clear_image");
        inputElement.setAttribute("type", "hidden");
        this.insert(inputElement);
    }

    onFileChange() {
        if (!this.fileUploadEl.files.length) {
            return;
        }
        const reader = new window.FileReader();
        reader.readAsDataURL(this.fileUploadEl.files[0]);
        this.addListener(reader, "load", (ev) => this.avatarImgEl.src = ev.target.result);
        this.el.querySelector("#forum_clear_image")?.remove();
    }

    onSubmit(ev) {
        if (!this.validateInputs()) {
            ev.preventDefault();
        }
    }

    validateInputs() {
        let isValid = true;
        const email = this.el.querySelector("#user_email").value;
        const userEmailErrorEl = this.el.querySelector("#user_email_error");
        if (!isEmail(email)) {
            isValid = false;
            userEmailErrorEl.classList.remove("d-none");
        } else {
            userEmailErrorEl.classList.add("d-none");
        }
        this.el.querySelector("button.o_wprofile_submit_btn").disabled = !isValid;
        return isValid;
    }
}

registry
    .category("public.interactions")
    .add("website_profile.profile_editor", ProfileEditor);
