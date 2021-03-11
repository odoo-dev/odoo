odoo.define('mail/static/src/models/gif_manager/gif_manager.js', function (require) {
'use strict';

const { registerNewModel } = require('mail/static/src/model/model_core.js');
    const { attr, one2one } = require('mail/static/src/model/model_field.js');

function factory(dependencies) {

    class GifManager extends dependencies['mail.model'] {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        async getCategories() {
            const categories = await this._ajax('categories');
            this.update({
                categories: categories.tags,
            });
        }

        async search(search) {
            const response = await this._ajax('search', { q: search });
            this.update({
                searchResult: response.results
            });
        }

        getApiKey() {
            return "5PFWYKTVK1VO";
        }

        insertGif(gif) {
            console.log(gif);
            this.composer.update({
                textInputContent: this.composer.textInputContent + ' ' + gif.itemurl
            });
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------
        _ajax(endpoint, params = {}) {
            const _params = new URLSearchParams(params);
            _params.append('key', this.getApiKey());
            _params.append('locale', this.env.messaging.locale.language);

            const stringParams = '?' + _params.toString();
            return $.get("https://g.tenor.com/v1/" + endpoint + stringParams);
        }

    }

    GifManager.fields = {
        composer: one2one('mail.composer', {
            inverse: 'gifManager',
        }),
        categories: attr({
            default: [],
        }),
        searchResult: attr({
            default: [],
        }),
    };

    GifManager.modelName = 'mail.gif_manager';

    return GifManager;
}

registerNewModel('mail.gif_manager', factory);

});
