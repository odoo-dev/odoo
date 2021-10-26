odoo.define('l10n_fr_pos_cert.pos', function (require) {
"use strict";

const { Gui } = require('point_of_sale.Gui');
var models = require('point_of_sale.models');
var rpc = require('web.rpc');
var session = require('web.session');
var core = require('web.core');
var utils = require('web.utils');
const Registries = require('point_of_sale.Registries');

var _t = core._t;
var round_di = utils.round_decimals;

Registries.PModel.extend(models.PosModel, (PosModel) => {

class L10nFrPosModel extends PosModel {
    is_french_country(){
      var french_countries = ['FR', 'MF', 'MQ', 'NC', 'PF', 'RE', 'GF', 'GP', 'TF'];
      if (!this.company.country) {
        Gui.showPopup("ErrorPopup", {
            'title': _t("Missing Country"),
            'body':  _.str.sprintf(_t('The company %s doesn\'t have a country set.'), this.company.name),
        });
        return false;
      }
      return _.contains(french_countries, this.company.country.code);
    }
    delete_current_order () {
        if (this.is_french_country() && this.get_order().get_orderlines().length) {
            Gui.showPopup("ErrorPopup", {
                'title': _t("Fiscal Data Module error"),
                'body':  _t("Deleting of orders is not allowed."),
            });
        } else {
            super.delete_current_order(...arguments);
        }
    }
    disallowLineQuantityChange() {
        let result = super.disallowLineQuantityChange(...arguments);
        return this.is_french_country() || result;
    }
}

return L10nFrPosModel;
});

Registries.PModel.extend(models.Order, (Order) => {

class L10nFrOrder extends Order {
    initialize() {
        super.initialize(...arguments);
        this.l10n_fr_hash = this.l10n_fr_hash || false;
        this.save_to_db();
    }
    export_for_printing() {
      var result = super.export_for_printing(...arguments);
      result.l10n_fr_hash = this.get_l10n_fr_hash();
      return result;
    }
    set_l10n_fr_hash (l10n_fr_hash){
      this.l10n_fr_hash = l10n_fr_hash;
    }
    get_l10n_fr_hash() {
      return this.l10n_fr_hash;
    }
    wait_for_push_order() {
      var result = super.wait_for_push_order(...arguments);
      result = Boolean(result || this.pos.is_french_country());
      return result;
    }
}

return L10nFrOrder;
});

Registries.PModel.extend(models.Orderline, (Orderline) => {

class L10nFrOrderline extends Orderline {
    can_be_merged_with(orderline) {
        let order = this.pos.get_order();
        let orderlines = order.orderlines.getItems();
        let lastOrderline = order.orderlines.at(orderlines.length - 1);

        if(this.pos.is_french_country() && (lastOrderline.product.id !== orderline.product.id || lastOrderline.quantity < 0)) {
            return false;
        } else {
            return super.can_be_merged_with(...arguments);
        }
    }
}

return L10nFrOrderline;
});

});
