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
                        const isCenter = menu[0].classList.contains("text-center");
                        const isEnd = menu[0].classList.contains("text-end");
                        const isStart = (!isCenter && !isEnd);

                        switch (value)
                        {
                            case "start":
                                return isStart;
                            case "center":
                                return isCenter;
                            case "end":
                                return isEnd;
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
                apply: ({ editingElement, value }) => {
                    
                    const isSolid = ['fill', 'pills', 'block'].includes(value);

                    editingElement.classList.toggle("nav-pills", isSolid);
                    
                    const isFill = value === 'fill';
                    const isOutline = value === 'outline';
                    const isPills = value === 'pills';
                    const isBlock = value === 'block';
                    const isBorderBottom = value === 'border-bottom';

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

                    
                    const isFill = editingElement.classList.contains("nav-header-fill");
                    const isOutline = editingElement.classList.contains("nav-header-outline");
                    const isPills = editingElement.classList.contains("nav-header-pills");
                    const isBlock = editingElement.classList.contains("nav-header-block");
                    const isBorderBottom = editingElement.classList.contains("nav-header-border-bottom");
                    const isDefault = (!isFill && !isOutline && !isPills && !isBlock && !isBorderBottom);

                    switch (value)
                    {
                        case "default":
                            return isDefault;
                        case "fill":
                            return isFill;
                        case "outline":
                            return isOutline;
                        case "pills":
                            return isPills;
                        case "block":
                            return isBlock;
                        case "border-bottom":
                            return isBorderBottom;
                        default:
                            return false;
                    }
                    return false;
                    
                }

            },
            setAdditionalColor: {
                apply: ({ editingElement, value }) => {
                    
                    const isPrimary = value === 'primary';
                    const isSecondary = value === 'secondary';

                    var additionalBtn = editingElement.getElementsByClassName("dropdown-toggle");
                    
                    if (additionalBtn)
                    {
                        additionalBtn[0].classList.toggle("btn-outline-primary", isPrimary);
                        additionalBtn[0].classList.toggle("btn-outline-secondary", isSecondary);
                    }
                    
                },

                isApplied: ({ editingElement, value }) => {

                    var additionalBtn = editingElement.getElementsByClassName("dropdown-toggle");
                    
                    if (additionalBtn)
                    {
                        const isPrimary = additionalBtn[0].classList.contains("btn-outline-primary");
                        const isSecondary = additionalBtn[0].classList.contains("btn-outline-secondary");

                        switch (value)
                        {
                            case "default":
                                return (!isPrimary && !isSecondary);
                            case "primary":
                                return isPrimary;
                            case "secondary":
                                return isSecondary;
                            default:
                                return false;
                        }
                    }
                    return false;
                    
                    
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
