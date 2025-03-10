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
                clean: ({ editingElement, value }) => {
                    //todo
                },

                apply: ({ editingElement, value }) => {
                    console.log(value);
                    const isStart = value === "start";
                    const isCenter = value === "center";
                    const isEnd = value === "end";

                    const mobileNavbar = editingElement.ownerDocument.getElementById("top_menu_collapse_mobile");
                    var menu = mobileNavbar.getElementsByClassName("nav navbar-nav top_menu");
                    if (menu)
                    {
                        menu[0].classList.toggle("text-start", isStart);
                        menu[0].classList.toggle("text-center", isCenter);
                        menu[0].classList.toggle("text-end", isEnd);
                    }
                    else
                    {
                        console.log("no navbars with class name \"nav navbar-nav top_menu\" found.");
                    }

                },

                isApplied: ({ editingElement, value }) => {
                    const mobileNavbar = editingElement.ownerDocument.getElementById("top_menu_collapse_mobile");
                    var menu = mobileNavbar.getElementsByClassName("nav navbar-nav top_menu");
                    if (menu)
                    {
                        switch (value)
                        {
                            case "start":
                                return menu[0].classList.contains("text-start");
                            case "center":
                                return menu[0].classList.contains("text-center");
                            case "end":
                                return menu[0].classList.contains("text-end");
                            default:
                                return false;
                        }
                    }
                    else
                    {
                        console.log("no navbars with class name \"nav navbar-nav top_menu\" found.");
                        return false;
                    }
                }

            },
            setTextColor: {
                apply: ({ editingElement, value }) => {
                    console.log(value);
                }
            },
            setLinkStyle: {
                clean: ({ editingElement, value }) => {
                    //todo
                },

                apply: ({ editingElement, value }) => {
                    
                    const isSolid = ['fill', 'pills', 'block'].includes(value);

                    editingElement.classList.toggle("nav-pills", isSolid);
                    
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
                    else
                    {
                        console.log("no navbars with class name \"navbar\" found.");
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
