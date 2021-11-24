odoo.define("pos_gift_card.gift_card", function (require) {
  "use strict";

  const models = require("point_of_sale.models");
  const Registries = require('point_of_sale.Registries');

    // Load the products used for creating program reward lines.
    var existing_models = models.PosGlobalState.prototype.models;
    var product_index = _.findIndex(existing_models, function (model) {
        return model.model === 'product.product';
    });
    var product_model = existing_models[product_index];

  models.load_models([
    {
      model: "gift.card",
      loaded: function (self, giftCard) {
        self.giftCard = giftCard;
      },
    },
  ]);

  Registries.PosModelRegistry.extend(models.Order, (Order) => {

  class PosGiftCardOrder extends Order {
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
            for (let line of this.orderlines.getItems()) {
                if(line.product.id === giftProduct.id)
                    return true;
            }
        }
        return super.wait_for_push_order(...arguments);
    }
  }

  return PosGiftCardOrder;
  });

  Registries.PosModelRegistry.extend(models.Orderline, (Orderline) => {

  class PosGiftCardOrderline extends Orderline {
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

  return PosGiftCardOrderline;
  });

  Registries.PosModelRegistry.extend(models.PosGlobalState, (PosGlobalState) => {

  class PosGiftCardPosModel extends PosGlobalState {
        print_gift_pdf(giftCardIds) {
            this.do_action('pos_gift_card.gift_card_report_pdf', {
                additional_context: {
                    active_ids: [giftCardIds],
                },
            })
        }
    }

    return PosGiftCardPosModel;
    });
});
