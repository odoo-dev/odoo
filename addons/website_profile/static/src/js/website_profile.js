/** @odoo-module **/

import publicWidget from "@web/legacy/js/public/public_widget";
import { rpc } from "@web/core/network/rpc";
import { loadWysiwygFromTextarea } from "@web_editor/js/frontend/loadWysiwygFromTextarea";
import { redirect } from "@web/core/utils/urls";

publicWidget.registry.websiteProfile = publicWidget.Widget.extend({
    selector: '.o_wprofile_email_validation_container',
    read_events: {
        'click .send_validation_email': '_onSendValidationEmailClick',
        'click .validated_email_close': '_onCloseValidatedEmailClick',
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------
    /**
     * @private
     * @param {Event} ev
     */
    _onSendValidationEmailClick: function (ev) {
        ev.preventDefault();
        const element = ev.currentTarget;
        rpc('/profile/send_validation_email', {
            redirect_url: element.dataset["redirect_url"],
        }).then(function (data) {
            if (data) {
                redirect(element.dataset["redirect_url"]);
            }
        });
    },

    /**
     * @private
     */
    _onCloseValidatedEmailClick: function () {
        rpc('/profile/validate_email/close');
    },
});

publicWidget.registry.websiteProfileEditor = publicWidget.Widget.extend({
    selector: '.o_wprofile_editor_form',
    read_events: {
        'click .o_forum_profile_pic_edit': '_onEditProfilePicClick',
        "change .o_forum_file_upload": "_onProfileFileUploadChange",
        'click .o_forum_profile_pic_clear': '_onProfilePicClearClick',

        "click .o_wprofile_cover_edit": "_onEditProfileCoverClick",
        "change .o_wprofile_cover_file_upload": "_onCoverFileUploadChange",
        "click .o_wprofile_cover_clear": "_onProfileCoverClearClick",

        'click .o_forum_profile_bio_edit': '_onProfileBioEditClick',
        'click .o_forum_profile_bio_cancel_edit': '_onProfileBioCancelEditClick',
    },

    /**
     * @override
     */
    start: async function () {
        const def = this._super.apply(this, arguments);
        if (this.editableMode) {
            return def;
        }

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

        this._wysiwyg = await loadWysiwygFromTextarea(this, textareaEl, options);

        this.fileAvatarSelectors = {
            clear: ".o_wprofile_clear_image",
            fileInput: ".o_forum_file_upload",
            image: ".o_wforum_avatar_img",
        };
        this.fileCoverSelectors = {
            clear: ".o_wprofile_clear_image_cover",
            fileInput: ".o_wprofile_cover_file_upload",
            image: ".o_wprofile_cover_img",
        };

        return Promise.all([def]);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     * @param {string} fileInputSelector selector of the file input to trigger a click on.
     */
    _onEditImageClick(ev, fileInputSelector) {
        ev.preventDefault();
        ev.currentTarget.closest("form").querySelector(fileInputSelector).click();
    },

    /**
     * @private
     * @param {Event} ev
     */
    _onEditProfilePicClick: function (ev) {
        this._onEditImageClick(ev, this.fileAvatarSelectors.fileInput);
    },

    /**
     * @private
     * @param {Event} ev
     */
    _onEditProfileCoverClick: function (ev) {
        this._onEditImageClick(ev, this.fileCoverSelectors.fileInput);
    },

    /**
     * @private
     * @param {EventTarget} target
     * @param {string} imageSelector selector of the image to update
     * @param {string} clearSelector selector of the form input controlling whether to remove or not the image
     */
    _onFileUploadChange: function (target, imageSelector, clearSelector) {
        if (!target.files.length) {
            return;
        }
        const formEl = target.closest("form");
        const reader = new window.FileReader();
        reader.readAsDataURL(target.files[0]);
        reader.onload = function (ev) {
            const img = formEl.querySelector(imageSelector);
            img.setAttribute("src", ev.target.result);
            img.classList.remove("o_wprofile_img_empty");
        };
        formEl.querySelector("#forum_clear_image")?.remove();
    },

    /**
     * @private
     * @param {Event} ev
     */
    _onProfileFileUploadChange: function (ev) {
        this._onFileUploadChange(
            ev.currentTarget,
            this.fileAvatarSelectors.image,
            this.fileAvatarSelectors.clear
        );
    },

    /**
     * @private
     * @param {Event} ev
     */
    _onCoverFileUploadChange: function (ev) {
        this._onFileUploadChange(
            ev.currentTarget,
            this.fileCoverSelectors.image,
            this.fileCoverSelectors.clear
        );
    },

    /**
     * @private
     * @param {EventTarget} target
     * @param {string} imageSelector selector of the image to update
     * @param {string} clearSelector selector of the form input controlling whether to remove or not the image
     */
    _onClearImageClick: function (target, imageSelector, clearSelector) {
        const formEl = target.closest("form");
        const img = formEl.querySelector(imageSelector);
        img.setAttribute("src", "/web/static/img/placeholder.png");
        img.classList.add("o_wprofile_img_empty");
        formEl.querySelector(clearSelector).value = "True";
    },

    /**
     * @private
     * @param {Event} ev
     */
    _onProfileCoverClearClick: function (ev) {
        this._onClearImageClick(
            ev.currentTarget,
            this.fileCoverSelectors.image,
            this.fileCoverSelectors.clear
        );
    },

    /**
     * @private
     * @param {Event} ev
     */
    _onProfilePicClearClick: function (ev) {
        this._onClearImageClick(
            ev.currentTarget,
            this.fileAvatarSelectors.image,
            this.fileAvatarSelectors.clear
        );
    },

    /**
     * @private
     * @param {Event} ev
     */
    _onProfileBioEditClick: function (ev) {
        ev.preventDefault();
        ev.currentTarget.classList.add("d-none");
        document.querySelector(".o_forum_profile_bio_cancel_edit").classList.remove("d-none");
        document.querySelector(".o_forum_profile_bio").classList.add("d-none");
        document.querySelector(".o_forum_profile_bio_form").classList.remove("d-none");
    },

     /**
     * @private
     * @param {Event} ev
     */
     _onProfileBioCancelEditClick: function (ev) {
        ev.preventDefault();
        ev.currentTarget.classList.add("d-none");
        document.querySelector(".o_forum_profile_bio_edit").classList.remove("d-none");
        document.querySelector(".o_forum_profile_bio_form").classList.add("d-none");
        document.querySelector(".o_forum_profile_bio").classList.remove("d-none");
     },
});

publicWidget.registry.websiteProfileNextRankCard = publicWidget.Widget.extend({
    selector: '.o_wprofile_progress_circle',

    /**
     * @override
     */
    start: function () {
        new Tooltip(this.el.querySelector('g[data-bs-toggle="tooltip"]'));
        return this._super.apply(this, arguments);
    },

});

export default publicWidget.registry.websiteProfile;
