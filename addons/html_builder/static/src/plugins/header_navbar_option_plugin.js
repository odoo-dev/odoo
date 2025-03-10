import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";

class HeaderNavbarOptionPlugin extends Plugin {
    static id = "HeaderNavbarOptionPlugin";
    resources = {
        builder_options: [
            {
                template: "html_builder.HeaderNavbarOption",
                selector: "#wrapwrap > header nav.navbar",
            },
        ],
        builder_actions: this.getActions(),
    }; 

    getActions() {
        return {
            setMobileAlignment: {
                apply: ({ editingElement, value }) => {
                    console.log(value);
                }
            },
            setTextColor: {
                apply: ({ editingElement, value }) => {
                    console.log(value);
                }
            },
            setLinkStyle: {
                clean: ({ editingElement, value }) => {
                    const isSolid = ['fill', 'pills', 'block'].includes(value);

                    editingElement.classList.toggle("nav-pills", !isSolid);
                },

                apply: ({ editingElement, value }) => {
                    
                    const isSolid = ['fill', 'pills', 'block'].includes(value);
                    //const isUnderline = value === 'border-bottom';

                    editingElement.classList.toggle("nav-pills", isSolid);
                    //editingElement.classList.toggle("nav-underline", isUnderline);
                    
                    const isDefault = value === 'default';
                    const isFill = value === 'fill';
                    const isOutline = value === 'outline';
                    const isPills = value === 'pills';
                    const isBlock = value === 'block';
                    const isBorderBottom = value === 'border-bottom';

                    editingElement.classList.toggle("nav-header-default", isDefault);
                    editingElement.classList.toggle("nav-header-fill", isFill);
                    editingElement.classList.toggle("nav-header-outline", isOutline);
                    editingElement.classList.toggle("nav-header-pills", isPills);
                    editingElement.classList.toggle("nav-header-block", isBlock);
                    editingElement.classList.toggle("nav-header-border-bottom", isBorderBottom);

                    var navbars = editingElement.ownerDocument.getElementsByClassName("navbar");
                    if (navbars)
                    {
                        //todoo do something else than navbars[0]
                        navbars[0].classList.toggle("nav-header-no-padding", (isBlock || isBorderBottom));

                    }


                },

                isApplied: ({ editingElement, value }) => {
                    
                    switch (value)
                    {
                        case "default":
                            return editingElement.classList.contains("nav-header-default");
                        case "fill":
                            return editingElement.classList.contains("nav-header-fill");
                        case "outline":
                            return editingElement.classList.contains("nav-header-outline");
                        case "pills":
                            return editingElement.classList.contains("nav-header-pills");
                        case "block":
                            return editingElement.classList.contains("nav-header-block");
                        case "border-bottom":
                            return editingElement.classList.contains("nav-header-border-bottom");
                        default:
                            return false;
                    }
                    return false;
                    
                }

            },
            setAdditionalColor: {
                apply: ({ editingElement, value }) => {
                    console.log(value);
                }
            },
            setSubMenuOpenMode: {
                apply: ({ editingElement, value }) => {
                    console.log(value);
                }
            },

        }
    }
}
registry.category("website-plugins").add(HeaderNavbarOptionPlugin.id, HeaderNavbarOptionPlugin);
