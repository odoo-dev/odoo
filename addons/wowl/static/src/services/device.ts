import { Service } from "../types";
import { debounce } from "../utils/misc";

type Size = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface Device {
  size: Size;
  isSmall: boolean;
  isMobileOS: boolean;
  hasTouch: boolean;
  SIZES: { [key: string]: number };
}

export const SIZES: { [key: string]: Size } = { XS: 0, VSM: 1, SM: 2, MD: 3, LG: 4, XL: 5, XXL: 6 };

export const deviceService: Service<Device> = {
  name: "device",
  deploy(env): Device {
    const MEDIAS = [
      window.matchMedia("(max-width: 474px)"),
      window.matchMedia("(min-width: 475px) and (max-width: 575px)"),
      window.matchMedia("(min-width: 576px) and (max-width: 767px)"),
      window.matchMedia("(min-width: 768px) and (max-width: 991px)"),
      window.matchMedia("(min-width: 992px) and (max-width: 1199px)"),
      window.matchMedia("(min-width: 1200px) and (max-width: 1533px)"),
      window.matchMedia("(min-width: 1534px)"),
    ];
    const isMobileOS = Boolean(
      odoo.browser.navigator.userAgent.match(/Android/i) ||
        odoo.browser.navigator.userAgent.match(/webOS/i) ||
        odoo.browser.navigator.userAgent.match(/iPhone/i) ||
        odoo.browser.navigator.userAgent.match(/iPad/i) ||
        odoo.browser.navigator.userAgent.match(/iPod/i) ||
        odoo.browser.navigator.userAgent.match(/BlackBerry/i) ||
        odoo.browser.navigator.userAgent.match(/Windows Phone/i)
    );
    const hasTouch = "ontouchstart" in window || "onmsgesturechange" in window;

    function getSize() {
      return MEDIAS.findIndex((media) => media.matches) as Size;
    }

    const device = {
      isMobileOS,
      hasTouch,
      size: getSize(),
      SIZES,
    };
    Object.defineProperty(device, "isSmall", {
      get() {
        return device.size <= SIZES.SM;
      },
    });

    // define a shortcut in the env
    Object.defineProperty(env, "isSmall", {
      get() {
        return env.services.device.isSmall;
      },
    });

    // listen to media query status changes
    function updateSize() {
      device.size = getSize();
    }
    MEDIAS.forEach((media) => media.addListener(debounce(updateSize, 100) as any));

    return device as Device;
  },
};
