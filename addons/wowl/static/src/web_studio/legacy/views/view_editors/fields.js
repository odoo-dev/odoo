odoo.define('web_studio.fields', function (require) {
"use strict";

var AbstractField = require('web.AbstractField');
var basic_fields = require('web.basic_fields');
var relational_fields = require('web.relational_fields');

var InputField = basic_fields.InputField;
var FieldText = basic_fields.FieldText;
var FieldMany2ManyTags = relational_fields.FieldMany2ManyTags;
var FieldMany2One = relational_fields.FieldMany2One;


AbstractField.include({
    has_placeholder: false,
});
InputField.include({
    has_placeholder: true,
});
FieldText.include({
    has_placeholder: true,
});
FieldMany2ManyTags.include({
    has_placeholder: true,
});
FieldMany2One.include({
    has_placeholder: true,
});
});
