# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from typing import List, Dict, Optional, Union

from odoo import models

from odoo.addons.point_of_sale.models.pos_config import PosConfig


class ProductProduct(models.Model):
    _inherit = "product.product"

    def _get_name(self) -> str:
        """
        Returns the name of the product without the code.
        ex: product_sudo.display_name is '[FURN_7888] Desk Stand with Screen (Red)'
        :return: 'Desk Stand with Screen (Red)' (we remove the [FURN_7888] part)
        """
        self.ensure_one()
        # product_sudo.code would be 'FURN_7888', but we also need to remove the brackets
        # and the space after the brackets (hence the +3)
        return self.code and self.display_name[len(self.code) + 3 :] or self.display_name

    def _filter_applicable_attributes(self, attributes_by_ptal_id: Dict) -> List[Dict]:
        self.ensure_one()
        return [
            attributes_by_ptal_id[id]
            for id in self.attribute_line_ids.ids
            if id in attributes_by_ptal_id and attributes_by_ptal_id[id] is not None
        ]

    def _get_attributes(self, pos_config_sudo: PosConfig) -> List[Dict]:
        self.ensure_one()
        # Here we replace the price_extra of each attribute value with a price_extra
        # dictionary that includes the price with taxes included and the price with taxes excluded
        return self._add_price_info_to_attributes(
            self._filter_applicable_attributes(
                self.env["pos.session"].sudo()._get_attributes_by_ptal_id()
            ),
            pos_config_sudo,
        )

    def _add_price_info_to_attributes(self, attributes: List, pos_config_sudo: PosConfig) -> List:
        for attribute in attributes:
            for value in attribute["values"]:
                value.update(
                    {
                        "price_extra": self._get_self_order_price(
                            pos_config_sudo, value.get("price_extra")
                        )
                    }
                )
        return attributes

    def _get_self_order_price(
        self, pos_config: PosConfig, price: Optional[float] = None, qty: int = 1
    ) -> Dict[str, float]:
        """
        Function that returns an object with the price info of a given product, for
        """
        self.ensure_one()
        # if price == None it means that a price was not passed as a parameter, so we use the product's list price
        # it could happen that a price was passed, but it was 0; in that case we want to use this 0 as the argument,
        # and not the product's list price
        price_info = self.taxes_id.compute_all(
            self.lst_price if price is None else price, pos_config.currency_id, qty, self
        )

        return {
            "list_price": price_info["total_included"]
            if pos_config.iface_tax_included == "total"
            else price_info["total_excluded"],
            "price_without_tax": price_info["total_excluded"],
            "price_with_tax": price_info["total_included"],
        }

    def _get_self_order_data(self, pos_config: PosConfig) -> List[Dict]:
        """
        returns the list of products with the necessary info for the self order app
        """
        return [
            {
                "price_info": product._get_self_order_price(pos_config),
                "has_image": bool(product.image_1920),
                "attributes": product._get_attributes(pos_config),
                "name": product._get_name(),
                "product_id": product.id,
                "description_sale": product.description_sale,
                "tag": product.pos_categ_id.name if product.pos_categ_id else "Other",
                "is_pos_groupable": product.uom_id.is_pos_groupable,
            }
            for product in self
        ]
