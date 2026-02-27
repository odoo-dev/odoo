export class WebsiteEventTrackEmailReminder extends Interaction {
    static selector = ".o_wetrack_js_email_reminder";

    dynamicContent = {
        ".o_form_button_cancel": {
            "t-on-click": this.modalEmailReminderCancel,
        },
        "#o_wetrack_email_reminder_form": {
            "t-on-submit.prevent": this.modalEmailReminderSubmit,
        },
        ".o_form_button_dont_ask_again": {
            "t-on-click": () => {
                sessionStorage.setItem("website_event_track.email_reminder_off", "true");
                this.modalEmailReminderCancel();
            },
        }
    }

    modalEmailReminderCancel() {
        console.log("pass inside the modal reminder modal cancel");
        this._modalEmailReminderRemove();
        if (this.favoriteAddedConfirmation) {
            this.notification.add(this.favoriteAddedConfirmation, {type: "info"});
        }
    }


