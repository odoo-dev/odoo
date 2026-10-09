import { Component, signal, t, useEffect, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { PermissionPromptDialog } from "@web/core/permission_prompt_dialog/permission_prompt_dialog";
import { useService } from "@web/core/utils/hooks";

export class CallPermissionDialog extends Component {
    static components = { PermissionPromptDialog };
    static template = "discuss.CallPermissionDialog";

    setup() {
        this.props = useProps({
            close: t.function([]),
            media: t.selection(["camera", "microphone"]),
            permissionPrompt: t.string().optional(),
            suggestAllMedias: t.boolean().optional(true),
            useCamera: t.function([t.instanceOf(MediaStream).optional()], t.promise()),
            useMicrophone: t.function([t.instanceOf(MediaStream).optional()], t.promise()),
        });
        /** @type {import("@odoo/owl").Signal<Element>} */
        this.rootRef = signal();
        this.userMediaRef = signal.ref(Element);
        this.singleMediaElementRef = signal.ref(Element);
        this.rtc = useService("discuss.rtc");
        this.store = useService("mail.store");
        this.ui = useService("ui");
        // this is not made reactive because once the permissions are granted by <usermedia> the cameraPermission resolves to granted before <usermedia> fires stream event which keeps the dialog open with the button gone
        this.showCombinedMediaOption =
            this.props.suggestAllMedias &&
            this.rtc.cameraPermission !== "granted" &&
            this.rtc.microphonePermission !== "granted";
        this.supportsUserMediaElement = this.rtc.supportsMediaCaptureElement("usermedia");
        this.supportsSingleMediaElement = this.rtc.supportsMediaCaptureElement(this.props.media);
        this.transferredTracks = new Set();
        useEffect(() => {
            this.userMediaRef()?.setConstraints({
                audio: this.store.settings.audioConstraints,
                video: this.store.settings.cameraConstraints,
            });
        });
        useEffect(() => {
            this.singleMediaElementRef()?.setConstraints(
                this.props.media === "camera"
                    ? this.store.settings.cameraConstraints
                    : this.store.settings.audioConstraints
            );
        });
    }

    async onMediaStream() {
        /** @type {MediaStream} */
        const stream = this.userMediaRef().stream;
        for (const track of stream.getTracks()) {
            this.transferredTracks.add(track);
        }
        await Promise.all([
            this.props.useMicrophone(new MediaStream(stream.getAudioTracks())),
            this.props.useCamera(new MediaStream(stream.getVideoTracks())),
        ]);
        this.props.close();
    }

    async onSingleMediaTrack() {
        const track = this.singleMediaElementRef().track;
        const mediaStream = new MediaStream([track]);
        this.transferredTracks.add(track);
        await (this.props.media === "camera"
            ? this.props.useCamera(mediaStream)
            : this.props.useMicrophone(mediaStream));
        this.props.close();
    }

    /** @param {Event} event */
    onMediaError(event) {
        this.rtc.showMediaUnavailableWarning(
            {
                microphone: event.currentTarget.localName !== "camera",
                camera: event.currentTarget.localName !== "microphone",
            },
            { rootRef: this.rootRef }
        );
        this.props.close();
    }

    async onClickUseMicrophone() {
        if (await this.rtc.askForBrowserPermission({ audio: true }, { rootRef: this.rootRef })) {
            await this.props.useMicrophone();
        }
        this.props.close();
    }

    async onClickUseCamera() {
        if (await this.rtc.askForBrowserPermission({ video: true }, { rootRef: this.rootRef })) {
            await this.props.useCamera();
        }
        this.props.close();
    }

    async onClickUseMicAndCamera() {
        if (
            await this.rtc.askForBrowserPermission(
                { audio: true, video: true },
                { rootRef: this.rootRef }
            )
        ) {
            await Promise.all([this.props.useMicrophone(), this.props.useCamera()]);
        }
        this.props.close();
    }

    get secondaryActionText() {
        return this.props.media === "camera" ? _t("Use camera") : _t("Use microphone");
    }

    get permissionPrompt() {
        if (this.props.permissionPrompt) {
            return this.props.permissionPrompt;
        }
        if (this.props.media === "microphone") {
            return _t("Do you want people to hear you in the meeting?");
        }
        return _t("Do you want people to see you in the meeting?");
    }

    get permissionNote() {
        if (this.props.media === "microphone") {
            return _t("You can still turn off your microphone anytime.");
        }
        return _t("You can still turn off your camera anytime.");
    }
}
