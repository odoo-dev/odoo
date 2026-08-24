import { Component, markup, onWillStart, t, useProps } from "@odoo/owl";
import { inlineSvgImages } from "@web/core/utils/inline_svg";

const DEFAULT_PICTO = markup`<img src="/web/static/picto/empty_folder.svg"/>`;

export class ActionHelper extends Component {
    static template = "web.ActionHelper";
    props = useProps({
        noContentHelp: t.string().optional(),
    });

    setup() {
        // the `<img src="…/picto/foo.svg"/>` pictograms are inlined before the
        // first render, so that they can be styled along with the rest of the
        // help and don't pop in afterwards
        onWillStart(async () => {
            if (this.showDefaultHelper) {
                this.defaultPicto = await inlineSvgImages(DEFAULT_PICTO);
            } else {
                this.help = await inlineSvgImages(this.props.noContentHelp);
            }
        });
    }

    get showDefaultHelper() {
        return !this.props.noContentHelp;
    }
}
