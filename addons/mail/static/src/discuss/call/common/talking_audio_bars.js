import { Component, useProps, t } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";
import { clamp } from "@web/core/utils/numbers";

export class TalkingAudioBars extends Component {
    static template = "discuss.TalkingAudioBars";

    setup() {
        super.setup();
        this.store = useService("mail.store");
        this.props = useProps({
            asPill: t.boolean().optional(false),
            barClass: t.string().optional("bg-dark"),
            session: t.instanceOf(this.store["discuss.channel.rtc.session"]).optional(),
            volumes: t.array(t.number()).optional(),
        });
    }

    barLevel(volume) {
        // monitorAudio returns volume ~0.0 to ~1.0, so we boost it for visual impact
        return clamp(Math.sqrt(volume) * 2, 0, 1);
    }
}
