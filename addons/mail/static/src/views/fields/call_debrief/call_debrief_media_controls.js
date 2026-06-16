import { Component, props, signal } from "@odoo/owl";

export class CallDebriefMediaControls extends Component {
    static template = "mail.CallDebriefMediaControls";

    setup() {
        /** @type {import("@odoo/owl").Signal<boolean>} */
        this.isVolumeSliderVisible = signal(false);
    }

    get volumeIconClass() {
        if (this.props.isMuted || this.props.volume === 0) {
            return "fa fa-volume-off";
        }
        if (this.props.volume < 0.5) {
            return "fa fa-volume-down";
        }
        return "fa fa-volume-up";
    }

    showVolumeSlider() {
        this.isVolumeSliderVisible.set(true);
    }

    hideVolumeSlider() {
        this.isVolumeSliderVisible.set(false);
    }
}
