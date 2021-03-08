odoo.define('web_studio.reportEditComponentsRegistry', function (require) {
"use strict";

var Registry = require('web.Registry');
var reportEditComponents = require('web_studio.reportEditComponents');

var registry = new Registry();

registry
    .add('column', reportEditComponents.Column)
    .add('groups', reportEditComponents.Groups)
    .add('layout', reportEditComponents.LayoutEditable)
    .add('image', reportEditComponents.Image)
    .add('table', reportEditComponents.Table)
    .add('text', reportEditComponents.Text)
    .add('total', reportEditComponents.BlockTotal)
    .add('tEsc', reportEditComponents.TEsc)
    .add('tElse', reportEditComponents.TElse)
    .add('tField', reportEditComponents.TField)
    .add('tForeach', reportEditComponents.TForeach)
    .add('tIf', reportEditComponents.TIf)
    .add('tOptions', reportEditComponents.TOptions)
    .add('tSet', reportEditComponents.TSet);

return registry;

});
