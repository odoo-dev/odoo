
import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { loadWysiwygFromTextarea } from "@web_editor/js/frontend/loadWysiwygFromTextarea";

export class WebsiteProfileEditor extends Interaction {
    static selector = ".o_wprofile_editor_form"
    dynamicContent = {
        '.o_forum_file_upload': { "t-on-change": this.onUploadFile },
        '.o_forum_profile_pic_edit': { "t-on-click.prevent": this.onClickEditProfilePic },
        '.o_forum_profile_pic_clear': { "t-on-click": this.onClickClearProfilePic },
        '.o_forum_profile_bio_edit': { "t-on-click.prevent": this.onClickEditProfileBio },
        '.o_forum_profile_bio_cancel_edit': { "t-on-click.prevent": this.onClickCancelEditProfileBio },
    }

    setup() {
        const textareaEl = this.el.querySelector("textarea.o_wysiwyg_loader");

        const options = {
            recordInfo: {
                context: this._getContext(),
                res_model: "res.users",
                res_id: parseInt(this.el.querySelector("input[name=user_id]").value),
            },
            value: textareaEl.getAttribute("content"),
            resizable: true,
            userGeneratedContent: true,
        };

        if (textareaEl.attributes.placeholder) {
            options.placeholder = textareaEl.attributes.placeholder.value;
        }

    }

    async willStart() {
        await loadWysiwygFromTextarea(this, textareaEl, options);
    }

    onClickEditProfilePic(ev) {
        ev.currentTarget.closest("form").querySelector(".o_forum_file_upload").click();
    }

    onClickEditProfileBio(ev) {
        ev.currentTarget.classList.add("d-none");
        document.querySelector(".o_forum_profile_bio_cancel_edit").classList.remove("d-none");
        document.querySelector(".o_forum_profile_bio_form").classList.remove("d-none");
        document.querySelector(".o_forum_profile_bio").classList.add("d-none");
    }

    onClickClearProfilePic(ev) {
        const formEl = ev.currentTarget.closest("form");
        formEl.querySelector(".o_wforum_avatar_img").src = "/web/static/img/placeholder.png";
        const inputElement = document.createElement("input");
        inputElement.setAttribute("name", "clear_image");
        inputElement.setAttribute("id", "forum_clear_image");
        inputElement.setAttribute("type", "hidden");
        formEl.append(inputElement);
    }

    onClickCancelEditProfileBio(ev) {
        ev.currentTarget.classList.add("d-none");
        document.querySelector(".o_forum_profile_bio_edit").classList.remove("d-none");
        document.querySelector(".o_forum_profile_bio_form").classList.add("d-none");
        document.querySelector(".o_forum_profile_bio").classList.remove("d-none");
    }

    onUploadFile(ev) {
        if (!ev.currentTarget.files.length) {
            return;
        }
        const formEl = ev.currentTarget.closest("form");
        var reader = new window.FileReader();
        reader.readAsDataURL(ev.currentTarget.files[0]);
        reader.onload = function (ev) {
            formEl.querySelector(".o_wforum_avatar_img").src = ev.target.result;
        };
        formEl.querySelector("#forum_clear_image")?.remove();
    }

}

registry
    .category("public.interactions")
    .add("website_profile.website_profile_editor", WebsiteProfileEditor);
