/** @odoo-module **/
import { COLORS, BG_COLORS, ICONS } from "../utils";
import CustomFileInput from "web.CustomFileInput";
import { useService } from "@wowl/core/hooks";

const { Component, hooks } = owl;
const { useRef, useState } = hooks;

const DEFAULT_ICON = {
  backgroundColor: BG_COLORS[5],
  color: COLORS[4],
  iconClass: ICONS[0],
};

/**
 * Icon creator
 *
 * Component which purpose is to design an app icon. It can be an uploaded image
 * which will be displayed as is, or an icon customized with the help of presets
 * of colors and icon symbols (@see web_studio.utils for the full list of colors
 * and icon classes).
 * @extends Component
 */
export class IconCreator extends Component {
  /**
   * @param {Object} [props]
   * @param {string} [props.backgroundColor] Background color of the custom
   *      icon.
   * @param {string} [props.color] Color of the custom icon.
   * @param {boolean} props.editable
   * @param {string} [props.iconClass] Font Awesome class of the custom icon.
   * @param {string} props.type 'base64' (if an actual image) or 'custom_icon'.
   * @param {number} [props.uploaded_attachment_id] Databse ID of an uploaded
   *      attachment
   * @param {string} [props.webIconData] Base64-encoded string representing
   *      the icon image.
   */
  constructor() {
    super(...arguments);

    this.COLORS = COLORS;
    this.BG_COLORS = BG_COLORS;
    this.ICONS = ICONS;

    this.iconRef = useRef("app-icon");

    // FIXME: for now, the IconCreator can be spawned in a pure wowl environment (by clicking
    // on the 'edit' icon of an existing app) and in the legacy environment (through the app
    // creator)
    try {
      const user = useService("user");
      this.userId = user.userId;
    } catch (e) {
      if (e.message === "Service user is not available") {
        this.userId = this.env.session.uid;
      }
    }

    this.show = useState({
      backgroundColor: false,
      color: false,
      iconClass: false,
    });
  }

  async willUpdateProps(nextProps) {
    if ("iconClass" in nextProps && nextProps.iconClass !== this.props.iconClass) {
      await new Promise((r) => $(this.iconRef.el).stop().fadeOut(50, r));
      this.transition = () => $(this.iconRef.el).stop().fadeIn(800);
    }
  }

  patched() {
    if (this.transition) {
      this.transition();
      delete this.transition;
    }
  }

  //--------------------------------------------------------------------------
  // Handlers
  //--------------------------------------------------------------------------

  /**
   * @private
   */
  _onDesignIconClick() {
    this.trigger(
      "icon-changed",
      Object.assign(
        {
          type: "custom_icon",
        },
        DEFAULT_ICON
      )
    );
  }

  /**
   * @private
   * @param {OwlEvent} ev
   */
  async _onFileUploaded(ev) {
    if (!ev.detail.files.length) {
      // Happens when cancelling upload
      return;
    }
    const file = ev.detail.files[0];
    const res = await this.rpc({
      model: "ir.attachment",
      method: "read",
      args: [[file.id], ["datas"]],
    });

    this.trigger("icon-changed", {
      type: "base64",
      uploaded_attachment_id: file.id,
      webIconData: "data:image/png;base64," + res[0].datas.replace(/\s/g, ""),
    });
  }

  /**
   * @private
   * @param {string} palette
   * @param {string} value
   */
  _onPaletteItemClick(palette, value) {
    if (this.props[palette] === value) {
      return; // same value
    }

    const detail = {
      backgroundColor: this.props.backgroundColor,
      color: this.props.color,
      iconClass: this.props.iconClass,
      type: "custom_icon",
    };
    detail[palette] = value;

    this.trigger("icon-changed", detail);
  }

  /**
   * @private
   * @param {string} palette
   */
  _onTogglePalette(palette) {
    for (const pal in this.show) {
      if (pal === palette) {
        this.show[pal] = !this.show[pal];
      } else if (this.show[pal]) {
        this.show[pal] = false;
      }
    }
  }
}

IconCreator.components = { CustomFileInput };
IconCreator.defaultProps = DEFAULT_ICON;
IconCreator.props = {
  backgroundColor: { type: String, optional: 1 },
  color: { type: String, optional: 1 },
  editable: Boolean,
  iconClass: { type: String, optional: 1 },
  type: { validate: (t) => ["base64", "custom_icon"].includes(t) },
  uploaded_attachment_id: { type: Number, optional: 1 },
  webIconData: { type: String, optional: 1 },
};
IconCreator.template = "web_studio.IconCreator";
