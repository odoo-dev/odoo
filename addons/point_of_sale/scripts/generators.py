import odoo.addons.point_of_sale.scripts.random_names as rn
from odoo.tools.misc import split_every
from contextlib import contextmanager
import random


@contextmanager
def chunked_creation(env, model_name, chunk_size):
    vals_list = []
    yield vals_list
    for i, vals_chunk in enumerate(split_every(chunk_size, vals_list)):
        env[model_name].create(vals_chunk)
        n = min((i + 1) * chunk_size, len(vals_list))
        print(f"{n}/{len(vals_list)} records created in {model_name}")
    print(f"All records created in {model_name}")


def generate_product_attributes(env):
    for name, values in rn.PRODUCT_ATTRIBUTES.items():
        attribute = env["product.attribute"].create({"name": name})
        for value in values:
            env["product.attribute.value"].create(
                {"name": value, "attribute_id": attribute.id}
            )

    print("Product attributes and values created")


def generate_products(env, n_templates=10_000, chunk=1_000):
    print("Generating products...")

    n_existing_pt = env["product.template"].search_count([])
    attributes = env["product.attribute"].search([])
    attributes.fetch(["value_ids"])
    pos_categ_ids = env["pos.category"].search([]).ids

    with chunked_creation(env, "product.template", chunk) as vals_list:
        codes = [*range(n_existing_pt, n_existing_pt + n_templates)]
        random.shuffle(codes)
        for code in codes:
            price = random.randint(1, 9_999)
            vals = {
                "name": rn.get_product_name(),
                "type": "consu",
                "default_code": f"DUMPROD_{code:05d}",
                "list_price": price,
                "available_in_pos": True,
                "pos_categ_ids": [
                    (6, 0, random.sample(pos_categ_ids, random.randint(1, 3)))
                ],
            }

            if random.random() < 0.50:
                template_line_vals_list = []
                for attribute in random.sample(attributes, random.randint(2, 5)):
                    att_values = attribute.value_ids
                    n_att_values = len(att_values)

                    if not att_values or (n_att_values == 1 and random.random() < 0.5):
                        continue

                    values = random.sample(att_values, random.randint(1, n_att_values))
                    template_line_vals_list.append(
                        {
                            "attribute_id": attribute.id,
                            "value_ids": [(6, 0, [v.id for v in values])],
                        }
                    )

                if template_line_vals_list:
                    vals.update(
                        {
                            "attribute_line_ids": [
                                (0, 0, x) for x in template_line_vals_list
                            ]
                        }
                    )

            vals_list.append(vals)


def generate_pricelist(env, size=5, chunk=100):
    with chunked_creation(env, "product.pricelist", chunk) as vals_list:
        for i in range(size):
            vals_list.append(
                {
                    "name": rn.get_pricelist_name(),
                }
            )


def generate_pricelist_items(env, n_pricelists=5, chunk=10000):
    print("Generating pricelist items...")

    def create_variant_vals(init_vals, other_vals, compute_price):
        if compute_price == "fixed":
            other_vals["fixed_price"] = random.randint(1, 999)
        else:
            other_vals["percent_price"] = random.randint(1, 100)
        vals = init_vals.copy()
        vals.update(other_vals)
        return vals

    # create a pricelist item per product and pricelist combination
    with chunked_creation(env, "product.pricelist.item", chunk) as vals_list:
        product_templates = env["product.template"].search([])
        product_templates.fetch(["product_variant_ids"])
        for pricelist in random.sample(
            env["product.pricelist"].search([]), n_pricelists
        ):
            init_vals = {
                "pricelist_id": pricelist.id,
                "base": "list_price",
            }
            for p_template in product_templates:
                vals_list.append(
                    create_variant_vals(
                        init_vals,
                        {
                            "applied_on": "1_product",
                            "product_tmpl_id": p_template.id,
                        },
                        random.choice(["fixed", "percentage"]),
                    )
                )
                for product in p_template.product_variant_ids:
                    vals_list.append(
                        create_variant_vals(
                            init_vals,
                            {
                                "applied_on": "0_product_variant",
                                "product_id": product.id,
                            },
                            random.choice(["fixed", "percentage"]),
                        )
                    )

        print(f"{len(vals_list)} vals ready to be created in product.pricelist.item...")


def set_pricelists_on_config(env, pos_configs=None):
    if not pos_configs:
        pos_configs = env["pos.config"].search([("company_id", "=", env.company.id)])

    pricelists = env["product.pricelist"].search(
        [("company_id", "in", [False, env.company.id])]
    )
    pos_configs.write(
        {
            "available_pricelist_ids": [(6, 0, pricelists.ids)],
            "pricelist_id": pricelists[0].id,
            "use_pricelist": True,
            "iface_available_categ_ids": [(6, 0, [])],
            "limit_categories": False,
        }
    )
    print(f"Pricelists set on POS config {', '.join(pos_configs.mapped('name'))}")


def generate(env):
    generate_product_attributes(env)
    generate_products(env, n_templates=10_000, chunk=1_000)
    generate_pricelist(env, size=5)
    generate_pricelist_items(env, chunk=10_000)
    set_pricelists_on_config(env)
