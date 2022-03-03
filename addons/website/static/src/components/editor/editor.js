/** @odoo-module */
// Legacy services
import legacyEnv from 'web.commonEnv';
import ajax from 'web.ajax';
import core from 'web.core';

import { getWysiwygClass } from 'web_editor.loader';
import { useService } from '@web/core/utils/hooks';

const { Component, useState, useChildSubEnv, useEffect } = owl;

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
                this.wysiwygLoading = true;
                this._loadWysiwyg();
            }
        }, () => [this.websiteContext.edition, this.websiteContext.isEditionReady]);
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
