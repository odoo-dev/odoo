odoo.define('point_of_sale.Registries', function(require) {
    'use strict';

    /**
     * This definition contains all the instances of ClassRegistry.
     */

    const ComponentRegistry = require('point_of_sale.ComponentRegistry');
    const ClassRegistry = require('point_of_sale.ClassRegistry');

    return { Component: new ComponentRegistry(), PosModelRegistry: new ClassRegistry() };
});
