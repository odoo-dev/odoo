import { Component, onWillStart, t, useProps } from "@odoo/owl";
import { loadSvg } from "@web/core/utils/svg";

const DEFAULT_PICTO_URL = "/web/static/picto/empty_folder.svg";

/**
 * The "no content" help of an action: an optional illustration, and the html
 * describing what the user could do.
 *
 * @see ir.actions.act_window `nocontent_picto_url` and `help`
 */
export const noContentHelpType = t.object({
    pictoUrl: t.string().optional(),
    help: t.string().optional(), // Markup
});

export class ActionHelper extends Component {
    static template = "web.ActionHelper";
    props = useProps({
        noContentHelp: noContentHelpType.optional(),
    });

    setup() {
        onWillStart(async () => {
            this.processedPicto = await loadSvg(this.pictoUrl);
        });
    }

    get pictoUrl() {
        return this.props.noContentHelp?.pictoUrl || DEFAULT_PICTO_URL;
    }

    get help() {
        return this.props.noContentHelp?.help;
    }

    get showDefaultHelper() {
        return !this.help;
    }
}
