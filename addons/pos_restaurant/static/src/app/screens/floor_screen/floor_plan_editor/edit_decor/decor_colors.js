import { Component, useProps, t } from "@odoo/owl";
import { Image } from "@pos_restaurant/app/services/floor_plan/elements/image";

export class DecorColors extends Component {
    static template = "pos_restaurant.floor_editor.decor_colors";
    props = useProps({
        elements: t.array(t.instanceOf(Image)),
        updateElements: t.function(),
    });

    get colorTokens() {
        const [first, ...others] = this.props.elements;
        const tokens = first.colorTokens.join(",");
        if (others.some((element) => element.colorTokens.join(",") !== tokens)) {
            return [];
        }
        return first.colorTokens.map((token) => ({ token, value: first.getColor(token) }));
    }

    get hasCustomColors() {
        return this.props.elements.some((element) => Object.keys(element.colors).length);
    }

    update(getData, options = {}) {
        this.props.updateElements(
            this.props.elements.map((element) => ({ uuid: element.uuid, data: getData(element) })),
            options
        );
    }

    setTokenColor(token, value, batched = false) {
        this.update((element) => ({ colors: { ...element.colors, [token]: value } }), { batched });
    }

    resetColors() {
        this.update(() => ({ colors: {} }));
    }
}
