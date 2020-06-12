odoo.define('mail.Service', function (require) {
"use strict";

var core = require('web.core');

var MailManager = require('mail.Manager');

require('mail.Manager.Notification');

core.serviceRegistry.add('mail_service', MailManager);

return MailManager;

});
