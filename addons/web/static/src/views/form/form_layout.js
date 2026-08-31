import {
    Component,
    Plugin,
    providePlugins,
    t,
    useConfig,
    usePlugin,
    useProps,
    xml,
} from "@odoo/owl";
import { services } from "@web/core/services";
import { CssClassType } from "@web/core/utils/classname";
import { Layout } from "@web/search/layout";

class FormLayout extends Component {
    static template = xml`
        <div t-att-class="this.root.cssClass" t-ref="this.root.ref">
            <div class="o_form_view_container">
                <Layout t-props="this.layoutProps" className="this.layoutProps.useSampleModel ? 'o_view_sample_data' : ''"/>
            </div>
        </div>
    `;
    static components = { Layout };

    layoutProps = useProps();
    root = useProps({
        cssClass: CssClassType.optional(""),
        ref: t.signal(t.ref()),
    });
}

class FormLayoutPlugin extends Plugin {
    component = useConfig(
        "component",
        t.component().optional(() => FormLayout)
    );
    info = useConfig("info", t.object().optional({}));
}
services.add(FormLayoutPlugin);

export function useFormLayout() {
    return usePlugin(FormLayoutPlugin).component;
}

export function useFormLayoutInfo() {
    return usePlugin(FormLayoutPlugin).info;
}

export function provideFormLayout(component, info = {}) {
    providePlugins([FormLayoutPlugin], { component, info });
}
