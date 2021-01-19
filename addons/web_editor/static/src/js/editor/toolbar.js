odoo.define('web_editor.toolbar', function (require) {
'use strict';

var Widget = require('web.Widget');

const Toolbar = Widget.extend({
    template: 'web_editor.toolbar',
    xmlDependencies: ['/web_editor/static/src/xml/snippets.xml'],
});

return Toolbar;

});
