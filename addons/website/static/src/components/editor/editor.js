/** @odoo-module */
// Legacy services
import legacyEnv from 'web.commonEnv';
import ajax from 'web.ajax';
import core from 'web.core';

import { getWysiwygClass } from 'web_editor.loader';
import { useService } from '@web/core/utils/hooks';

const { markup, Component, useState, useChildSubEnv, useEffect } = owl;

import { WysiwygAdapterComponent } from '../wysiwyg_adapter/wysiwyg_adapter';

export class WebsiteEditorComponent extends Component {
    /**
     * @override
     */
    setup() {
        this.iframe = this.props.iframe;
        this.websiteService = useService('website');

        this.state = useState({ edition: false});
        this.websiteContext = useState(this.websiteService.context);

        useChildSubEnv(legacyEnv);

        useEffect(() => {
            if (this.websiteContext.edition && this.websiteContext.isEditionReady) {
                if (this.$welcomeMessage) {
                    this.$welcomeMessage.detach();
                }
                this.wysiwygLoading = true;
                this._loadWysiwyg();
            } else if (this.websiteContext.isEditionReady) {
                const $wrap = $(this.iframe.el.contentDocument.getElementById('wrap'));
                if ($wrap.length && $wrap.html().trim() === '') {
                    this.$welcomeMessage = $(core.qweb.render('website.homepage_editor_welcome_message'));
                    this.$welcomeMessage.addClass('o_homepage_editor_welcome_message');
                    this.$welcomeMessage.css('min-height', $wrap.parent('main').height() - ($wrap.outerHeight(true) - $wrap.height()));
                    $wrap.empty().append(this.$welcomeMessage);
                }
            }
        }, () => [this.websiteContext.edition, this.websiteContext.isEditionReady]);
    }
    /**
     * Reload the iframe and the editor
     *
     * @return {Promise} the iframe and the state is set to launch
     */
    async reload(event, widgetEl) {
        if (widgetEl) {
            this.loadingDummy = markup(widgetEl.innerHTML);
        }
        this.state.loading = true;
        // FIXME: The loading dummy gets removed too soon
        this.state.edition = false;
        await this._reloadIframe();
        if (event.data.option_selector) {
            this.reload_target = $(this.iframe.el.contentDocument.body).find(event.data.option_selector)[0];
        }
        this.state.edition = true;
        this.state.loading = false;
    }
    /**
     * Reload the iframe and set the edition states to false
     */
    async quit() {
        await this._reloadIframe();
        this.state.edition = false;
        this.websiteContext.edition = false;
        this.reload_target = null;
    }
    /**
     * Reload the iframe
     *
     * @return {Promise} the iframe has reloaded
     */
    async _reloadIframe() {
        return new Promise((resolve, reject) => {
            this.iframe.el.addEventListener('load', resolve);
            this.iframe.el.contentWindow.location.reload();
        });
    }
    /**
     * Load wysiwyg libs and start the editor
     *
     * @return {Promise} the libs are loaded, the editor is starting
     */
    async _loadWysiwyg() {
        if (!this.Wysiwyg) {
            await ajax.loadXML('/website/static/src/xml/website.editor.xml', core.qweb);
            this.Wysiwyg = await getWysiwygClass({}, ['website.compiled_assets_wysiwyg']);
        }
        this.state.edition = 'launch';
        this.wysiwygLoading = false;
    }
}
WebsiteEditorComponent.components = { WysiwygAdapterComponent };
WebsiteEditorComponent.template = 'website.WebsiteEditorComponent';
