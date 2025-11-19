import { useOptionsSubEnv } from "@html_builder/utils/utils";
import { boundariesIn } from "@html_editor/utils/position";
import { useService } from "@web/core/utils/hooks";
import { useOperation } from "../core/operation_plugin";
import { BaseOptionComponent, useDomState, useGetItemValue } from "../core/utils";
import { BorderConfigurator } from "../plugins/border_configurator_option";
import { ShadowOption } from "../plugins/shadow_option";

export class FormatContainer extends BaseOptionComponent {
    static template = "html_builder.FormatContainer";
    static dependencies = [
        "builderOptions",
        "overlayButtons",
        "builderOverlay",
        "remove",
        "clone",
        "userCommand",
        "selection",
        "toolbar",
    ];
    static components = {
        BorderConfigurator,
        ShadowOption,
    };
    static props = {
        options: { type: Array },
        editingElement: true, // HTMLElement from iframe
    };
    static defaultProps = {
        containerTitle: {},
        headerMiddleButtons: [],
        optionTitleComponents: [],
    };

    setup() {
        useOptionsSubEnv(() => [this.props.editingElement]);
        super.setup();
        this.notification = useService("notification");
        this.getItemValue = useGetItemValue();

        this.callOperation = useOperation();

        this.toolbarItems = this.getResource("toolbar_items");
        this.toolbarButtons = this.dependencies.toolbar.getButtonGroups();
        this.toolbarButtons = this.toolbarButtons.filter((x) =>
            ["font", "decoration", "layout"].includes(x.id)
        );
        this.toolbarButtons = this.toolbarButtons.map((group) => ({
            ...group,
            buttons: group.buttons
                .filter((button) => !["table_alignment", "remove_format"].includes(button.id))
                .map((button) => {
                    if (button.Component) {
                        const props = { ...button.props };
                        if (props.onSelected) {
                            props.onSelected = (...args) => {
                                const restore = this.setElSelection();
                                button.props.onSelected(...args);
                                restore();
                            };
                        }

                        if (props.applyColor) {
                            props.applyColor = (...args) => {
                                const restore = this.setElSelection();
                                button.props.applyColor(...args);
                                restore();
                            };
                        }

                        if (props.applyColorPreview) {
                            props.applyColorPreview = (...args) => {
                                const restore = this.setElSelection();
                                button.props.applyColorPreview(...args);
                                restore();
                            };
                        }

                        props.isSecondary = true;

                        return {
                            ...button,
                            props,
                        };
                    } else {
                        return button;
                    }
                }),
        }));

        this.state = useDomState(() => ({
            toolbarButtons: [...this.toolbarButtons], // Hack to force the rerender (isActive)
        }));
        this.toolbarProps = {
            class: "shadow rounded my-2",
            focusEditable: () => this.dependencies.selection.focusEditable(),
            state: { buttonGroups: this.toolbarButtons },
        };

        this.getSelection = () => this.dependencies.selection.getSelectionData();
    }

    setElSelection() {
        const { restore } = this.dependencies.selection.preserveSelection();

        // const [anchorNode, anchorOffset] = leftPos(this.props.editingElement);
        // const [focusNode, focusOffset] = rightPos(this.props.editingElement);
        const [anchorNode, anchorOffset, focusNode, focusOffset] = boundariesIn(
            this.props.editingElement
        );
        this.dependencies.selection.setSelection({
            anchorNode,
            anchorOffset,
            focusNode,
            focusOffset,
        });

        return restore;
    }

    selectElement() {
        this.dependencies.builderOptions.updateContainers(this.props.editingElement);
    }

    toggleOverlayPreview(el, show) {
        if (show) {
            this.dependencies.overlayButtons.hideOverlayButtons();
            this.dependencies.builderOverlay.showOverlayPreview(el);
        } else {
            this.dependencies.overlayButtons.showOverlayButtons();
            this.dependencies.builderOverlay.hideOverlayPreview(el);
        }
    }

    onPointerEnter() {
        this.toggleOverlayPreview(this.props.editingElement, true);
    }

    onPointerLeave() {
        this.toggleOverlayPreview(this.props.editingElement, false);
    }

    onButtonClick(button) {
        const restore = this.setElSelection();
        button.run();
        restore();
    }
}
