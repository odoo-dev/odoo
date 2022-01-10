odoo.define("pos_gift_card.gift_card", function (require) {
  "use strict";

  const models = require("point_of_sale.models");
  const Registries = require('point_of_sale.Registries');


  const PosGiftCardPosGlobalState = (PosGlobalState) => class PosGiftCardPosGlobalState extends PosGlobalState {
    async _processData(loadedData) {
      await super._processData(...arguments);
      this.giftCards = loadedData['gift.card'];
    }
  }
  Registries.PosModelRegistry.extend(models.PosGlobalState, PosGiftCardPosGlobalState);


  const PosGiftCardOrder = (Order) => class PosGiftCardOrder extends Order {
    set_orderline_options(orderline, options) {
      super.set_orderline_options(...arguments);
      if (options && options.generated_gift_card_ids) {
        orderline.generated_gift_card_ids = [options.generated_gift_card_ids];
      }
      if (options && options.gift_card_id) {
        orderline.gift_card_id = options.gift_card_id;
      }
    }
    wait_for_push_order() {
        if(this.pos.config.use_gift_card) {
            let giftProduct = this.pos.db.product_by_id[this.pos.config.gift_card_product_id[0]];
            for (let line of this.orderlines) {
                if(line.product.id === giftProduct.id)
                    return true;
            }
        }
        return super.wait_for_push_order(...arguments);
    }
  }
  Registries.PosModelRegistry.extend(models.Order, PosGiftCardOrder);


  const PosGiftCardOrderline = (Orderline) => class PosGiftCardOrderline extends Orderline {
    export_as_JSON() {
      var json = super.export_as_JSON(...arguments);
      json.generated_gift_card_ids = this.generated_gift_card_ids;
      json.gift_card_id = this.gift_card_id;
      return json;
    }
    init_from_JSON(json) {
      super.init_from_JSON(...arguments);
      this.generated_gift_card_ids = json.generated_gift_card_ids;
      this.gift_card_id = json.gift_card_id;
    }
  }
  Registries.PosModelRegistry.extend(models.Orderline, PosGiftCardOrderline);
});
