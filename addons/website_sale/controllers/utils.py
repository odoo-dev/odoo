
from werkzeug import urls

from odoo.exceptions import ValidationError
from odoo.http import request

from odoo.addons.website_sale.const import SHOP_PATH


def validate_and_get_category(category):
    """Validate and return the `product.public.category` record corresponding to the provided
    category, which can be a record, a record id, or a slug.

    - If no category is provided, return an empty recordset.
    - If a category is provided, but it doesn't exist or can't be accessed, raise a 404.
    - If a valid category is provided, return the corresponding record.

    :param str|product.public.category category: The category to validate and return.
    :return: The validated category.
    :rtype: product.public.category
    """
    ProductCategory = request.env['product.public.category']
    if (
        not isinstance(category, ProductCategory.__class__)
        and category
        and not str(category).isdigit()
    ):
        raise ValidationError(request.env._("Invalid category."))
    if (
        (category := ProductCategory.browse(category and int(category)).exists())
        and category.can_access_from_current_website()
    ):
        return category
    return ProductCategory

def get_filtered_query_string(query_string, keys_to_remove):
    """Return a filtered copy of the provided query string, where all keys in `keys_to_remove`
    are removed.

    Note: the query string shouldn't include the leading '?'.

    :param str query_string: The query string to filter.
    :param list(str) keys_to_remove: The keys to remove from the query string.
    :return: The filtered query string.
    :rtype: str
    """
    query = urls.url_parse(f'?{query_string}').decode_query()
    for key in keys_to_remove:
        query.pop(key, False)
    return urls.url_encode(query)

def get_shop_path(category=None, page=0):
    path = SHOP_PATH
    if category:
        slug = request.env['ir.http']._slug
        path += f'/category/{slug(category)}'
    if page:
        path += f'/page/{page}'
    return path
