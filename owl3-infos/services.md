account_online_synchronization.duplicate_check_service
auditBalanceListChatterService
auth_ui
batchedOrm
cart
clear_caches_on_approval_rules_change
color_scheme
demo_data
discuss.voice_message
documents_client_thumbnail
error
fillTemporalService
function_service
http
knowledge.toc
knowledgeCommandsService
knowledgeEmbedViewsFilters
messaging
mobile
number_buffer
object_service
portal.chatter.boot
pos_router
preparation_display
signInfo
sortable
spreadsheet_collaborative
toy_service
user_invite
variable:name
web.frequent.emoji
website_menus
website_page
website_slides
actionMain (dependents (1: action))
discuss.ptt_extension (dependents (1: discuss.rtc))
discuss.upgrade (dependents (1: mail.store))
iot_longpolling (dependents (1: iot_http))
mail.fullscreen (dependents (1: discuss.rtc))
mail.popout (dependents (1: discuss.pip_service))
offline (dependents (1: action))
pos_data (dependents (1: self_order))
router (dependents (1: self_order))
timer (dependents (1: timesheet_timer))
timesheet_uom (dependents (1: timesheet_grid_uom))
title (dependents (1: action))
bus.parameters (dependents (2: bus_service, worker_service))
mail.sound_effects (dependents (2: discuss.rtc, mail.out_of_focus))
pos (dependents (2: contextual_utils_service, report))
barcode (dependents (3: barcode_handlers, barcode_reader, self_order))
renderer (dependents (3: epson_fiscal_printer_command, printer, self_order))
presence (dependents (4: check_identity_timeout, discuss.core.common, discuss.rtc, im_status))
localization (dependents (5: action, bus_service, contextual_utils_service, public.interactions, tour_service))
multi_tab (dependents (5: bus.outdated_page_watcher, bus_service, discuss.core.web, mail.out_of_focus, voip))
overlay (dependents (7: alert, bottom_sheet, dialog, discuss.call_invitations, effect, popover, tour_service))
ui (dependents (13: action, barcode_handlers, blackbox_queue_service, command, datetime_picker, discuss.core.web, hotkey, im_livechat.autopopup, mail.chat_hub, mail.store, pos_floor_plan, report, website_custom_menus))
notification (dependents (29: accountNotification, action, assetsWatchdog, barcode_handlers, barcode_reader, bus.outdated_page_watcher, bus_service, calendarNotification, discuss.core.common, discuss.core.public.web, discuss.core.web, discuss.rtc, document.document, enterprise_subscription, file_upload, google_maps, iapNotification, im_livechat.livechat, iot_http, mail.attachment_upload, mail.notification.permission, mail.out_of_focus, scss_error_display, self_order, simple_notification, studio, timer_geolocation, upload, website_map))
orm (dependents (35: account_move, aiChatLauncher, allowed_qweb_expressions, aw_fake_events_service, bankReconciliation, barcode_reader, create_edit_project_ids, currency, discuss.core.common, document.document, enterprise_subscription, field, geo_json_service, helpdesk_timer_header, html_builder.snippets, iot_http, knowledge.comments, lazy_session, mail.suggestion, mass_mailing.themes, name, partner_autocomplete.companyAutocomplete, profiling, report, spreadsheet_dashboard_loader, studio, timesheet_leaderboard, timesheet_timer, tour_service, uploadLocalFiles, view, voip, website, website_custom_menus, workEntryPopoverService))
alert (dependencies (1: overlay))
allowed_qweb_expressions (dependencies (1: orm))
aw_fake_events_service (dependencies (1: orm))
bankReconciliation (dependencies (1: orm))
create_edit_project_ids (dependencies (1: orm))
currency (dependencies (1: orm))
google_maps (dependencies (1: notification))
helpdesk_timer_header (dependencies (1: orm))
mail.notification.permission (dependencies (1: notification))
mass_mailing.themes (dependencies (1: orm))
partner_autocomplete.companyAutocomplete (dependencies (1: orm))
profiling (dependencies (1: orm))
scss_error_display (dependencies (1: notification))
timer_geolocation (dependencies (1: notification))
timesheet_grid_uom (dependencies (1: timesheet_uom))
timesheet_leaderboard (dependencies (1: orm))
bottom_sheet (dependents (1: datetime_picker)) (dependencies (1: overlay))
discuss.pip_service (dependents (1: discuss.rtc)) (dependencies (1: mail.popout))
epson_fiscal_printer_command (dependents (1: epson_fiscal_printer)) (dependencies (1: renderer))
field (dependents (1: tree_processor)) (dependencies (1: orm))
geo_json_service (dependents (1: spreadsheet_dashboard_loader)) (dependencies (1: orm))
name (dependents (1: tree_processor)) (dependencies (1: orm))
view (dependents (1: workEntryPopoverService)) (dependencies (1: orm))
effect (dependents (2: action, tour_service)) (dependencies (1: overlay))
file_upload (dependents (2: document.document, mail.attachment_upload)) (dependencies (1: notification))
hotkey (dependents (2: command, website)) (dependencies (1: ui))
upload (dependents (2: unsplash, uploadLocalFiles)) (dependencies (1: notification))
unsplash (dependencies (1: upload))
worker_service (dependents (2: bus.logs_service, bus_service)) (dependencies (1: bus.parameters))
lazy_session (dependents (3: fake_a, fake_b, iot_http)) (dependencies (1: orm))
fake_a (dependencies (1: lazy_session))
fake_b (dependencies (1: lazy_session))
popover (dependents (3: datetime_picker, mail.store, tooltip)) (dependencies (1: overlay))
tooltip (dependencies (1: popover))
public.interactions (dependents (3: website_cookies, website_edit, website_map)) (dependencies (1: localization))
website_cookies (dependencies (1: public.interactions))
website_edit (dependencies (1: public.interactions))
dialog (dependents (17: account_move, action, ai_natural_language_service, barcode_reader, blackbox_queue_service, check_identity, command, document.document, epson_fiscal_printer, html_builder.snippets, pos_floor_plan, printer, pwa, self_order, share_target, voip, website_custom_menus)) (dependencies (1: overlay))
pwa (dependencies (1: dialog))
share_target (dependencies (1: dialog))
check_identity (dependents (1: check_identity_timeout)) (dependencies (1: dialog))
contextual_utils_service (dependencies (2: localization, pos))
enterprise_subscription (dependencies (2: notification, orm))
epson_fiscal_printer (dependencies (2: dialog, epson_fiscal_printer_command))
html_builder.snippets (dependencies (2: dialog, orm))
pos_floor_plan (dependencies (2: dialog, ui))
timesheet_timer (dependencies (2: orm, timer))
tree_processor (dependencies (2: field, name))
uploadLocalFiles (dependencies (2: orm, upload))
website_map (dependencies (2: notification, public.interactions))
printer (dependents (1: self_order)) (dependencies (2: dialog, renderer))
spreadsheet_dashboard_loader (dependents (1: spreadsheet_dashboard_menu_translate)) (dependencies (2: geo_json_service, orm))
barcode_handlers (dependencies (3: barcode, notification, ui))
command (dependencies (3: dialog, hotkey, ui))
datetime_picker (dependencies (3: bottom_sheet, popover, ui))
report (dependencies (3: orm, pos, ui))
tour_service (dependencies (4: effect, localization, orm, overlay))
bus_service (dependents (29: accountNotification, ai_natural_language_service, assetsWatchdog, blackbox_queue_service, bus.logs_service, bus.monitoring_service, bus.outdated_page_watcher, calendarNotification, check_identity_timeout, customer_display_data, discuss.core.common, discuss.core.public.web, discuss.core.web, discuss.p2p, discuss.rtc, document.document, iapNotification, im_livechat.history_service, im_status, iot_http, mail.core.common, mail.core.web, mail.store, order_tracking_display, peppol_auth_service, portal.chatter, self_order, simple_notification, voip)) (dependencies (5: bus.parameters, localization, multi_tab, notification, worker_service))
customer_display_data (dependencies (1: bus_service))
order_tracking_display (dependencies (1: bus_service))
discuss.p2p (dependents (1: discuss.rtc)) (dependencies (1: bus_service))
bus.monitoring_service (dependents (2: bus.connection_alert, mail.chat_hub)) (dependencies (1: bus_service))
assetsWatchdog (dependencies (2: bus_service, notification))
bus.logs_service (dependencies (2: bus_service, worker_service))
iapNotification (dependencies (2: bus_service, notification))
simple_notification (dependencies (2: bus_service, notification))
im_status (dependents (1: mail.store)) (dependencies (2: bus_service, presence))
bus.outdated_page_watcher (dependencies (3: bus_service, multi_tab, notification))
check_identity_timeout (dependencies (3: bus_service, check_identity, presence))
iot_http (dependents (1: blackbox_queue_service)) (dependencies (5: bus_service, iot_longpolling, lazy_session, notification, orm))
blackbox_queue_service (dependencies (4: bus_service, dialog, iot_http, ui))
mail.store (dependents (22: aiChatLauncher, bus.connection_alert, discuss.call_invitations, discuss.core.common, discuss.core.public.web, discuss.core.web, discuss.rtc, document.document, im_livechat.autopopup, im_livechat.boot, im_livechat.history_service, im_livechat.livechat, knowledge.comments, mail.attachment_upload, mail.chat_hub, mail.composer, mail.core.common, mail.core.web, mail.out_of_focus, mail.suggestion, portal.chatter, voip)) (dependencies (5: bus_service, discuss.upgrade, im_status, popover, ui))
im_livechat.boot (dependencies (1: mail.store))
mail.composer (dependents (1: mail.suggestion)) (dependencies (1: mail.store))
bus.connection_alert (dependencies (2: bus.monitoring_service, mail.store))
im_livechat.history_service (dependencies (2: bus_service, mail.store))
knowledge.comments (dependencies (2: mail.store, orm))
mail.core.common (dependencies (2: bus_service, mail.store))
mail.core.web (dependencies (2: bus_service, mail.store))
portal.chatter (dependencies (2: bus_service, mail.store))
im_livechat.livechat (dependents (1: im_livechat.autopopup)) (dependencies (2: mail.store, notification))
im_livechat.autopopup (dependencies (3: im_livechat.livechat, mail.store, ui))
mail.attachment_upload (dependencies (3: file_upload, mail.store, notification))
mail.chat_hub (dependencies (3: bus.monitoring_service, mail.store, ui))
mail.suggestion (dependencies (3: mail.composer, mail.store, orm))
mail.out_of_focus (dependents (1: discuss.core.common)) (dependencies (4: mail.sound_effects, mail.store, multi_tab, notification))
discuss.core.web (dependencies (5: bus_service, mail.store, multi_tab, notification, ui))
voip (dependencies (5: bus_service, dialog, mail.store, multi_tab, orm))
discuss.core.common (dependencies (6: bus_service, mail.out_of_focus, mail.store, notification, orm, presence))
self_order (dependencies (8: barcode, bus_service, dialog, notification, pos_data, printer, renderer, router))
action (dependents (15: accountNotification, account_move, aiChatLauncher, ai_natural_language_service, barcode_reader, calendarNotification, document.document, home_menu, menu, peppol_auth_service, reloadCompany, stock_warehouse, studio, website, workEntryPopoverService)) (dependencies (8: actionMain, dialog, effect, localization, notification, offline, title, ui))
reloadCompany (dependencies (1: action))
stock_warehouse (dependencies (1: action))
home_menu (dependents (1: studio)) (dependencies (1: action))
menu (dependents (3: ai_natural_language_service, spreadsheetLinkMenuCell, studio)) (dependencies (1: action))
spreadsheetLinkMenuCell (dependents (1: spreadsheet_dashboard_menu_translate)) (dependencies (1: menu))
peppol_auth_service (dependencies (2: action, bus_service))
spreadsheet_dashboard_menu_translate (dependencies (2: spreadsheetLinkMenuCell, spreadsheet_dashboard_loader))
accountNotification (dependencies (3: action, bus_service, notification))
account_move (dependencies (3: action, dialog, orm))
aiChatLauncher (dependencies (3: action, mail.store, orm))
calendarNotification (dependencies (3: action, bus_service, notification))
workEntryPopoverService (dependencies (3: action, orm, view))
website (dependents (1: website_custom_menus)) (dependencies (3: action, hotkey, orm))
ai_natural_language_service (dependencies (4: action, bus_service, dialog, menu))
website_custom_menus (dependencies (4: dialog, orm, ui, website))
barcode_reader (dependencies (5: action, barcode, dialog, notification, orm))
studio (dependencies (5: action, home_menu, menu, notification, orm))
document.document (dependencies (7: action, bus_service, dialog, file_upload, mail.store, notification, orm))
discuss.rtc (dependents (2: discuss.call_invitations, discuss.core.public.web)) (dependencies (9: bus_service, discuss.p2p, discuss.pip_service, discuss.ptt_extension, mail.fullscreen, mail.sound_effects, mail.store, notification, presence))
discuss.call_invitations (dependencies (3: discuss.rtc, mail.store, overlay))
discuss.core.public.web (dependencies (4: bus_service, discuss.rtc, mail.store, notification))
