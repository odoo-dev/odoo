import { loadIframe, loadIframeBundles } from "@mail/convert_inline/iframe_utils";
import {
    Component,
    onMounted,
    onWillUnmount,
    onWillUpdateProps,
    props,
    proxy,
    signal,
    status,
    useApp,
    useScope,
} from "@odoo/owl";
import { localization } from "@web/core/l10n/localization";
import { renderToFragment } from "@web/core/utils/render";
import { useRef } from "@web/owl2/utils";
import { kanbanRendererProps } from "@web/views/kanban/kanban_renderer";
import { isBrowserSafari } from "@web/core/browser/feature_detection";
import { MailingTemplateKanbanWrapper } from "./mailing_template_kanban_wrapper";
import { cookie } from "@web/core/browser/cookie";

/**
 * This is an Iframe in which the kanban renderer will be loaded
 * in order to securely and properly display cards with plain
 * HTML content.
 */
export class MailingTemplateKanbanIframe extends Component {
    static template = "mass_mailing.MailingTemplateKanbanIframe";
    props = props(kanbanRendererProps);

    app = useApp();

    setup() {
        this.state = proxy({
            ready: false,
        });
        this.iframeRef = useRef("iframe");
        this.scope = useScope();
        this.kanbanRendererProps = signal.Object(this.props);
        this.rendererWrapperRootProps = { kanbanRendererProps: this.kanbanRendererProps };
        onMounted(() => {
            this.setupIframe();
        });
        onWillUnmount(() => {
            if (this.templateKanbanRoot) {
                this.templateKanbanRoot.destroy();
            }
        });
        onWillUpdateProps(async (nextProps) => {
            this.kanbanRendererProps.set(nextProps);
        });
    }

    get isBrowserSafari() {
        return isBrowserSafari();
    }

    renderHeadContent() {
        return renderToFragment("mass_mailing.IframeHead", this);
    }

    loadIframeAssets() {
        return loadIframeBundles(
            this.iframeRef.el,
            [cookie.get("color_scheme") === "dark" ? "web.assets_web_dark" : "web.assets_web"],
            { css: true }
        );
    }

    /**
     * Load the real KanbanRenderer inside an iframe and load the
     * required assets for it.
     */
    async setupIframe(props = this.rendererWrapperRootProps) {
        let loadingError;
        try {
            await loadIframe(this.iframeRef.el, async (iframe) => {
                iframe.contentDocument.head.appendChild(this.renderHeadContent());
                iframe.contentDocument.body.style.setProperty("direction", localization.direction);
                this.templateKanbanRoot = this.app.createRoot(MailingTemplateKanbanWrapper, {
                    env: this.env,
                    props: props,
                });
                await this.loadIframeAssets();
                this.rendererWrapper = await this.templateKanbanRoot.mount(
                    this.iframeRef.el.contentDocument.body
                );
            });
        } catch (error) {
            loadingError = error;
        }
        if (status(this.scope.component) === "destroyed") {
            return;
        } else if (loadingError) {
            throw loadingError;
        }
        this.state.ready = true;
    }
}
