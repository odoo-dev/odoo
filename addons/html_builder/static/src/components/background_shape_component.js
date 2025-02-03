import { defaultBuilderComponents } from "@html_builder/builder_components/default_builder_components";
import { Component, useRef } from "@odoo/owl";

const connectionShapes = [
    { shape: "web_editor/Connections/01", label: "Connections 01" },
    { shape: "web_editor/Connections/02", label: "Connections 02" },
    { shape: "web_editor/Connections/03", label: "Connections 03" },
    { shape: "web_editor/Connections/04", label: "Connections 04" },
    { shape: "web_editor/Connections/05", label: "Connections 05" },
    { shape: "web_editor/Connections/06", label: "Connections 06" },
    { shape: "web_editor/Connections/07", label: "Connections 07" },
    { shape: "web_editor/Connections/08", label: "Connections 08" },
    { shape: "web_editor/Connections/09", label: "Connections 09" },
    { shape: "web_editor/Connections/10", label: "Connections 10" },
    { shape: "web_editor/Connections/11", label: "Connections 11" },
    { shape: "web_editor/Connections/12", label: "Connections 12" },
    { shape: "web_editor/Connections/13", label: "Connections 13" },
    { shape: "web_editor/Connections/14", label: "Connections 14" },
    { shape: "web_editor/Connections/15", label: "Connections 15" },
    { shape: "web_editor/Connections/16", label: "Connections 16" },
    { shape: "web_editor/Connections/17", label: "Connections 17" },
    { shape: "web_editor/Connections/18", label: "Connections 18" },
    { shape: "web_editor/Connections/19", label: "Connections 19" },
    { shape: "web_editor/Connections/20", label: "Connections 20" },
];
const originShapes = [
    { shape: "web_editor/Origins/02_001", label: "Origins 01" },
    { shape: "web_editor/Origins/05", label: "Origins 02" },
    { shape: "web_editor/Origins/06_001", label: "Origins 03" },
    { shape: "web_editor/Origins/07_002", label: "Origins 04" },
    { shape: "web_editor/Origins/09_001", label: "Origins 05" },
    { shape: "web_editor/Origins/16", label: "Origins 06", animated: true },
    { shape: "web_editor/Origins/17", label: "Origins 07", animated: true },
    { shape: "web_editor/Origins/19", label: "Origins 08" },
];
const boldShapes = [
    { shape: "web_editor/Bold/01", label: "Bold 01", animated: true },
    { shape: "web_editor/Bold/03", label: "Bold 02" },
    { shape: "web_editor/Bold/04", label: "Bold 03" },
    { shape: "web_editor/Bold/05_001", label: "Bold 04" },
    { shape: "web_editor/Bold/06_001", label: "Bold 05" },
    { shape: "web_editor/Bold/07_001", label: "Bold 06" },
    { shape: "web_editor/Bold/08", label: "Bold 07" },
    { shape: "web_editor/Bold/09", label: "Bold 08" },
    { shape: "web_editor/Bold/10_001", label: "Bold 09" },
    { shape: "web_editor/Bold/02_001", label: "Bold 10" },
];
const blobShapes = [
    { shape: "web_editor/Blobs/01_001", label: "Blobs 01" },
    { shape: "web_editor/Blobs/02", label: "Blobs 02" },
    { shape: "web_editor/Blobs/03", label: "Blobs 03" },
    { shape: "web_editor/Blobs/04", label: "Blobs 04" },
    { shape: "web_editor/Blobs/05", label: "Blobs 05" },
    { shape: "web_editor/Blobs/06", label: "Blobs 06" },
    { shape: "web_editor/Blobs/07", label: "Blobs 07" },
    { shape: "web_editor/Blobs/08", label: "Blobs 08" },
    { shape: "web_editor/Blobs/09", label: "Blobs 09" },
    { shape: "web_editor/Blobs/10_001", label: "Blobs 10" },
    { shape: "web_editor/Blobs/11", label: "Blobs 11" },
    { shape: "web_editor/Blobs/12", label: "Blobs 12" },
];
const airyAndZigShapes = [
    { shape: "web_editor/Airy/01", label: "Airy 01" },
    { shape: "web_editor/Airy/06", label: "Airy 02" },
    { shape: "web_editor/Airy/02", label: "Airy 03" },
    { shape: "web_editor/Airy/07", label: "Airy 04" },
    { shape: "web_editor/Airy/08", label: "Airy 05" },
    { shape: "web_editor/Airy/10", label: "Airy 06" },
    { shape: "web_editor/Airy/09", label: "Airy 07" },
    { shape: "web_editor/Airy/11", label: "Airy 08" },
    { shape: "web_editor/Airy/03_001", label: "Airy 09", animated: true },
    { shape: "web_editor/Airy/04_001", label: "Airy 10", animated: true },
    { shape: "web_editor/Airy/05_001", label: "Airy 11", animated: true },
    { shape: "web_editor/Airy/12_001", label: "Airy 12", animated: true },
    { shape: "web_editor/Airy/13_001", label: "Airy 13", animated: true },
    { shape: "web_editor/Airy/14", label: "Airy 14" },
    { shape: "web_editor/Zigs/01_001", label: "Zigs 01", animated: true },
    { shape: "web_editor/Zigs/02_001", label: "Zigs 02", animated: true },
    { shape: "web_editor/Zigs/03", label: "Zigs 03" },
    { shape: "web_editor/Zigs/04", label: "Zigs 04" },
];
const wavyShapes = [
    { shape: "web_editor/Wavy/03", label: "Wavy 01" },
    { shape: "web_editor/Wavy/10", label: "Wavy 02" },
    { shape: "web_editor/Wavy/24", label: "Wavy 03", animated: true },
    { shape: "web_editor/Wavy/26", label: "Wavy 04", animated: true },
    { shape: "web_editor/Wavy/27", label: "Wavy 05", animated: true },
    { shape: "web_editor/Wavy/04", label: "Wavy 06" },
    { shape: "web_editor/Wavy/06_001", label: "Wavy 07" },
    { shape: "web_editor/Wavy/07", label: "Wavy 08" },
    { shape: "web_editor/Wavy/08", label: "Wavy 09" },
    { shape: "web_editor/Wavy/09", label: "Wavy 10" },
    { shape: "web_editor/Wavy/11", label: "Wavy 11" },
    { shape: "web_editor/Wavy/28", label: "Wavy 12", animated: true },
    { shape: "web_editor/Wavy/16", label: "Wavy 13" },
    { shape: "web_editor/Wavy/17", label: "Wavy 14" },
    { shape: "web_editor/Wavy/18", label: "Wavy 15" },
    { shape: "web_editor/Wavy/19", label: "Wavy 16" },
    { shape: "web_editor/Wavy/22", label: "Wavy 17" },
    { shape: "web_editor/Wavy/23", label: "Wavy 18" },
];
const blockAndRainyShapes = [
    { shape: "web_editor/Blocks/02_001", label: "Blocks 01" },
    { shape: "web_editor/Rainy/01_001", label: "Rainy 01", animated: true },
    { shape: "web_editor/Blocks/01_001", label: "Blocks 02" },
    { shape: "web_editor/Rainy/02_001", label: "Rainy 02", animated: true },
    { shape: "web_editor/Rainy/06", label: "Rainy 03" },
    { shape: "web_editor/Blocks/04", label: "Blocks 04" },
    { shape: "web_editor/Rainy/07", label: "Rainy 04" },
    { shape: "web_editor/Rainy/10", label: "Rainy 05", animated: true },
    { shape: "web_editor/Rainy/08_001", label: "Rainy 06", animated: true },
    { shape: "web_editor/Rainy/09_001", label: "Rainy 07" },
];
const floatingShapes = [
    { shape: "web_editor/Floats/01", label: "Float 01", animated: true },
    { shape: "web_editor/Floats/02", label: "Float 02", animated: true },
    { shape: "web_editor/Floats/03", label: "Float 03", animated: true },
    { shape: "web_editor/Floats/04", label: "Float 04", animated: true },
    { shape: "web_editor/Floats/05", label: "Float 05", animated: true },
    { shape: "web_editor/Floats/06", label: "Float 06", animated: true },
    { shape: "web_editor/Floats/07", label: "Float 07", animated: true },
    { shape: "web_editor/Floats/08", label: "Float 08", animated: true },
    { shape: "web_editor/Floats/09", label: "Float 09", animated: true },
    { shape: "web_editor/Floats/10", label: "Float 10", animated: true },
    { shape: "web_editor/Floats/11", label: "Float 11", animated: true },
    { shape: "web_editor/Floats/12", label: "Float 12", animated: true },
    { shape: "web_editor/Floats/13", label: "Float 13", animated: true },
    { shape: "web_editor/Floats/14", label: "Float 14", animated: true },
];

export class BackgroundShapeComponent extends Component {
    static template = "html_builder.BackgroundShapeComponent";
    static components = {
        ...defaultBuilderComponents,
    };
    static props = {};

    setup() {
        this.basicEl = useRef("basic");
        this.linearEl = useRef("linear");
        this.creativeEl = useRef("creative");
        this.shapeBackgroundImagePerClass = {};
        for (const styleSheet of this.env.iframeEl.contentWindow.document.styleSheets) {
            if (styleSheet.href && new URL(styleSheet.href).host !== location.host) {
                // In some browsers, if a stylesheet is loaded from a different domain
                // accessing cssRules results in a SecurityError.
                continue;
            }
            for (const rule of [...styleSheet.cssRules]) {
                if (rule.selectorText && rule.selectorText.startsWith(".o_we_shape.")) {
                    this.shapeBackgroundImagePerClass[rule.selectorText] =
                        rule.style.backgroundImage;
                }
            }
        }
        this.connectionShapes = connectionShapes;
        this.originShapes = originShapes;
        this.boldShapes = boldShapes;
        this.blobShapes = blobShapes;
        this.airyAndZigShapes = airyAndZigShapes;
        this.wavyShapes = wavyShapes;
        this.blockAndRainyShapes = blockAndRainyShapes;
        this.floatingShapes = floatingShapes;
    }
    getShapeUrl(shapeName) {
        const shapeClassName = `o_${shapeName.replace(/\//g, "_")}`;
        // Match current palette.
        return this.shapeBackgroundImagePerClass[`.o_we_shape.${shapeClassName}`];
    }
    scrollToShapes(sectionName) {
        const sectionElementMap = {
            basic: this.basicEl.el,
            linear: this.linearEl.el,
            creative: this.creativeEl.el,
        };
        sectionElementMap[sectionName].scrollIntoView({ behavior: "smooth", block: "start" });
    }
    hideComponent() {
        this.env.hideComponent();
    }
}
