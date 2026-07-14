import { closeStream } from "@mail/utils/common/misc";
import { Component, signal, t, useEffect, useProps, xml } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class UserMedia extends Component {
    static template = xml`
        <usermedia class="o-mail-UserMedia" t-att-class="this.props.variant" t-ref="this.mediaRef">
            <t t-call-slot="default"/>
        </usermedia>`;
    setup() {
        this.props = useProps({
            variant: t.selection(["primary", "secondary"]),
            video: t.boolean(),
            audio: t.boolean(),
            onSuccess: t.function([]),
            slots: t.object({
                default: t.object(),
            }),
        });
        this.mediaRef = signal.ref();
        this.rtc = useService("discuss.rtc");

        useEffect(() => {
            const el = this.mediaRef();
            if (!el || !this.isUserMediaSupported) {
                return;
            }
            console.log(this.props.variant, this.userMediaConstrains);
            el.setConstraints(this.userMediaConstrains);
            const onSuccess = () => {
                closeStream(el.stream);
                this.props.onSuccess();
            };
            const onError = () => {
                console.error(el.error);
            };
            el.addEventListener("error", onError);
            el.addEventListener("stream", onSuccess);
            return () => {
                el.removeEventListener("stream", onSuccess);
                el.removeEventListener("error", onError);
            };
        });
    }

    get isUserMediaSupported() {
        return "HTMLUserMediaElement" in window;
    }

    get userMediaConstrains() {
        const constrains = {};
        if (this.props.video) {
            constrains.video = this.rtc.store.settings.cameraConstraints;
        }
        if (this.props.audio) {
            constrains.audio = this.rtc.store.settings.audioConstraints;
        }
        return constrains;
    }
}
