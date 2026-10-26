import { Composer } from "@mail/core/common/composer";
import { patch } from "@web/core/utils/patch";
import { useVoiceRecorder, VoiceRecorderAction } from "./voice_recorder";

patch(Composer, {
    components: { ...Composer.components },
});

patch(Composer.prototype, {
    setup() {
        super.setup();
        this.voiceRecorder = useVoiceRecorder(
            { onRecordReady: (file) => this.attachmentUploader.uploadFile(file, { voice: true }) },
            { rootRef: this.rootRef }
        );
    },
    /** @type {import("@mail/core/common/action_list").GetActionComponent} */
    getActionComponent(params) {
        if (params.action.id === "voice-recording") {
            return VoiceRecorderAction;
        }
        return super.getActionComponent(params);
    },
    get isSendButtonDisabled() {
        if (this.voiceRecorder?.recording) {
            return !this.state.active;
        }
        return super.isSendButtonDisabled;
    },
    onKeydown(ev) {
        if (ev.key === "Escape" && this.voiceRecorder?.recording) {
            ev.preventDefault();
            ev.stopPropagation();
            this.voiceRecorder.cancelRecording();
            return;
        }
        return super.onKeydown(ev);
    },
    async sendMessage() {
        if (this.voiceRecorder?.recording) {
            await this.voiceRecorder.onClick();
        }
        return super.sendMessage();
    },
});
