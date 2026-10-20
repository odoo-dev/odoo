# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.tests import HttpCase, tagged


@tagged('post_install', '-at_install')
class TestColorCombinations(HttpCase):

    def test_nested_color_combination_buttons(self):
        """Buttons must use the color combination of their closest ancestor,
        whatever the index of the color combinations of its ancestors."""
        buttons = '<a href="#" class="btn btn-primary">P</a><a href="#" class="btn btn-secondary">S</a>'
        # (outer, inner): the outer index is higher than the inner one.
        combinations = [(4, 1), (3, 1), (5, 4)]
        sections = ''.join(f'''
            <section class="o_cc o_cc{outer} o_colored_level">
                <div class="o_cc o_cc{inner} o_colored_level nested">{buttons}</div>
            </section>
            <section class="o_cc o_cc{inner} reference">{buttons}</section>
        ''' for outer, inner in combinations)
        view = self.env['ir.ui.view'].create({
            'name': 'Nested color combinations',
            'type': 'qweb',
            'key': 'website.test_nested_color_combinations',
            'arch': f'<t t-call="website.layout"><div id="wrap">{sections}</div></t>',
        })
        page = self.env['website.page'].create({
            'view_id': view.id,
            'url': '/test_nested_color_combinations',
            'is_published': True,
            'website_id': self.env['website'].browse(self.ref('base.default_website')).id,
        })
        self.browser_js(page.url, """
            const colors = (el) => [...el.querySelectorAll(".btn")].map(
                (btn) => getComputedStyle(btn).backgroundColor
            );
            const nesteds = [...document.querySelectorAll(".nested")];
            const references = [...document.querySelectorAll(".reference")];
            const errors = nesteds.flatMap((nested, i) => {
                const actual = colors(nested).join();
                const expected = colors(references[i]).join();
                return actual === expected ? [] : [`#${i}: ${actual}, expected: ${expected}`];
            });
            if (nesteds.length !== 3 || errors.length) {
                console.error(`Nested buttons: ${errors.join(" | ")}`);
            } else {
                console.log("test successful");
            }
        """, ready="document.readyState === 'complete' && !!document.querySelector('.nested')")
