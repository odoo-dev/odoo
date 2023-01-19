/* @odoo-module */

import { markEventHandled } from "@mail/new/utils/misc";

import {
    Component,
    onMounted,
    onWillStart,
    useEffect,
    useRef,
    useState,
    onPatched,
    onWillPatch,
    onWillUnmount,
    onWillDestroy,
} from "@odoo/owl";
import { getBundle, loadBundle } from "@web/core/assets";
import { usePopover } from "@web/core/popover/popover_hook";
import { memoize } from "@web/core/utils/functions";
import { escapeRegExp } from "@web/core/utils/strings";

/**
 *
 * @param {string} refName
 * @param {object} props
 * @param {function} [props.onSelect]
 * @param {function} [props.onClose]
 */
export function useEmojiPicker(refName, props) {
    console.log("UseEmojiPicker rn");
    console.log(props);
    console.log(refName);
    const ref = useRef(refName);
    console.log(ref);
    console.log(ref.el);
    const popover = usePopover();
    let closePopover = false;
    let scrollValueRemember = 0;
    const setScrollPosition = (xpos) => {
        console.log("SETTING SCROLL POSITION: " + xpos);
    };
    const toggle = () => {
        console.log("PROPS AT CLOSING TIME");
        console.log(props);
        if (closePopover) {
            closePopover();
            closePopover = false;
        } else {
            closePopover = popover.add(ref.el, EmojiPicker, props, {
                onClose: () => (closePopover = false),
                popoverClass: "o-fast-popover",
            });
        }
    };
    onMounted(() => {
        ref.el.addEventListener("click", toggle);
        ref.el.addEventListener("mouseenter", loadEmoji);
    });
    onWillPatch(() => {
        ref.el.removeEventListener("click", toggle);
        ref.el.removeEventListener("mouseenter", loadEmoji);
    });
    onPatched(() => {
        ref.el.addEventListener("click", toggle);
        ref.el.addEventListener("mouseenter", loadEmoji);
    });
}

const _loadEmoji = memoize(() => getBundle("mail.assets_emoji").then(loadBundle));

/**
 * @returns {import("@mail/new/composer/emoji_data")}
 */
export async function loadEmoji() {
    await _loadEmoji();
    return odoo.runtimeImport("@mail/new/composer/emoji_data");
}

export class EmojiPicker extends Component {
    static props = ["onSelect", "close", "onClose?", "myprop"];
    //Donner en props une fonction setScrollPosition
    //Sinon, redemander à géry si je suis encore bloqué
    //Je dois trouver un moyen de créer cette nouvelle prop, et de la passer avec un callback d'une fonction dedans, et cette fonction de callback sera dans UseEmojiPicker, et modifieras la varialbe dans useEmojiPicker
    //Peut etre qu'il faut que la props apparaisse dans le xml? Le xml template qui contient <EmojiPicker, et qui envoie props dedans, à explorer. 
    static defaultProps = { onClose: () => {} };
    static template = "mail.emoji_picker";

    setup() {
        this.categories = null;
        console.log(this.useEmojiPicker);
        this.emojis = null;
        this.inputRef = useRef("input");
        this.gridRef = useRef("emoji-grid");
        this.shouldScrollElem = null;
        this.state = useState({
            categoryId: null,
            searchStr: "",
            currentScroll: 0,
        });
        console.log("setup");
        onWillStart(async () => {
            console.log("WillStart");
            const { categories, emojis } = await loadEmoji();
            this.categories = categories;
            this.emojis = emojis;
            this.state.categoryId = this.categories[0].sortId;
            console.log(this.state.currentScroll);
        });
        onMounted(() => {
            console.log("Mounted");
            this.inputRef.el.focus();
            this.highlightActiveCategory();
            this.gridRef.el.onscroll = () => {
                console.log("Scrolling");
                console.log(this.gridRef.el.scrollTop);
                this.state.currentScroll = this.gridRef.el.scrollTop;
                console.log(this.state.currentScroll);
            };
            console.log(this.state.currentScroll);
        });
        onPatched(() => {
            console.log("Patched");
            if (this.shouldScrollElem) {
                this.shouldScrollElem = false;
                const getElement = () =>
                    this.gridRef.el.querySelector(
                        `.o-emoji-category[data-category="${this.state.categoryId}"`
                    );
                const elem = getElement();
                if (elem) {
                    elem.scrollIntoView();
                } else {
                    this.shouldScrollElem = getElement;
                }
            }
        });
        useEffect(
            () => {
                if (this.state.searchStr) {
                    this.state.categoryId = null;
                } else {
                    this.highlightActiveCategory();
                }
            },
            () => [this.state.searchStr]
        );
        onWillUnmount(() => {
            console.log("Unmounting emoji picker");
            console.log(this.state.currentScroll);
            console.log("this is setScrollPosition");
            console.log(this.props.setScrollPosition);
            this.props.setScrollPosition(100);
        });
        onWillDestroy(() => {
            console.log("Destroying emoji picker");
            console.log(this.state.currentScroll);
            console.log(this.props);
        });
    }

    onClick(ev) {
        console.log("open3");
        markEventHandled(ev, "emoji.selectEmoji");
    }

    onKeydown(ev) {
        if (ev.key === "Escape") {
            this.props.close();
            this.props.onClose();
            ev.stopPropagation();
        }
    }

    getEmojis() {
        const search = this.state.searchStr;
        if (search.length > 1) {
            const regexp = new RegExp(
                search
                    .split("")
                    .map((x) => escapeRegExp(x))
                    .join(".*")
            );
            return this.emojis.filter((emoji) =>
                [emoji.name, ...emoji.keywords, ...emoji.emoticons, ...emoji.shortcodes].some((x) =>
                    x.match(regexp)
                )
            );
        }
        return this.emojis;
    }

    selectCategory(ev) {
        const id = Number(ev.target.dataset.id);
        if (id) {
            this.state.searchStr = "";
            this.state.categoryId = id;
            this.shouldScrollElem = true;
        }
    }

    selectEmoji(ev) {
        const codepoints = ev.target.dataset.codepoints;
        if (codepoints) {
            this.props.onSelect(codepoints);
            this.props.close();
            this.props.onClose();
        }
    }

    highlightActiveCategory() {
        if (!this.gridRef || !this.gridRef.el) {
            return;
        }
        const coords = this.gridRef.el.getBoundingClientRect();
        const res = document.elementFromPoint(coords.x, coords.y);
        if (!res) {
            return;
        }
        this.state.categoryId = parseInt(res.dataset.category);
    }
}
