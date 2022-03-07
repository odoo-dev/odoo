/** @odoo-module **/

import { registry } from '@web/core/registry';
import { useService } from '@web/core/utils/hooks';

import { WebsiteEditorComponent } from '../../components/editor/editor';

const { Component, onWillStart, useEffect, useRef, useState } = owl;

export class WebsiteEditorClientAction extends Component {
    setup() {
        super.setup(...arguments);
        this.websiteService = useService('website');
        this.title = useService('title');

        this.iframeFallbackUrl = '/website/iframefallback';

        this.iframe = useRef('iframe');
        this.iframefallback = useRef('iframefallback');
        this.websiteContext = useState(this.websiteService.context);

        onWillStart(async () => {
            await this.websiteService.fetchWebsites();
            this.initialUrl = await this.websiteService.sendRequest(`/website/force/${this.websiteId}`, { path: this.path });
        });

        useEffect(() => {
            this.websiteService.currentWebsiteId = this.websiteId;
            this.websiteService.context.showNewContentModal = this.props.action.context.params && this.props.action.context.params.display_new_content;
            return () => this.websiteService.currentWebsiteId = null;
        }, () => [this.props.action.context.params]);

        useEffect(() => {
            this.iframe.el.addEventListener('load', () => {
                this.currentUrl = this.iframe.el.contentDocument.location.href;
                this.currentTitle = this.iframe.el.contentDocument.title;
                history.pushState({}, this.currentTitle, this.currentUrl);
                this.title.setParts({ action: this.currentTitle });

                this.websiteService.pageDocument = this.iframe.el.contentDocument;
                this.websiteService.contentWindow = this.iframe.el.contentWindow;

                this.iframe.el.contentWindow.addEventListener('beforeunload', () => {
                    this.iframefallback.el.contentDocument.body.replaceWith(this.iframe.el.contentDocument.body.cloneNode(true));
                    $().getScrollingElement(this.iframefallback.el.contentDocument)[0].scrollTop = $().getScrollingElement(this.iframe.el.contentDocument)[0].scrollTop;
                });
                this.websiteContext.isEditionReady = true;
            });
        });
    }

    get websiteId() {
        let websiteId = this.props.action.context.params && this.props.action.context.params.website_id;
        if (!websiteId) {
            websiteId = this.websiteService.currentWebsite && this.websiteService.currentWebsite.id;
        }
        if (!websiteId) {
            websiteId = this.websiteService.websites[0].id;
        }
        return websiteId;
    }

    get path() {
        let path = this.props.action.context.params && this.props.action.context.params.path;
        if (!path) {
            path = '/';
        }
        return path;
    }
}
WebsiteEditorClientAction.template = 'website.WebsiteEditorClientAction';
WebsiteEditorClientAction.components = { WebsiteEditorComponent };

registry.category('actions').add('website_editor', WebsiteEditorClientAction);
