/** @odoo-module **/
import { findItem, getNode, triggerEvent } from "./dom";
import { click } from "./utility";
/////////////////////////////////////
// Menu (generic)
/////////////////////////////////////
export async function toggleMenuItem(el, itemFinder) {
  const item = findItem(el, `.o_menu_item`, itemFinder);
  await click(item);
}
export async function toggleMenuItemOption(el, itemFinder, optionFinder) {
  const item = findItem(el, `.o_menu_item`, itemFinder);
  const option = findItem(item.parentNode, ".o_item_option", optionFinder);
  await click(option);
}
export function isItemSelected(el, itemFinder) {
  const item = findItem(el, `.o_menu_item`, itemFinder);
  return item.classList.contains("selected");
}
export function isOptionSelected(el, itemFinder, optionFinder) {
  const item = findItem(el, `.o_menu_item`, itemFinder);
  const option = findItem(item.parentNode, ".o_item_option", optionFinder);
  return option.classList.contains("selected");
}
export function getMenuItemTexts(el) {
  return [...getNode(el).querySelectorAll(`.o_dropdown ul .o_menu_item`)].map((e) =>
    e.innerText.trim()
  );
}
/////////////////////////////////////
// Filter Menu
/////////////////////////////////////
/**
 * @param {EventTarget} el
 * @returns {Promise}
 */
export async function toggleFilterMenu(el) {
  await click(findItem(el, `.o_filter_menu button.o_dropdown_toggler`));
}
// /**
//  * @param {EventTarget} el
//  * @returns {Promise}
//  */
// export async function toggleAddCustomFilter(el: AdmissibleTarget) {
//     await click(getNode(el).querySelector(`button.o_add_custom_filter`));
// }
// /**
//  * @param {EventTarget} el
//  * @returns {Promise}
//  */
// export async function applyFilter(el) {
//     await click(getNode(el).querySelector(`div.o_add_filter_menu > button.o_apply_filter`));
// }
// /**
//  * @param {EventTarget} el
//  * @returns {Promise}
//  */
// export async function addCondition(el) {
//     await click(getNode(el).querySelector(`div.o_add_filter_menu > button.o_add_condition`));
// }
/////////////////////////////////////
// Group By Menu
/////////////////////////////////////
export async function toggleGroupByMenu(el) {
  await click(findItem(el, `.o_group_by_menu button.o_dropdown_toggler`));
}
export async function toggleAddCustomGroup(el) {
  await click(findItem(el, `button.o_add_custom_group_by`));
}
export async function selectGroup(el, fieldName) {
  const select = findItem(el, `select.o_group_by_selector`);
  select.value = fieldName;
  await triggerEvent(select, "change");
}
export async function applyGroup(el) {
  await click(findItem(el, `div.o_add_group_by_menu > button.o_apply_group_by`));
}
/////////////////////////////////////
// Favorite Menu
/////////////////////////////////////
export async function toggleFavoriteMenu(el) {
  await click(findItem(el, `.o_favorite_menu button.o_dropdown_toggler`));
}
export async function toggleSaveFavorite(el) {
  await click(findItem(el, `.o_favorite_menu .o_add_favorite button.o_dropdown_toggler`));
}
export async function editFavoriteName(el, name) {
  const input = findItem(
    el,
    `.o_favorite_menu .o_add_favorite .o_dropdown_menu input[type="text"]`
  );
  input.value = name;
  await triggerEvent(input, "input");
}
export async function saveFavorite(el) {
  await click(
    findItem(el, `.o_favorite_menu .o_add_favorite .o_dropdown_menu button.o_save_favorite`)
  );
}
export async function deleteFavorite(el, favoriteFinder) {
  const favorite = findItem(el, `.o_favorite_menu .o_menu_item`, favoriteFinder);
  await click(findItem(favorite, "i.fa-trash-o"));
}
/////////////////////////////////////
// Comparison Menu
/////////////////////////////////////
export async function toggleComparisonMenu(el) {
  await click(findItem(el, `.o_comparison_menu button.o_dropdown_toggler`));
}
/////////////////////////////////////
// Search Bar
/////////////////////////////////////
export function getFacetTexts(el) {
  return [...getNode(el).querySelectorAll(`div.o_searchview_facet`)].map((facet) =>
    facet.innerText.trim()
  );
}
export async function removeFacet(el, facetFinder = 0) {
  const facet = findItem(el, `div.o_searchview_facet`, facetFinder);
  await click(facet.querySelector("i.o_facet_remove"));
}
// /**
//  * @param {EventTarget} el
//  * @param {string} value
//  * @returns {Promise}
//  */
// export async function editSearch(el, value) {
//     await editInput(getNode(el).querySelector(`.o_searchview_input`), value);
// }
// /**
//  * @param {EventTarget} el
//  * @returns {Promise}
//  */
// export async function validateSearch(el) {
//     await triggerEvent(
//         getNode(el).querySelector(`.o_searchview_input`),
//         'keydown', { key: 'Enter' }
//     );
// }
/////////////////////////////////////
// Action Menu
/////////////////////////////////////
// /**
//  * @param {EventTarget} el
//  * @param {string} [menuFinder="Action"]
//  * @returns {Promise}
//  */
// export async function toggleActionMenu(el, menuFinder = "Action") {
//     const dropdown = findItem(el, `.o_cp_action_menus button`, menuFinder);
//     await click(dropdown);
// }
/////////////////////////////////////
// Pager
/////////////////////////////////////
// /**
//  * @param {EventTarget} el
//  * @returns {Promise}
//  */
// export async function pagerPrevious(el) {
//     await click(getNode(el).querySelector(`.o_pager button.o_pager_previous`));
// }
// /**
//  * @param {EventTarget} el
//  * @returns {Promise}
//  */
// export async function pagerNext(el) {
//     await click(getNode(el).querySelector(`.o_pager button.o_pager_next`));
// }
// /**
//  * @param {EventTarget} el
//  * @returns {string}
//  */
// export function getPagerValue(el) {
//     const pagerValue = getNode(el).querySelector(`.o_pager_counter .o_pager_value`);
//     switch (pagerValue.tagName) {
//         case 'INPUT':
//             return pagerValue.value;
//         case 'SPAN':
//             return pagerValue.innerText.trim();
//     }
// }
// /**
//  * @param {EventTarget} el
//  * @returns {string}
//  */
// export function getPagerSize(el) {
//     return getNode(el).querySelector(`.o_pager_counter span.o_pager_limit`).innerText.trim();
// }
// /**
//  * @param {EventTarget} el
//  * @param {string} value
//  * @returns {Promise}
//  */
// export async function setPagerValue(el, value) {
//     let pagerValue = getNode(el).querySelector(`.o_pager_counter .o_pager_value`);
//     if (pagerValue.tagName === 'SPAN') {
//         await click(pagerValue);
//     }
//     pagerValue = getNode(el).querySelector(`.o_pager_counter input.o_pager_value`);
//     if (!pagerValue) {
//         throw new Error("Pager value is being edited and cannot be changed.");
//     }
//     await editAndTrigger(pagerValue, value, ['change', 'blur']);
// }
/////////////////////////////////////
// View Switcher
/////////////////////////////////////
export async function switchView(el, viewType) {
  await click(findItem(el, `button.o_switch_view.o_${viewType}`));
}
