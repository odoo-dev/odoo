#!/usr/bin/env python3
"""
Idempotent migration script: convert legacy icon patterns to the new
data-icon attribute system introduced in commit 7e41e08e.

Patterns handled (across .xml, .js, .ts, .py, .scss, .css files):

  In HTML/XML/QWeb:
    <i class="fa fa-ICON [extras]"/>
      → <i class="oi [extras]" data-icon="MATERIAL"/>

    <i class="oi oi-OLDNAME [extras]"/>
      → <i class="oi [extras]" data-icon="NEW_NAME"/>

    icon="fa-ICON"  (in button/field/stat-button elements)
      → icon="MATERIAL"  [+ icon_class="oi-filled" when needed]

    icon="oi-OLDNAME"  (or "oi oi-OLDNAME")
      → icon="NEW_NAME"

  In JS/TS:
    icon: "fa fa-ICON"  →  icon: "MATERIAL"
    icon: "oi oi-ICON"  →  icon: "MATERIAL"
    .fa-ICON (CSS selector)  →  [data-icon='MATERIAL']
    .oi-ICON (CSS selector)  →  [data-icon='NEW']

  In Python:
    'iconClass': 'fa-ICON'  →  'icon': 'MATERIAL'
    'icon': 'fa fa-ICON'    →  'icon': 'MATERIAL'
    'icon': 'oi oi-ICON'    →  'icon': 'NEW'
    Markup("<i class='fa fa-ICON'.../>")  (handled by XML rules)

  In SCSS/CSS:
    i.fa { → i.oi {
    .fa-ICON (selector) → [data-icon='MATERIAL']
    .oi-ICON (selector) → [data-icon='NEW']

Usage:
    # Process only git-changed files (default – useful when rebasing)
    python3 migrate_icons.py

    # Preview changes without modifying files
    python3 migrate_icons.py --check

    # Process specific files
    python3 migrate_icons.py path/to/file.xml other/file.js

    # Recursively process all eligible files under a directory
    python3 migrate_icons.py --all addons/my_module/
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# MAPPING: fa-NAME → (material_icon_name, needs_oi_filled)
# Derived from addons/web_icons/static/src/icons.scss
# "needs_oi_filled" mirrors the _f suffix convention in that file.
# ---------------------------------------------------------------------------
FA_TO_MATERIAL: dict[str, tuple[str, bool]] = {
    "500px": ("oi_500px", False),
    "address-book": ("contact_page", True),
    "address-book-o": ("contact_page", False),
    "address-card": ("contact_mail", True),
    "address-card-o": ("contact_mail", False),
    "vcard": ("contact_mail", True),
    "vcard-o": ("contact_mail", False),
    "adjust": ("contrast", False),
    "adn": ("oi_adn", False),
    "align-center": ("format_align_center", False),
    "align-justify": ("format_align_justify", False),
    "align-left": ("format_align_left", False),
    "align-right": ("format_align_right", False),
    "amazon": ("oi_amazon", False),
    "ambulance": ("emergency", False),
    "american-sign-language-interpreting": ("sign_language", False),
    "asl-interpreting": ("sign_language", False),
    "anchor": ("anchor", False),
    "android": ("oi_android", False),
    "angellist": ("oi_angellist", False),
    "angle-double-down": ("keyboard_double_arrow_down", False),
    "angle-double-left": ("keyboard_double_arrow_left", False),
    "angle-double-right": ("keyboard_double_arrow_right", False),
    "angle-double-up": ("keyboard_double_arrow_up", False),
    "angle-down": ("keyboard_arrow_down", False),
    "angle-left": ("keyboard_arrow_left", False),
    "angle-right": ("keyboard_arrow_right", False),
    "angle-up": ("keyboard_arrow_up", False),
    "apple": ("oi_apple", False),
    "archive": ("archive", False),
    "area-chart": ("area_chart", False),
    "arrow-circle-down": ("arrow_circle_down", True),
    "arrow-circle-left": ("arrow_circle_left", True),
    "arrow-circle-o-down": ("arrow_circle_down", False),
    "arrow-circle-o-left": ("arrow_circle_left", False),
    "arrow-circle-o-right": ("arrow_circle_right", False),
    "arrow-circle-o-up": ("arrow_circle_up", False),
    "arrow-circle-right": ("arrow_circle_right", True),
    "arrow-circle-up": ("arrow_circle_up", True),
    "arrow-down": ("arrow_downward", False),
    "arrow-left": ("arrow_back", False),
    "arrow-right": ("arrow_forward", False),
    "arrow-up": ("arrow_upward", False),
    "arrows": ("open_with", False),
    "arrows-alt": ("fullscreen", False),
    "arrows-h": ("unfold_more", False),
    "arrows-v": ("unfold_more", False),
    "assistive-listening-systems": ("hearing", False),
    "asterisk": ("asterisk", False),
    "at": ("alternate_email", False),
    "audio-description": ("subtitles", False),
    "automobile": ("directions_car", False),
    "car": ("directions_car", False),
    "backward": ("fast_rewind", False),
    "balance-scale": ("balance", False),
    "ban": ("block", False),
    "bandcamp": ("oi_bandcamp", False),
    "bank": ("account_balance", False),
    "institution": ("account_balance", False),
    "university": ("account_balance", False),
    "bar-chart": ("bar_chart", False),
    "bar-chart-o": ("bar_chart", False),
    "barcode": ("barcode_scanner", False),
    "bars": ("menu", False),
    "navicon": ("menu", False),
    "reorder": ("reorder", False),
    "bath": ("bathtub", False),
    "bathtub": ("bathtub", False),
    "s15": ("bathtub", False),
    "battery": ("battery_full", True),
    "battery-4": ("battery_full", True),
    "battery-full": ("battery_full", True),
    "battery-0": ("battery_0_bar", True),
    "battery-empty": ("battery_0_bar", True),
    "battery-1": ("battery_1_bar", True),
    "battery-quarter": ("battery_1_bar", True),
    "battery-2": ("battery_3_bar", True),
    "battery-half": ("battery_3_bar", True),
    "battery-3": ("battery_5_bar", True),
    "battery-three-quarters": ("battery_5_bar", True),
    "bed": ("bed", False),
    "hotel": ("hotel", False),
    "beer": ("sports_bar", False),
    "behance": ("oi_behance", False),
    "behance-square": ("oi_behance", False),
    "bell": ("notifications", True),
    "bell-o": ("notifications", False),
    "bell-slash": ("notifications_off", True),
    "bell-slash-o": ("notifications_off", False),
    "bicycle": ("directions_bike", False),
    "binoculars": ("binoculars", False),
    "birthday-cake": ("cake", False),
    "bitbucket": ("oi_bitbucket", False),
    "bitbucket-square": ("oi_bitbucket", False),
    "bitcoin": ("currency_bitcoin", False),
    "btc": ("currency_bitcoin", False),
    "black-tie": ("oi_black-tie", False),
    "blind": ("blind", False),
    "bluetooth": ("bluetooth", False),
    "bluetooth-b": ("bluetooth", False),
    "bold": ("format_bold", False),
    "bolt": ("bolt", False),
    "flash": ("bolt", False),
    "glass": ("local_bar", False),
    "bomb": ("bomb", False),
    "book": ("book", False),
    "bookmark": ("bookmark", True),
    "bookmark-o": ("bookmark", False),
    "braille": ("braille", False),
    "briefcase": ("work", False),
    "bug": ("bug_report", False),
    "building": ("business", True),
    "building-o": ("business", False),
    "bullhorn": ("campaign", False),
    "bullseye": ("my_location", False),
    "bus": ("directions_bus", False),
    "cab": ("local_taxi", False),
    "taxi": ("local_taxi", False),
    "calculator": ("calculate", False),
    "calendar": ("calendar_today", True),
    "calendar-check-o": ("event_available", False),
    "calendar-minus-o": ("event_busy", False),
    "calendar-o": ("calendar_today", False),
    "calendar-plus-o": ("event_note", False),
    "calendar-times-o": ("event_busy", False),
    "camera": ("photo_camera", False),
    "camera-retro": ("photo_camera", False),
    "caret-down": ("arrow_drop_down", False),
    "caret-left": ("arrow_left", False),
    "caret-right": ("arrow_right", False),
    "caret-square-o-down": ("expand_more", False),
    "toggle-down": ("expand_more", False),
    "caret-square-o-left": ("chevron_left", False),
    "toggle-left": ("chevron_left", False),
    "caret-square-o-right": ("chevron_right", False),
    "toggle-right": ("chevron_right", False),
    "caret-square-o-up": ("expand_less", False),
    "toggle-up": ("expand_less", False),
    "caret-up": ("arrow_drop_up", False),
    "cart-arrow-down": ("shopping_cart", False),
    "cart-plus": ("add_shopping_cart", False),
    "certificate": ("verified", False),
    "chain": ("link", False),
    "link": ("link", False),
    "chain-broken": ("link_off", False),
    "unlink": ("link_off", False),
    "check": ("check", False),
    "check-circle": ("check_circle", True),
    "check-circle-o": ("check_circle", False),
    "check-square": ("check_box", True),
    "check-square-o": ("check_box", False),
    "chevron-circle-down": ("expand_circle_down", True),
    "chevron-circle-left": ("arrow_circle_left", True),
    "chevron-circle-right": ("arrow_circle_right", True),
    "chevron-circle-up": ("expand_circle_up", True),
    "chevron-down": ("expand_more", False),
    "chevron-left": ("chevron_left", False),
    "chevron-right": ("chevron_right", False),
    "chevron-up": ("expand_less", False),
    "child": ("child_care", False),
    "circle": ("circle", True),
    "circle-o": ("circle", False),
    "circle-o-notch": ("autorenew", False),
    "circle-thin": ("radio_button_unchecked", False),
    "clipboard": ("assignment", False),
    "clock-o": ("schedule", False),
    "clone": ("content_copy", False),
    "close": ("close", False),
    "remove": ("close", False),
    "times": ("close", False),
    "cloud": ("cloud", False),
    "cloud-download": ("cloud_download", False),
    "cloud-upload": ("cloud_upload", False),
    "code": ("code", False),
    "code-fork": ("call_split", False),
    "coffee": ("local_cafe", False),
    "cog": ("settings", True),
    "gear": ("settings", True),
    "cogs": ("settings", True),
    "gears": ("settings", True),
    "columns": ("view_column", False),
    "comment": ("chat_bubble", True),
    "comment-o": ("chat_bubble", False),
    "commenting": ("comment", True),
    "commenting-o": ("comment", False),
    "comments": ("forum", True),
    "comments-o": ("forum", False),
    "comment-o": ("chat_bubble", False),
    "compass": ("explore", False),
    "compress": ("close_fullscreen", False),
    "copy": ("content_copy", False),
    "copyright": ("copyright", False),
    "credit-card": ("credit_card", False),
    "credit-card-alt": ("credit_card", False),
    "crop": ("crop", False),
    "crosshairs": ("my_location", False),
    "cube": ("view_in_ar", False),
    "cubes": ("view_in_ar", False),
    "cutlery": ("restaurant", False),
    "dashboard": ("dashboard", False),
    "database": ("storage", False),
    "deaf": ("hearing_disabled", False),
    "deafness": ("hearing_disabled", False),
    "hard-of-hearing": ("hearing_disabled", False),
    "desktop": ("desktop_windows", False),
    "diamond": ("diamond", False),
    "dot-circle-o": ("radio_button_checked", False),
    "download": ("download", False),
    "dribbble": ("oi_dribbble", False),
    "dropbox": ("oi_dropbox", False),
    "drupal": ("oi_drupal", False),
    "edge": ("oi_edge", False),
    "edit": ("edit", True),
    "pencil": ("edit", True),
    "eject": ("eject", False),
    "ellipsis-h": ("more_horiz", False),
    "ellipsis-v": ("more_vert", False),
    "empire": ("oi_empire", False),
    "envelope": ("mail", False),
    "envelope-o": ("mail", False),
    "envelope-open": ("drafts", False),
    "envelope-open-o": ("drafts", False),
    "envelope-square": ("mail", False),
    "eraser": ("format_color_reset", False),
    "exchange": ("swap_horiz", False),
    "exclamation": ("priority_high", False),
    "exclamation-circle": ("error", True),
    "exclamation-triangle": ("warning", False),
    "warning": ("warning", False),
    "expand": ("expand_content", False),
    "external-link": ("open_in_new", False),
    "external-link-square": ("open_in_new", False),
    "eye": ("visibility", False),
    "eye-slash": ("visibility_off", False),
    "eyedropper": ("colorize", False),
    "facebook": ("oi_facebook", False),
    "facebook-f": ("oi_facebook", False),
    "facebook-official": ("oi_facebook", False),
    "facebook-square": ("oi_facebook", False),
    "fast-backward": ("first_page", False),
    "fast-forward": ("last_page", False),
    "fax": ("print", False),
    "female": ("face", False),
    "fighter-jet": ("flight", False),
    "file": ("description", True),
    "file-archive-o": ("folder_zip", False),
    "file-audio-o": ("audio_file", False),
    "file-code-o": ("code", False),
    "file-excel-o": ("table", False),
    "file-image-o": ("image", False),
    "file-movie-o": ("video_file", False),
    "file-o": ("description", False),
    "file-pdf-o": ("picture_as_pdf", False),
    "file-photo-o": ("image", False),
    "file-picture-o": ("image", False),
    "file-powerpoint-o": ("slideshow", False),
    "file-sound-o": ("audio_file", False),
    "file-text": ("article", True),
    "file-text-o": ("article", False),
    "file-video-o": ("video_file", False),
    "file-word-o": ("text_snippet", False),
    "file-zip-o": ("folder_zip", False),
    "files-o": ("file_copy", False),
    "film": ("movie", False),
    "filter": ("filter_alt", True),
    "fire": ("local_fire_department", False),
    "fire-extinguisher": ("fire_extinguisher", False),
    "firefox": ("oi_firefox", False),
    "flag": ("flag", False),
    "flag-checkered": ("flag", False),
    "flag-o": ("flag", False),
    "flask": ("science", False),
    "flickr": ("oi_flickr", False),
    "floppy-o": ("save", False),
    "folder": ("folder", True),
    "folder-o": ("folder", False),
    "folder-open": ("folder_open", True),
    "folder-open-o": ("folder_open", False),
    "font": ("font_download", False),
    "font-awesome": ("oi_font-awesome", False),
    "fonticons": ("oi_fonticons", False),
    "forward": ("fast_forward", False),
    "frown-o": ("sentiment_dissatisfied", False),
    "futbol-o": ("sports_soccer", False),
    "soccer-ball-o": ("sports_soccer", False),
    "gamepad": ("sports_esports", False),
    "gavel": ("gavel", False),
    "legal": ("gavel", False),
    "gift": ("card_giftcard", False),
    "git": ("oi_git", False),
    "git-square": ("oi_git", False),
    "github": ("oi_github", False),
    "github-alt": ("oi_github", False),
    "github-square": ("oi_github", False),
    "gitlab": ("oi_gitlab", False),
    "globe": ("language", False),
    "google": ("oi_google", False),
    "google-plus": ("oi_google-plus", False),
    "google-plus-circle": ("oi_google-plus", False),
    "google-plus-official": ("oi_google-plus", False),
    "google-plus-square": ("oi_google-plus", False),
    "google-wallet": ("oi_google-wallet", False),
    "graduation-cap": ("school", False),
    "mortar-board": ("school", False),
    "group": ("group", False),
    "users": ("group", False),
    "h-square": ("local_hospital", False),
    "hand-grab-o": ("back_hand", False),
    "hand-rock-o": ("back_hand", False),
    "hand-lizard-o": ("back_hand", False),
    "hand-o-down": ("arrow_downward", False),
    "hand-o-left": ("arrow_back", False),
    "hand-o-right": ("arrow_forward", False),
    "hand-o-up": ("arrow_upward", False),
    "hand-paper-o": ("back_hand", False),
    "hand-peace-o": ("back_hand", False),
    "hand-pointer-o": ("touch_app", False),
    "hand-scissors-o": ("back_hand", False),
    "hand-spock-o": ("back_hand", False),
    "hand-stop-o": ("back_hand", False),
    "handshake-o": ("handshake", False),
    "hashtag": ("tag", False),
    "hdd-o": ("storage", False),
    "header": ("title", False),
    "headphones": ("headphones", False),
    "heart": ("favorite", True),
    "heart-o": ("favorite", False),
    "heartbeat": ("monitor_heart", False),
    "history": ("history", False),
    "home": ("home", False),
    "html5": ("oi_html5", False),
    "id-badge": ("badge", False),
    "id-card": ("badge", True),
    "id-card-o": ("badge", False),
    "image": ("image", False),
    "instagram": ("oi_instagram", False),
    "pinterest": ("oi_pinterest", False),
    "tiktok": ("oi_tiktok", False),
    "discord": ("oi_discord", False),
    "photo": ("image", False),
    "picture-o": ("image", False),
    "inbox": ("inbox", False),
    "indent": ("format_indent_increase", False),
    "industry": ("factory", False),
    "info": ("info", False),
    "info-circle": ("info", True),
    "italic": ("format_italic", False),
    "joomla": ("oi_joomla", False),
    "key": ("key", False),
    "keyboard-o": ("keyboard", False),
    "language": ("translate", False),
    "laptop": ("laptop", False),
    "lastfm": ("oi_lastfm", False),
    "lastfm-square": ("oi_lastfm", False),
    "leaf": ("eco", False),
    "level-down": ("subdirectory_arrow_right", False),
    "level-up": ("subdirectory_arrow_left", False),
    "life-ring": ("support_agent", False),
    "life-bouy": ("support_agent", False),
    "life-buoy": ("support_agent", False),
    "life-saver": ("support_agent", False),
    "support": ("support_agent", False),
    "lightbulb-o": ("lightbulb", False),
    "line-chart": ("show_chart", False),
    "linkedin": ("oi_linkedin", False),
    "linkedin-square": ("oi_linkedin", False),
    "linux": ("oi_linux", False),
    "list": ("format_list_bulleted", False),
    "list-alt": ("format_list_bulleted", False),
    "list-ol": ("format_list_numbered", False),
    "list-ul": ("format_list_bulleted", False),
    "location-arrow": ("near_me", False),
    "lock": ("lock", False),
    "unlock": ("lock_open", False),
    "unlock-alt": ("lock_open", False),
    "long-arrow-down": ("arrow_downward", False),
    "long-arrow-left": ("arrow_back", False),
    "long-arrow-right": ("arrow_forward", False),
    "long-arrow-up": ("arrow_upward", False),
    "magic": ("wand_stars", False),
    "male": ("person", False),
    "map": ("map", True),
    "map-marker": ("location_on", False),
    "map-o": ("map", False),
    "map-pin": ("location_on", False),
    "map-signs": ("signpost", False),
    "mars": ("male", False),
    "medkit": ("medical_bag", False),
    "medium": ("oi_medium", False),
    "meh-o": ("sentiment_neutral", False),
    "microchip": ("memory", False),
    "microphone": ("mic", False),
    "microphone-slash": ("mic_off", False),
    "minus": ("remove", False),
    "minus-circle": ("do_not_disturb_on", True),
    "minus-square": ("indeterminate_check_box", True),
    "minus-square-o": ("indeterminate_check_box", False),
    "mobile": ("phone_android", False),
    "mobile-phone": ("phone_android", False),
    "money": ("payments", False),
    "moon-o": ("dark_mode", False),
    "motorcycle": ("two_wheeler", False),
    "mouse-pointer": ("arrow_selector_tool", False),
    "music": ("music_note", False),
    "newspaper-o": ("newspaper", False),
    "object-group": ("select_all", False),
    "object-ungroup": ("deselect", False),
    "opencart": ("oi_opencart", False),
    "opera": ("oi_opera", False),
    "outdent": ("format_indent_decrease", False),
    "dedent": ("format_indent_decrease", False),
    "paint-brush": ("brush", False),
    "paper-plane": ("send", True),
    "paper-plane-o": ("send", False),
    "paperclip": ("attach_file", False),
    "paragraph": ("format_textdirection_l_to_r", False),
    "paste": ("content_paste", False),
    "pause": ("pause", False),
    "pause-circle": ("pause_circle", True),
    "pause-circle-o": ("pause_circle", False),
    "paw": ("pets", False),
    "paypal": ("oi_paypal", False),
    "pencil-square": ("edit", True),
    "pencil-square-o": ("edit_square", False),
    "percent": ("percent", False),
    "phone": ("phone", False),
    "phone-square": ("phone", False),
    "pie-chart": ("pie_chart", True),
    "plane": ("travel", False),
    "play": ("play_arrow", False),
    "play-circle": ("play_circle", True),
    "play-circle-o": ("play_circle", False),
    "plug": ("electrical_services", False),
    "plus": ("add", False),
    "plus-circle": ("add_circle", True),
    "plus-square": ("add_box", True),
    "plus-square-o": ("add_box", False),
    "power-off": ("power_settings_new", False),
    "print": ("print", False),
    "puzzle-piece": ("extension", False),
    "qrcode": ("qr_code", False),
    "question": ("help_outline", False),
    "question-circle": ("help", True),
    "question-circle-o": ("help", False),
    "quote-left": ("format_quote", False),
    "quote-right": ("format_quote", False),
    "random": ("shuffle", False),
    "recycle": ("recycling", False),
    "reddit": ("oi_reddit", False),
    "reddit-alien": ("oi_reddit", False),
    "reddit-square": ("oi_reddit", False),
    "refresh": ("refresh", False),
    "repeat": ("redo", False),
    "reply": ("reply", False),
    "reply-all": ("reply_all", False),
    "retweet": ("repeat", False),
    "road": ("edit_road", False),
    "rocket": ("rocket_launch", False),
    "rss": ("rss_feed", False),
    "rss-square": ("rss_feed", False),
    "safari": ("oi_safari", False),
    "save": ("save", False),
    "scissors": ("content_cut", False),
    "search": ("search", False),
    "search-minus": ("zoom_out", False),
    "search-plus": ("zoom_in", False),
    "send": ("send", True),
    "send-o": ("send", False),
    "server": ("dns", False),
    "share": ("share", False),
    "share-alt": ("share", False),
    "share-alt-square": ("share", False),
    "share-square": ("open_in_new", False),
    "share-square-o": ("open_in_new", False),
    "shield": ("security", False),
    "ship": ("directions_boat", False),
    "shopping-bag": ("shopping_bag", False),
    "shopping-basket": ("shopping_basket", False),
    "shopping-cart": ("shopping_cart", False),
    "sign-in": ("login", False),
    "sign-out": ("logout", False),
    "signal": ("signal_cellular_4_bar", False),
    "sitemap": ("account_tree", False),
    "skype": ("oi_skype", False),
    "slack": ("oi_slack", False),
    "sliders": ("tune", False),
    "slideshare": ("oi_slideshare", False),
    "smile-o": ("sentiment_satisfied", False),
    "snapchat": ("oi_snapchat", False),
    "snapchat-ghost": ("oi_snapchat", False),
    "snowflake-o": ("ac_unit", False),
    "sort": ("swap_vert", False),
    "unsorted": ("swap_vert", False),
    "sort-alpha-asc": ("sort_by_alpha", False),
    "sort-alpha-desc": ("sort_by_alpha", False),
    "sort-amount-asc": ("sort", False),
    "sort-amount-desc": ("sort", False),
    "sort-asc": ("arrow_upward", False),
    "sort-up": ("arrow_upward", False),
    "sort-desc": ("arrow_downward", False),
    "sort-down": ("arrow_downward", False),
    "sort-numeric-asc": ("format_list_numbered", False),
    "sort-numeric-desc": ("format_list_numbered", False),
    "soundcloud": ("oi_soundcloud", False),
    "space-shuttle": ("rocket_launch", False),
    "spinner": ("autorenew", False),
    "spoon": ("restaurant", False),
    "spotify": ("oi_spotify", False),
    "square": ("check_box_outline_blank", False),
    "square-o": ("check_box_outline_blank", False),
    "star": ("star", True),
    "star-half": ("star_half", False),
    "star-half-empty": ("star_half", False),
    "star-half-full": ("star_half", False),
    "star-half-o": ("star_half", False),
    "star-o": ("star", False),
    "steam": ("oi_steam", False),
    "steam-square": ("oi_steam", False),
    "step-backward": ("skip_previous", False),
    "step-forward": ("skip_next", False),
    "stethoscope": ("stethoscope", False),
    "sticky-note": ("sticky_note_2", True),
    "sticky-note-o": ("sticky_note_2", False),
    "stop": ("stop", False),
    "stop-circle": ("stop_circle", True),
    "stop-circle-o": ("stop_circle", False),
    "street-view": ("streetview", False),
    "strikethrough": ("strikethrough_s", False),
    "subscript": ("subscript", False),
    "subway": ("subway", False),
    "suitcase": ("luggage", False),
    "sun-o": ("light_mode", False),
    "superscript": ("superscript", False),
    "table": ("table_chart", False),
    "tachometer": ("speed", False),
    "tablet": ("tablet", False),
    "tag": ("label", False),
    "tags": ("sell", False),
    "tasks": ("checklist", False),
    "telegram": ("oi_telegram", False),
    "television": ("tv", False),
    "tv": ("tv", False),
    "terminal": ("terminal", False),
    "th": ("grid_on", False),
    "th-large": ("view_module", False),
    "th-list": ("format_list_bulleted", False),
    "thermometer": ("device_thermostat", False),
    "thermometer-empty": ("device_thermostat", False),
    "thermometer-full": ("device_thermostat", False),
    "thermometer-half": ("device_thermostat", False),
    "thermometer-quarter": ("device_thermostat", False),
    "thermometer-three-quarters": ("device_thermostat", False),
    "thumb-tack": ("push_pin", False),
    "thumbs-down": ("thumb_down", True),
    "thumbs-o-down": ("thumb_down", False),
    "thumbs-o-up": ("thumb_up", False),
    "thumbs-up": ("thumb_up", True),
    "ticket": ("confirmation_number", False),
    "times-circle": ("cancel", True),
    "times-circle-o": ("cancel", False),
    "tint": ("water_drop", True),
    "toggle-off": ("toggle_off", True),
    "toggle-on": ("toggle_on", True),
    "train": ("train", False),
    "transgender": ("transgender", False),
    "transgender-alt": ("transgender", False),
    "trash": ("delete", True),
    "trash-o": ("delete", False),
    "tree": ("park", False),
    "trello": ("oi_trello", False),
    "trophy": ("trophy", False),
    "truck": ("local_shipping", False),
    "tumblr": ("oi_tumblr", False),
    "tumblr-square": ("oi_tumblr", False),
    "twitch": ("oi_twitch", False),
    "twitter": ("oi_twitter", False),
    "twitter-square": ("oi_twitter", False),
    "umbrella": ("umbrella", False),
    "underline": ("format_underlined", False),
    "undo": ("undo", False),
    "rotate-left": ("undo", False),
    "universal-access": ("accessibility", False),
    "upload": ("upload", False),
    "usd": ("attach_money", False),
    "dollar": ("attach_money", False),
    "user": ("person", True),
    "user-circle": ("account_circle", True),
    "user-circle-o": ("account_circle", False),
    "user-md": ("stethoscope", False),
    "user-o": ("person", False),
    "user-plus": ("person_add", False),
    "user-secret": ("person", False),
    "user-times": ("person_off", False),
    "video-camera": ("videocam", False),
    "vimeo": ("oi_vimeo", False),
    "vimeo-square": ("oi_vimeo", False),
    "vine": ("oi_vine", False),
    "vk": ("oi_vk", False),
    "volume-control-phone": ("phone_in_talk", False),
    "volume-down": ("volume_down", False),
    "volume-off": ("volume_off", False),
    "volume-up": ("volume_up", False),
    "weibo": ("oi_weibo", False),
    "whatsapp": ("oi_whatsapp", False),
    "wheelchair": ("accessible", False),
    "wheelchair-alt": ("accessible_forward", False),
    "wifi": ("wifi", False),
    "window-maximize": ("fullscreen", False),
    "window-minimize": ("minimize", False),
    "windows": ("oi_windows", False),
    "wordpress": ("oi_wordpress", False),
    "wrench": ("build", False),
    "xing": ("oi_xing", False),
    "xing-square": ("oi_xing", False),
    "yahoo": ("oi_yahoo", False),
    "yelp": ("oi_yelp", False),
    "youtube": ("oi_youtube", False),
    "youtube-play": ("oi_youtube", False),
    "youtube-square": ("oi_youtube", False),
}

# ---------------------------------------------------------------------------
# MAPPING: old oi-CLASSNAME → (new data-icon value, needs_oi_filled)
# Only includes icons explicitly converted in commit 7e41e08e.
# Icons still valid as CSS classes (oi-activity, oi-voip, etc.) are NOT here.
# ---------------------------------------------------------------------------
OI_CLASS_TO_DATAICON: dict[str, tuple[str, bool]] = {
    # Directional arrows
    "arrow-right": ("east", False),
    "arrow-left": ("west", False),
    "arrow-up": ("north", False),
    "arrow-down": ("south", False),
    "arrow-up-right": ("north_east", False),
    "arrow-down-right": ("south_east", False),
    "arrow-up-left": ("north_west", False),
    "arrow-down-left": ("south_west", False),
    # Chevrons
    "chevron-right": ("chevron_forward", False),
    "chevron-left": ("chevron_backward", False),
    "chevron-up": ("keyboard_arrow_up", False),
    "chevron-down": ("keyboard_arrow_down", False),
    # Common UI
    "close": ("close_small", False),
    "search": ("search", False),
    "launch": ("open_in_browser", False),
    "draggable": ("drag_indicator", False),
    "ellipsis-h": ("more_horiz", False),
    "ellipsis-v": ("more_vert", False),
    "plus": ("add", False),
    "minus": ("remove", False),
    # Archive
    "archive": ("archive", False),
    "unarchive": ("unarchive", False),
    # Schedule
    "schedule-today": ("early_on", False),
    "schedule-tomorrow": ("event_upcoming", False),
    "schedule-later": ("calendar_clock", False),
    # Misc
    "smile-add": ("add_reaction", False),
    "text-effect": ("stylus_laser_pointer", False),
    "gif-picker": ("gif_box", False),
    "users": ("group", False),
    "user-plus": ("person_add", False),
    "apps": ("apps", False),
    "panel-right": ("dock_to_right", False),
    "settings-adjust": ("tune", False),
    "arrows-h": ("arrow_range", False),
    "arrows-v": ("height", False),
    # View switchers
    "view-list": ("view_list", False),
    "view-kanban": ("oi_view-kanban", False),
    "view-pivot": ("oi_view-pivot", False),
    "view-cohort": ("oi_view-cohort", False),
    # HTML editor
    "bring-front": ("flip_to_front", False),
    "send-back": ("flip_to_back", False),
}

# fa-* modifier classes → their oi-* equivalents (not icons)
FA_UTIL_TO_OI = {
    "fw": "oi-fw",
    "spin": "oi-spin",
    "pulse": "oi-pulse",
    "lg": "oi-lg",
    "2x": "oi-2x",
    "3x": "oi-3x",
    "4x": "oi-4x",
    "5x": "oi-5x",
    "6x": "oi-6x",
    "7x": "oi-7x",
    "8x": "oi-8x",
    "9x": "oi-9x",
    "10x": "oi-10x",
    "stack": "oi-stack",
    "stack-1x": "oi-stack-1x",
    "stack-2x": "oi-stack-2x",
    # "inverse" → dropped (no oi equivalent)
}

# oi-* classes that are utility/modifier classes, NOT icon names
OI_UTIL_CLASSES = frozenset({
    "oi-fw", "oi-spin", "oi-pulse", "oi-filled", "oi-outlined", "oi-lg",
    "oi-2x", "oi-3x", "oi-4x", "oi-5x", "oi-6x", "oi-7x", "oi-8x",
    "oi-9x", "oi-10x", "oi-stack", "oi-stack-1x", "oi-stack-2x",
})


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def _build_new_oi_classes(
    extra_fa: list[str],     # fa-* modifier names (e.g. ["fw", "spin"])
    other: list[str],        # non-fa classes to keep (e.g. ["text-danger", "me-1"])
    needs_filled: bool,
    existing_oi_util: list[str] | None = None,  # already-oi modifiers to keep
) -> str:
    classes = ["oi"]
    for fa_mod in extra_fa:
        if fa_mod in FA_UTIL_TO_OI:
            classes.append(FA_UTIL_TO_OI[fa_mod])
    if existing_oi_util:
        for c in existing_oi_util:
            if c not in classes:
                classes.append(c)
    if needs_filled and "oi-filled" not in classes:
        classes.append("oi-filled")
    classes.extend(other)
    return " ".join(classes)


def _parse_fa_classes(classes: list[str]) -> tuple[str | None, list[str], list[str]]:
    """
    Split a list of classes into:
      fa_icon_name  – the fa-ICON part (without 'fa-')
      extra_fa      – fa modifier names (fw, spin, lg, etc.)
      other         – all remaining non-fa classes
    """
    fa_icon = None
    extra_fa = []
    other = []
    for cls in classes:
        if cls == "fa":
            continue
        if cls.startswith("fa-"):
            name = cls[3:]
            if name in FA_TO_MATERIAL:
                if fa_icon is None:
                    fa_icon = name
                else:
                    other.append(cls)  # second icon – keep as literal
            elif name in FA_UTIL_TO_OI:
                extra_fa.append(name)
            elif name == "inverse":
                pass  # drop
            else:
                other.append(cls)
        else:
            other.append(cls)
    return fa_icon, extra_fa, other


def _parse_oi_classes(classes: list[str]) -> tuple[str | None, list[str], list[str]]:
    """
    Split a list of oi-* classes into:
      oi_icon       – the old icon name (without 'oi-'), if in OI_CLASS_TO_DATAICON
      oi_util       – oi utility modifiers to keep (oi-fw etc.)
      other         – all remaining classes
    """
    oi_icon = None
    oi_util = []
    other = []
    for cls in classes:
        if cls == "oi":
            continue
        if cls.startswith("oi-"):
            name = cls[3:]
            if name in OI_CLASS_TO_DATAICON:
                if oi_icon is None:
                    oi_icon = name
                else:
                    other.append(cls)
            elif cls in OI_UTIL_CLASSES:
                oi_util.append(cls)
            else:
                other.append(cls)
        else:
            other.append(cls)
    return oi_icon, oi_util, other


# ---------------------------------------------------------------------------
# LOW-LEVEL SUBSTITUTION: class attribute value
# ---------------------------------------------------------------------------

def _new_class_and_icon_fa(class_val: str) -> tuple[str, str] | None:
    """
    For a class value string containing 'fa fa-ICON [...]', return
    (new_class_string, data_icon_value), or None if nothing to change.
    Already-converted strings (containing 'data-icon') are not processed here
    since the caller checks the surrounding element.
    """
    classes = class_val.split()
    if "fa" not in classes:
        return None

    fa_icon, extra_fa, other = _parse_fa_classes(classes)
    if fa_icon is None:
        return None

    material, needs_filled = FA_TO_MATERIAL[fa_icon]
    new_class = _build_new_oi_classes(extra_fa, other, needs_filled)
    return new_class, material


def _new_class_and_icon_oi(class_val: str) -> tuple[str, str] | None:
    """
    For a class value string containing 'oi oi-OLDNAME [...]', return
    (new_class_string, data_icon_value), or None if nothing to change.
    """
    classes = class_val.split()
    if "oi" not in classes:
        return None

    # Must have at least one old oi-ICON class
    oi_icon, oi_util, other = _parse_oi_classes(classes)
    if oi_icon is None:
        return None

    data_icon, needs_filled = OI_CLASS_TO_DATAICON[oi_icon]
    new_class = _build_new_oi_classes([], other, needs_filled, oi_util)
    return new_class, data_icon


# ---------------------------------------------------------------------------
# HTML/XML TAG-LEVEL REWRITING
# We match whole tags so we can insert data-icon next to the class attr.
# ---------------------------------------------------------------------------

# Tags that commonly carry icon classes
_TAG_NAMES = r"(?:i|span|button|a|div|em|b|t)"

# Matches a single tag (possibly multi-line inside the tag).
# Uses alternation to skip over quoted attribute values so that '>' characters
# inside quoted values (e.g. arrow functions: t-on-click="() => ...") do not
# terminate the match prematurely.
_TAG_ML_RE = re.compile(
    r'<(?:' + _TAG_NAMES + r')\b(?:[^>"\'\\]|"[^"]*"|\'[^\']*\')*>',
    re.DOTALL,
)

_CLASS_ATTR_RE = re.compile(r'\bclass=(["\'])(.*?)\1', re.DOTALL)
_DATA_ICON_RE = re.compile(r'\b(?:data-icon|t-att-data-icon|t-attf-data-icon)\s*=')
_T_ATT_CLASS_RE = re.compile(r'\bt-att-class=(["\'])(.*?)\1', re.DOTALL)
_T_ATTF_CLASS_RE = re.compile(r'\bt-attf-class=(["\'])(.*?)\1', re.DOTALL)


def _convert_static_fa_classes_to_oi(class_val: str) -> str | None:
    """
    Convert a static FA class string to OI utilities (for tags where the icon
    itself is provided via t-att-class / t-attf-class rather than a static class).
    Replaces 'fa' base class with 'oi', converts fa-fw/fa-lg etc. to oi-fw/oi-lg,
    and drops standalone fa-ICON entries (they will come from data-icon instead).
    Returns None if the class string does not contain the 'fa' base class.
    """
    classes = class_val.split()
    if "fa" not in classes:
        return None
    new_classes = ["oi"]
    for cls in classes:
        if cls == "fa":
            continue
        elif cls.startswith("fa-"):
            name = cls[3:]
            if name in FA_UTIL_TO_OI:
                new_classes.append(FA_UTIL_TO_OI[name])
            elif name in FA_TO_MATERIAL:
                pass  # icon handled via data-icon; drop from class
            else:
                new_classes.append(cls)
        else:
            new_classes.append(cls)
    return " ".join(new_classes)


def _map_quoted_icon_class(class_str: str) -> str | None:
    """
    Given a class string that may appear as a quoted literal inside a dynamic
    expression (e.g. 'fa-eye text-danger'), return the material icon name if it
    contains exactly one mappable fa-xxx or oi-xxx icon.  Returns None otherwise.
    """
    classes = class_str.split()
    icon = None
    for cls in classes:
        if cls in ("fa", "oi"):
            continue
        if cls.startswith("fa-"):
            name = cls[3:]
            if name in FA_TO_MATERIAL and icon is None:
                icon = FA_TO_MATERIAL[name][0]
        elif cls.startswith("oi-"):
            name = cls[3:]
            if name in OI_CLASS_TO_DATAICON and icon is None:
                icon = OI_CLASS_TO_DATAICON[name][0]
    return icon


def _rewrite_tatt_class_in_tag(tag: str) -> str:
    """
    Convert t-att-class="expr" to t-att-data-icon="mapped-expr" when the
    expression consists solely of quoted fa-xxx / oi-xxx icon class references.

    Handles ternary expressions like:
      t-att-class="x ? 'fa-eye' : 'fa-eye-slash'"
        → t-att-data-icon="x ? 'visibility' : 'visibility_off'"

    Also updates the static class= attribute (fa fa-fw → oi oi-fw) when the
    tag carries fa base classes whose icon comes from t-att-class.
    """
    # Skip if dynamic icon attr already present
    if re.search(r'\bt-att-data-icon\s*=', tag):
        return tag

    m = _T_ATT_CLASS_RE.search(tag)
    if not m:
        return tag

    quote = m.group(1)
    val = m.group(2)

    # Find all single-quoted string literals in the value and map them
    quoted_re = re.compile(r"'([^']*)'")
    quoted_strings = quoted_re.findall(val)
    if not quoted_strings:
        return tag

    mappings: dict[str, str] = {}
    for qs in quoted_strings:
        icon = _map_quoted_icon_class(qs)
        if icon is None:
            return tag  # at least one quoted string can't be mapped; bail out
        mappings[qs] = icon

    def replace_qs(rm: re.Match) -> str:
        original = rm.group(1)
        return f"'{mappings[original]}'" if original in mappings else rm.group(0)

    new_val = quoted_re.sub(replace_qs, val)
    new_attr = f"t-att-data-icon={quote}{new_val}{quote}"
    tag = tag[: m.start()] + new_attr + tag[m.end():]

    # Update static class= attribute: fa fa-fw → oi oi-fw
    cm = _CLASS_ATTR_RE.search(tag)
    if cm and "{" not in cm.group(2):
        converted = _convert_static_fa_classes_to_oi(cm.group(2))
        if converted is not None:
            cq = cm.group(1)
            tag = tag[: cm.start()] + f"class={cq}{converted}{cq}" + tag[cm.end():]

    return tag


def _rewrite_tattf_class_in_tag(tag: str) -> str:
    """
    Handle t-attf-class="..." attributes:

    1. Convert the static prefix from FA to OI utility classes.
       e.g. "fa fa-fw text-muted #{expr}" → "oi oi-fw text-muted #{expr}"

    2. When the dynamic #{...} / {{...}} parts contain quoted 'fa-xxx' icon
       references, extract them and add a t-attf-data-icon attribute.
       e.g. "oi oi-fw #{x ? 'fa-lock text-success' : 'fa-unlock text-warning'}"
         → static part unchanged (already oi-fw),
            t-attf-data-icon="{{x ? 'lock' : 'lock_open'}}"
       The icon reference is removed from the class expression; non-icon classes
       remain.
    """
    # Skip if dynamic icon attr already present
    if re.search(r'\bt-attf-data-icon\s*=', tag):
        return tag

    m = _T_ATTF_CLASS_RE.search(tag)
    if not m:
        return tag

    quote = m.group(1)
    val = m.group(2)

    # Step 1: convert the static part (everything before the first #{ or {{)
    dyn_re = re.compile(r'(#\{.*?\}|\{\{.*?\}\})', re.DOTALL)
    dyn_matches = list(dyn_re.finditer(val))
    static_prefix_end = dyn_matches[0].start() if dyn_matches else len(val)
    static_part = val[:static_prefix_end]
    rest_part = val[static_prefix_end:]

    new_static = static_part
    # If the static part itself carries a mappable fa-ICON / oi-ICON, capture it
    # so it can be emitted as a static data-icon attribute (the icon lives in the
    # static class, not in a dynamic expression).
    static_data_icon = None
    static_classes = static_part.split()
    if "fa" in static_classes or "oi" in static_classes:
        result = (
            _new_class_and_icon_fa(static_part.strip())
            or _new_class_and_icon_oi(static_part.strip())
        )
        if result:
            new_static_classes, static_data_icon = result
            trailing = static_part[len(static_part.rstrip()):]
            new_static = new_static_classes + trailing
        elif "fa" in static_classes:
            converted = _convert_static_fa_classes_to_oi(static_part.strip())
            if converted is not None:
                # Preserve trailing whitespace
                trailing = static_part[len(static_part.rstrip()):]
                new_static = converted + trailing

    new_val = new_static + rest_part

    # Step 2: if dynamic parts contain quoted 'fa-xxx' icon references, extract them
    if dyn_matches:
        quoted_re = re.compile(r"'([^']*)'")
        icon_expressions = []  # collected per dynamic block
        new_dynamic_parts = []

        for dm in dyn_matches:
            dyn_content = dm.group(0)
            # delimiters: #{...} or {{...}}
            if dyn_content.startswith("#{"):
                inner = dyn_content[2:-1]
                open_d, close_d = "#{", "}"
            else:
                inner = dyn_content[2:-2]
                open_d, close_d = "{{", "}}"

            quoted_strs = quoted_re.findall(inner)
            if not quoted_strs:
                icon_expressions.append(None)
                new_dynamic_parts.append((dm, dyn_content))
                continue

            # Try to map each quoted string: split into icon + non-icon residual
            icon_map: dict[str, str] = {}  # original → material icon name
            residuals: dict[str, str] = {}  # original → residual class string without icon
            all_mapped = True
            for qs in quoted_strs:
                classes = qs.split()
                icon_cls = None
                other_cls = []
                for cls in classes:
                    if cls in ("fa", "oi"):
                        continue
                    if cls.startswith("fa-"):
                        name = cls[3:]
                        if name in FA_TO_MATERIAL and icon_cls is None:
                            icon_cls = FA_TO_MATERIAL[name][0]
                            continue
                    elif cls.startswith("oi-"):
                        name = cls[3:]
                        if name in OI_CLASS_TO_DATAICON and icon_cls is None:
                            icon_cls = OI_CLASS_TO_DATAICON[name][0]
                            continue
                    other_cls.append(cls)
                if icon_cls is None:
                    all_mapped = False
                    break
                icon_map[qs] = icon_cls
                residuals[qs] = " ".join(other_cls)

            if not all_mapped:
                icon_expressions.append(None)
                new_dynamic_parts.append((dm, dyn_content))
                continue

            # Build the icon expression (replace quoted strings with icon names)
            def _icon_sub(rm: re.Match, _imap: dict = icon_map) -> str:
                orig = rm.group(1)
                return f"'{_imap[orig]}'" if orig in _imap else rm.group(0)

            icon_inner = quoted_re.sub(_icon_sub, inner)
            icon_expressions.append(f"{open_d}{icon_inner}{close_d}")

            # Build the residual class expression (remove icon tokens from quoted strings)
            def _class_sub(rm: re.Match, _res: dict = residuals) -> str:
                orig = rm.group(1)
                if orig in _res:
                    residual = _res[orig]
                    return f"'{residual}'" if residual else "''"
                return rm.group(0)

            new_dyn_inner = quoted_re.sub(_class_sub, inner)
            new_dynamic_parts.append((dm, f"{open_d}{new_dyn_inner}{close_d}"))

        # If we got icon expressions for ALL dynamic blocks, create t-attf-data-icon
        valid_icons = [e for e in icon_expressions if e is not None]
        if valid_icons and len(valid_icons) == len(dyn_matches):
            # Reconstruct the t-attf-class value with residual class content
            reconstructed = new_static
            last_end = static_prefix_end
            for (dm, new_dyn), icon_expr in zip(new_dynamic_parts, icon_expressions):
                reconstructed += val[last_end:dm.start()] + new_dyn
                last_end = dm.end()
            reconstructed += val[last_end:]
            new_val = reconstructed

            # Combine multiple icon exprs if more than one dynamic block (rare)
            icon_attr_val = valid_icons[0] if len(valid_icons) == 1 else " ".join(valid_icons)
            new_tag = tag[: m.start()] + f"t-attf-class={quote}{new_val}{quote}" + tag[m.end():]
            # Insert t-attf-data-icon BEFORE the closing > of the tag
            if new_tag.endswith("/>"):
                new_tag = new_tag[:-2] + f' t-attf-data-icon="{icon_attr_val}"/>'
            elif new_tag.endswith(">"):
                new_tag = new_tag[:-1] + f' t-attf-data-icon="{icon_attr_val}">'
            return new_tag

    # If no icon extraction, just update the static prefix
    new_tag = tag
    if new_val != val:
        new_tag = tag[: m.start()] + f"t-attf-class={quote}{new_val}{quote}" + tag[m.end():]

    # Also update the static class= attribute (fa fa-fw → oi oi-fw)
    cm = _CLASS_ATTR_RE.search(new_tag)
    if cm and "{" not in cm.group(2):
        converted = _convert_static_fa_classes_to_oi(cm.group(2))
        if converted is not None:
            cq = cm.group(1)
            new_tag = new_tag[: cm.start()] + f"class={cq}{converted}{cq}" + new_tag[cm.end():]

    # If the icon lived in the static class part, emit it as a static data-icon.
    if static_data_icon is not None and not _DATA_ICON_RE.search(new_tag):
        if new_tag.endswith("/>"):
            new_tag = new_tag[:-2] + f' data-icon="{static_data_icon}"/>'
        elif new_tag.endswith(">"):
            new_tag = new_tag[:-1] + f' data-icon="{static_data_icon}">'

    return new_tag


def _rewrite_tag(tag: str) -> str:
    """Rewrite a single HTML/XML tag, converting fa/oi icon classes."""
    # Handle static class= (skip if data-icon already present)
    if not _DATA_ICON_RE.search(tag):
        cm = _CLASS_ATTR_RE.search(tag)
        if cm:
            quote = cm.group(1)
            class_val = cm.group(2)
            if "{" not in class_val:
                result = _new_class_and_icon_fa(class_val) or _new_class_and_icon_oi(class_val)
                if result:
                    new_class, data_icon = result
                    new_class_attr = f'class={quote}{new_class}{quote} data-icon={quote}{data_icon}{quote}'
                    tag = tag[: cm.start()] + new_class_attr + tag[cm.end():]

    # Handle t-att-class= (dynamic icon class expressions)
    tag = _rewrite_tatt_class_in_tag(tag)

    # Handle t-attf-class= (QWeb interpolated class attributes)
    tag = _rewrite_tattf_class_in_tag(tag)

    return tag


def _rewrite_tags(content: str) -> str:
    """Apply tag-level rewrites across the whole file content."""
    return _TAG_ML_RE.sub(lambda m: _rewrite_tag(m.group(0)), content)


# ---------------------------------------------------------------------------
# icon= ATTRIBUTE (XML buttons, stat buttons, fields)
# ---------------------------------------------------------------------------

_FA_SIZE_TO_OI = {
    "fa-lg": "oi-lg", "fa-sm": "oi-sm", "fa-xs": "oi-xs",
    "fa-2x": "oi-2x", "fa-3x": "oi-3x", "fa-4x": "oi-4x",
    "fa-5x": "oi-5x", "fa-6x": "oi-6x",
}


def _icon_attr_rewrite_classes(parts: list[str]) -> tuple[str | None, list[str]]:
    """Given a list of class tokens from an icon= value, return (material_name, extra_classes).

    extra_classes contains non-icon utility tokens (text-*, oi-*, size modifiers etc.).
    Returns (None, []) if no mappable FA icon found.
    """
    material: str | None = None
    needs_filled = False
    extra: list[str] = []
    for tok in parts:
        if tok in ("fa", "oi"):
            continue  # base prefix class — drop
        if tok.startswith("fa-") and tok[3:] in FA_TO_MATERIAL:
            material, needs_filled = FA_TO_MATERIAL[tok[3:]]
        elif tok in _FA_SIZE_TO_OI:
            extra.append(_FA_SIZE_TO_OI[tok])
        elif tok == "fa-fw":
            extra.append("oi-fw")
        elif tok.startswith("fa-"):
            pass  # unknown fa-xxx modifier — drop (e.g. fa-solid, fa-icon)
        elif tok.startswith("oi-"):
            # keep oi- utility tokens that aren't icon names
            if tok[3:] not in OI_CLASS_TO_DATAICON:
                extra.append(tok)
        else:
            extra.append(tok)  # preserve other tokens (e.g. text-danger, pe-1)
    if material and needs_filled:
        extra = ["oi-filled"] + extra
    return material, extra


def _icon_attr_sub(m: re.Match) -> str:
    """Rewrite a single icon= attribute match.

    Handles both plain XML format (icon="fa-xxx text-danger") and OWL prop
    format with inner single-quotes (icon="'fa-xxx'" or icon="'fa fa-fw fa-xxx'").
    """
    before_eq = m.group(1) + m.group(2) + m.group(3)
    outer_quote = m.group(4)
    val = m.group(5)
    # m.group(6) is the closing quote — we reconstruct it ourselves
    after = m.group(7) or ""

    # Already has icon_class or className nearby → skip adding icon_class
    has_icon_class = bool(re.search(r'\b(?:icon_class|className)\s*=', after[:160]))

    # Detect OWL inner-single-quote format: icon="'fa-xxx ...'"
    owl_format = val.startswith("'") and val.endswith("'")
    inner = val[1:-1] if owl_format else val

    parts = inner.split()
    if not parts:
        return m.group(0)

    # Check if it's a plain material/oi name already (starts with oi- icon name)
    if not owl_format:
        for p in parts:
            if p.startswith("oi-") and p[3:] in OI_CLASS_TO_DATAICON:
                data_icon, _ = OI_CLASS_TO_DATAICON[p[3:]]
                return f'{before_eq}{outer_quote}{data_icon}{outer_quote}{after}'

    material, extra = _icon_attr_rewrite_classes(parts)
    if material is None:
        return m.group(0)

    if owl_format:
        new_icon_val = f"'{material}'"
        icon_class_val = f"'{ ' '.join(extra) }'" if extra else None
    else:
        new_icon_val = material
        icon_class_val = " ".join(extra) if extra else None

    result = f'{before_eq}{outer_quote}{new_icon_val}{outer_quote}'
    if icon_class_val and not has_icon_class:
        result += f' icon_class="{icon_class_val}"'
    return result + after


_ICON_ATTR_RE = re.compile(
    r"(\s+)(icon)(=\s*)(\")((?:'[^']*'|[\w\s_-]+))(\")((?:[^>\"']*(?!icon))*)",
    re.DOTALL,
)


def _rewrite_icon_attrs(content: str) -> str:
    """Rewrite icon= attribute values in the whole content."""
    return _ICON_ATTR_RE.sub(_icon_attr_sub, content)


# ---------------------------------------------------------------------------
# JS / TS: icon property strings and CSS selectors
# ---------------------------------------------------------------------------

# icon: "fa fa-NAME" or icon: "fa-NAME" or 'icon': 'fa fa-NAME' (Python dict style)
_JS_ICON_PROP_RE = re.compile(
    r'(\bicon\b["\']?\s*:\s*)(["\'])((?:fa|oi)[\w\s-]*)(["\'])'
)
# Also prefixIcon: and iconClass: — with optional closing quote on the key (Python dict style)
_JS_ICON_FIELD_RE = re.compile(
    r'(\b(?:icon|prefixIcon|iconClass|titleIcon|done_icon)\b["\']?\s*:\s*)(["\'])((?:fa|oi)[\w\s-]*)(["\'])'
)
# icon= attribute in JS template strings (same as XML)
# icon: "VALUE" where value is a simple fa/oi class string
_JS_ICON_ASSIGN_RE = re.compile(
    r'(\bicon\b\s*=\s*)(["\'])((?:fa|oi)[\w\s-]*)(["\'])'
)


def _js_icon_sub(m: re.Match) -> str:
    prefix = m.group(1)
    quote = m.group(2)
    val = m.group(3)
    end = m.group(4)

    if val.startswith("fa ") or val.startswith("fa-"):
        # Extract icon name
        parts = val.split()
        fa_icon = next(
            (p[3:] for p in parts if p.startswith("fa-") and p[3:] in FA_TO_MATERIAL),
            None,
        )
        if fa_icon:
            material, _ = FA_TO_MATERIAL[fa_icon]
            return f"{prefix}{quote}{material}{end}"
    elif val.startswith("oi ") or val.startswith("oi-"):
        parts = val.split()
        for p in parts:
            if p.startswith("oi-") and p[3:] in OI_CLASS_TO_DATAICON:
                data_icon, _ = OI_CLASS_TO_DATAICON[p[3:]]
                return f"{prefix}{quote}{data_icon}{end}"

    return m.group(0)


# CSS selector .fa-ICON (in test files: await contains(".fa-close").click())
# Lookbehind allows: punctuation, quotes, whitespace, or word chars (for span.fa-glass style selectors)
_CSS_SEL_FA_RE = re.compile(r'(?<=[.(\'"`\s\w])\.fa-([\w-]+)(?=[.\s\'"`()\[\]:,>~+]|$)')
_CSS_SEL_OI_RE = re.compile(r'(?<=[.(\'"`\s\w])\.oi-([\w-]+)(?=[.\s\'"`()\[\]:,>~+]|$)')
# Combined .fa.fa-xxx pattern (e.g. i.fa.fa-check) - replaces the .fa.fa-xxx part with [data-icon='xxx']
_CSS_SEL_FA_FA_RE = re.compile(r'\.fa\.fa-([\w-]+)')


def _css_sel_fa_sub(m: re.Match) -> str:
    name = m.group(1)
    if name in FA_TO_MATERIAL:
        return f"[data-icon='{FA_TO_MATERIAL[name][0]}']"
    if name in FA_UTIL_TO_OI:
        return f".{FA_UTIL_TO_OI[name]}"
    return m.group(0)


def _css_sel_oi_sub(m: re.Match) -> str:
    name = m.group(1)
    if name in OI_CLASS_TO_DATAICON:
        return f"[data-icon='{OI_CLASS_TO_DATAICON[name][0]}']"
    return m.group(0)


def _css_sel_fa_fa_sub(m: re.Match) -> str:
    """Replace .fa.fa-xxx with [data-icon='material'] (used in chained selectors)."""
    name = m.group(1)
    if name in FA_TO_MATERIAL:
        return f"[data-icon='{FA_TO_MATERIAL[name][0]}']"
    return m.group(0)


# ---------------------------------------------------------------------------
# PYTHON-SPECIFIC: icon/iconClass dict entries
# ---------------------------------------------------------------------------

# 'iconClass': 'fa-ICON'  →  'icon': 'MATERIAL' [, 'iconClass': 'oi-filled']
_PY_ICONCLASS_RE = re.compile(r"""(['"])iconClass\1\s*:\s*(['"])fa-([\w-]+)\2""")
# "icon": "fa-ICON"  or  'icon': 'fa fa-ICON'
_PY_ICON_FA_RE = re.compile(r"""(['"])icon\1\s*:\s*(['"])(fa[\w\s-]+)\2""")
# 'icon': 'oi oi-ICON'
_PY_ICON_OI_RE = re.compile(r"""(['"])icon\1\s*:\s*(['"])(oi[\w\s-]+)\2""")


def _py_iconclass_sub(m: re.Match) -> str:
    q1 = m.group(1)
    q2 = m.group(2)
    fa_name = m.group(3)
    if fa_name in FA_TO_MATERIAL:
        material, needs_filled = FA_TO_MATERIAL[fa_name]
        if needs_filled:
            return f"{q1}icon{q1}: {q2}{material}{q2}, {q1}iconClass{q1}: {q2}oi-filled{q2}"
        return f"{q1}icon{q1}: {q2}{material}{q2}"
    return m.group(0)


def _py_icon_fa_sub(m: re.Match) -> str:
    q1 = m.group(1)
    q2 = m.group(2)
    val = m.group(3)
    parts = val.split()
    fa_icon = next(
        (p[3:] for p in parts if p.startswith("fa-") and p[3:] in FA_TO_MATERIAL),
        None,
    )
    if fa_icon:
        material, needs_filled = FA_TO_MATERIAL[fa_icon]
        if needs_filled:
            return f"{q1}icon{q1}: {q2}{material}{q2}, {q1}iconClass{q1}: {q2}oi-filled{q2}"
        return f"{q1}icon{q1}: {q2}{material}{q2}"
    return m.group(0)


def _py_icon_oi_sub(m: re.Match) -> str:
    q1 = m.group(1)
    q2 = m.group(2)
    val = m.group(3)
    parts = val.split()
    for p in parts:
        if p.startswith("oi-") and p[3:] in OI_CLASS_TO_DATAICON:
            data_icon, _ = OI_CLASS_TO_DATAICON[p[3:]]
            return f"{q1}icon{q1}: {q2}{data_icon}{q2}"
    return m.group(0)


# ---------------------------------------------------------------------------
# SCSS/CSS SELECTORS
# ---------------------------------------------------------------------------

# i.fa → i.oi
_SCSS_IFA_RE = re.compile(r'\bi\.fa\b(?!-)')
# .fa { or , .fa { → .oi  (standalone .fa without a suffix)
_SCSS_DOT_FA_RE = re.compile(r'(?<!["\'\w])\.fa\b(?!-)')
# .fa-ICON used as selector
_SCSS_SEL_FA_RE = re.compile(r'(?<!["\'])\.fa-([\w-]+)')
# .oi-ICON used as selector (but not .oi-fw etc. utility classes)
_SCSS_SEL_OI_RE = re.compile(r'(?<!["\'])\.oi-([\w-]+)')


def _scss_sel_fa(m: re.Match) -> str:
    name = m.group(1)
    if name in FA_TO_MATERIAL:
        return f"[data-icon='{FA_TO_MATERIAL[name][0]}']"
    return m.group(0)


def _scss_sel_oi(m: re.Match) -> str:
    name = m.group(1)
    if name in OI_CLASS_TO_DATAICON:
        return f"[data-icon='{OI_CLASS_TO_DATAICON[name][0]}']"
    return m.group(0)


# ---------------------------------------------------------------------------
# PER-FILE-TYPE TRANSFORMERS
# ---------------------------------------------------------------------------

# data-icon="fa-xxx" on s_rating elements → data-rating-icon="xxx" (strip fa- prefix)
_S_RATING_DATA_ICON_SIMPLE_RE = re.compile(
    r'(<[^>]*\bclass="[^"]*s_rating[^"]*"[^>]*)\bdata-icon="fa-([a-z][a-z0-9-]*)"'
)


def transform_xml(content: str) -> str:
    content = _rewrite_tags(content)
    content = _rewrite_icon_attrs(content)
    content = _S_RATING_DATA_ICON_SIMPLE_RE.sub(
        lambda m: m.group(1) + f'data-rating-icon="{m.group(2)}"', content
    )
    return content


def _rewrite_css_selectors_in_js(content: str) -> str:
    """Apply CSS selector rewrites to JS content, using quote style opposite to the enclosing string.

    When a CSS selector like [data-icon='edit'] is inserted inside a single-quoted
    JS string, it breaks the syntax. This function processes each string section
    separately so the inner CSS attribute quotes don't conflict with the outer JS string.
    """
    # We'll build the result by scanning char by char for string delimiters.
    # This is simple enough for our use case since we don't need full JS parsing.
    result = []
    i = 0
    n = len(content)

    while i < n:
        # Look for the start of a quoted string or the end of content
        m = re.search(r'[\'"`]', content[i:])
        if not m:
            # No more quoted strings — apply substitutions directly
            chunk = content[i:]
            chunk = _CSS_SEL_FA_FA_RE.sub(_css_sel_fa_fa_sub, chunk)
            chunk = _CSS_SEL_FA_RE.sub(_css_sel_fa_sub, chunk)
            chunk = _CSS_SEL_OI_RE.sub(_css_sel_oi_sub, chunk)
            result.append(chunk)
            break

        # Content before this string — apply substitutions
        before = content[i:i + m.start()]
        before = _CSS_SEL_FA_FA_RE.sub(_css_sel_fa_fa_sub, before)
        before = _CSS_SEL_FA_RE.sub(_css_sel_fa_sub, before)
        before = _CSS_SEL_OI_RE.sub(_css_sel_oi_sub, before)
        result.append(before)
        i += m.start()

        delim = content[i]
        # Find end of this quoted string (handle escape sequences)
        j = i + 1
        while j < n:
            c = content[j]
            if c == '\\':
                j += 2
                continue
            if c == delim:
                j += 1
                break
            if delim != '`' and c == '\n':
                # Unterminated single/double-quoted string (newline) - bail out
                break
            j += 1

        str_content = content[i:j]
        # Use the opposite quote style for data-icon CSS attribute selectors
        attr_q = '"' if delim == "'" else "'"

        def _fa_fa_sub_q(m2: re.Match) -> str:
            name = m2.group(1)
            if name in FA_TO_MATERIAL:
                return f"[data-icon={attr_q}{FA_TO_MATERIAL[name][0]}{attr_q}]"
            return m2.group(0)

        def _fa_sub_q(m2: re.Match) -> str:
            name = m2.group(1)
            if name in FA_TO_MATERIAL:
                return f"[data-icon={attr_q}{FA_TO_MATERIAL[name][0]}{attr_q}]"
            if name in FA_UTIL_TO_OI:
                return f".{FA_UTIL_TO_OI[name]}"
            return m2.group(0)

        def _oi_sub_q(m2: re.Match) -> str:
            name = m2.group(1)
            if name in OI_CLASS_TO_DATAICON:
                return f"[data-icon={attr_q}{OI_CLASS_TO_DATAICON[name][0]}{attr_q}]"
            return m2.group(0)

        str_content = _CSS_SEL_FA_FA_RE.sub(_fa_fa_sub_q, str_content)
        str_content = _CSS_SEL_FA_RE.sub(_fa_sub_q, str_content)
        str_content = _CSS_SEL_OI_RE.sub(_oi_sub_q, str_content)
        result.append(str_content)
        i = j

    return ''.join(result)


def transform_js(content: str) -> str:
    # Embedded HTML in template literals / markup`` helpers
    content = _rewrite_tags(content)
    content = _rewrite_icon_attrs(content)
    # JS icon property strings
    content = _JS_ICON_FIELD_RE.sub(_js_icon_sub, content)
    content = _JS_ICON_ASSIGN_RE.sub(_js_icon_sub, content)
    # CSS selectors in test helpers (contains(".fa-close"), etc.)
    # Context-aware to avoid quote conflicts inside single/double quoted strings
    content = _rewrite_css_selectors_in_js(content)
    return content


def transform_python(content: str) -> str:
    # Embedded HTML in Markup()
    content = _rewrite_tags(content)
    # Python dict icon entries
    content = _PY_ICONCLASS_RE.sub(_py_iconclass_sub, content)
    content = _PY_ICON_FA_RE.sub(_py_icon_fa_sub, content)
    content = _PY_ICON_OI_RE.sub(_py_icon_oi_sub, content)
    return content


def transform_scss(content: str) -> str:
    content = _SCSS_IFA_RE.sub("i.oi", content)
    content = _SCSS_DOT_FA_RE.sub(".oi", content)
    content = _SCSS_SEL_FA_RE.sub(_scss_sel_fa, content)
    content = _SCSS_SEL_OI_RE.sub(_scss_sel_oi, content)
    return content


TRANSFORMERS: dict[str, callable] = {
    ".xml": transform_xml,
    ".html": transform_xml,
    ".js": transform_js,
    ".ts": transform_js,
    ".py": transform_python,
    ".scss": transform_scss,
    ".css": transform_scss,
}

# ---------------------------------------------------------------------------
# FILE PROCESSING
# ---------------------------------------------------------------------------


def process_file(path: Path, check_only: bool = False) -> bool:
    suffix = path.suffix.lower()
    transformer = TRANSFORMERS.get(suffix)
    if not transformer:
        return False

    try:
        original = path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        print(f"  ERROR reading {path}: {e}", file=sys.stderr)
        return False

    transformed = transformer(original)

    if transformed == original:
        return False

    if check_only:
        orig_lines = original.splitlines()
        new_lines = transformed.splitlines()
        diffs = sum(1 for a, b in zip(orig_lines, new_lines) if a != b)
        diffs += abs(len(orig_lines) - len(new_lines))
        print(f"  WOULD CHANGE  {path}  ({diffs} lines)")
        return True

    try:
        path.write_text(transformed, encoding="utf-8")
        print(f"  CHANGED  {path}")
    except OSError as e:
        print(f"  ERROR writing {path}: {e}", file=sys.stderr)
        return False

    return True


def get_git_changed_files(base_dir: Path) -> list[Path]:
    files: list[Path] = []
    cmds = [
        ["git", "diff", "--name-only", "HEAD"],
        ["git", "diff", "--name-only", "--cached"],
        ["git", "ls-files", "--others", "--exclude-standard"],
    ]
    for cmd in cmds:
        try:
            out = subprocess.check_output(
                cmd, cwd=base_dir, text=True, stderr=subprocess.DEVNULL
            )
            for line in out.splitlines():
                p = base_dir / line.strip()
                if p.suffix.lower() in TRANSFORMERS and p.is_file():
                    files.append(p)
        except subprocess.CalledProcessError:
            pass
    # Deduplicate preserving order
    seen: set[Path] = set()
    result: list[Path] = []
    for f in files:
        if f not in seen:
            seen.add(f)
            result.append(f)
    return result


def collect_files(paths: list[str], base_dir: Path) -> list[Path]:
    result: list[Path] = []
    for p_str in paths:
        p = Path(p_str)
        if not p.is_absolute():
            p = base_dir / p
        if p.is_file():
            if p.suffix.lower() in TRANSFORMERS:
                result.append(p)
        elif p.is_dir():
            for suffix in TRANSFORMERS:
                result.extend(sorted(p.rglob(f"*{suffix}")))
    return result


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Migrate legacy fa-*/oi-* icon patterns to data-icon system.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Preview what would be changed without modifying any file.",
    )
    parser.add_argument(
        "--all",
        dest="all_dir",
        metavar="DIR",
        help="Process ALL eligible files under DIR recursively.",
    )
    parser.add_argument(
        "files",
        nargs="*",
        help="Files or directories to process. Defaults to git-changed files.",
    )
    args = parser.parse_args()

    base_dir = Path.cwd()

    if args.all_dir:
        files = collect_files([args.all_dir], base_dir)
    elif args.files:
        files = collect_files(args.files, base_dir)
    else:
        files = get_git_changed_files(base_dir)
        if not files:
            print(
                "No git-changed files found. "
                "Use --all DIR or pass file paths explicitly."
            )
            return

    if not files:
        print("No eligible files found.")
        return

    changed = 0
    blacklist = (
        # Get stuck at that file for some reason
        'addons/base_setup/tests/test_res_config_doc_links.py',
    )
    print(f"Processing {len(files)} files...\n")
    for f in sorted(set(files)):
        if str(f).endswith(blacklist):
            print(f"Skipping blacklisted file {f}...")
            continue
        if process_file(f, check_only=args.check):
            changed += 1

    action = "would be changed" if args.check else "changed"
    print(f"\n{changed}/{len(files)} files {action}.")


if __name__ == "__main__":
    main()
