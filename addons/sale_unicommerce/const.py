# Part of Odoo. See LICENSE file for full copyright and licensing details.

UNICOMMERCE_BASE_URL = "https://{tenant}.unicommerce.com"  # change with actual unicommerce URL

API_ENDPOINTS = {
    # product
    "create_update_category": "/services/rest/v1/product/category/addOrEdit",
    "create_update_items": "/services/rest/v1/catalog/itemType/createOrEdit",
    "map_listing": "services/rest/v1/channel/createChannelItemType",
    # "create_update_channel_item_type": "/services/rest/v1/channel/createChannelItemType",
    "get_item_details": "/services/rest/v1/catalog/itemType/get",
    "search_items": "/services/rest/v1/product/itemType/search",
    # SO
    "search_sale_orders": "/services/rest/v1/oms/saleOrder/search",
    "get_sale_order": "/services/rest/v1/oms/saleorder/get",
    # inventory
    "get_inventory_snapshot": "/services/rest/v1/inventory/inventorySnapshot/get",
    "update_inventory": "services/rest/v1/inventory/adjust/bulk",
    # invoice
    "create_invoice": "/services/rest/v1/oms/shippingPackage/createInvoice",
    # "allocate_shipping_provider": "allocateShippingProvider",
    # "mark_sale_order_status": "markSaleOrderStatus",
    # "create_manifest": "createManifest",
    # "complete_manifest": "completeManifest",
    # "search_returns": "searchReturns",
    # "get_return": "getReturn",
    # "mark_sale_order_returned": "markSaleOrderReturnedWithInventoryType",
}

# DEFAULT_HEADERS = {
#     "Content-Type": "application/json",
#     "Accept": "application/json",
# }

SUCCESS_CODES = [200, 201]
ERROR_CODES = [400, 401, 403, 404, 500]
