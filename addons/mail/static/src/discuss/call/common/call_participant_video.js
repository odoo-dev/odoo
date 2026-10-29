import {
    Component,
    onMounted,
    onPatched,
    onWillUnmount,
    status,
    useExternalListener,
    useRef,
    useState,
} from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

/**
 * @typedef {Object} Props
 * @property {import("models").RtcSession} session
 * @extends {Component<Props, Env>}
 */
export class CallParticipantVideo extends Component {
    static props = ["session", "type", "inset?"];
    static template = "discuss.CallParticipantVideo";

    setup() {
        super.setup();
        this.rtc = useState(useService("discuss.rtc"));
        this.root = useRef("root");
        onMounted(() => this._update());
        onPatched(() => this._update());
        onWillUnmount(() => {
            // Setting srcObject runs the media element load algorithm, which cancels the pending
            // load. A media element that is still loading is kept alive by the browser, with its
            // listeners and thus the whole component tree.
            if (this.root.el) {
                this.root.el.srcObject = null;
            }
        });
        useExternalListener(this.env.bus, "RTC-SERVICE:PLAY_MEDIA", async () => {
            await this.play();
        });
    }

    _update() {
        if (!this.root.el) {
            return;
        }
        if (!this.props.session || !this.props.session.getStream(this.props.type)) {
            this.root.el.srcObject = undefined;
        } else {
            this.root.el.srcObject = this.props.session.getStream(this.props.type);
        }
        this.root.el.load();
    }

    async play() {
        try {
            await this.root.el?.play?.();
            this.props.session.videoError = undefined;
        } catch (error) {
            if (status(this) === "destroyed") {
                return;
            }
            this.props.session.videoError = error.name;
        }
    }

    async onVideoLoadedMetaData() {
        await this.play();
    }
}
