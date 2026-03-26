# !/bin/bash

curl 'http://localhost:8069/web/assets/debug/spreadsheet.o_spreadsheet_engine.js' \
  -H 'Accept: */*' \
  -H 'Accept-Language: fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7' \
  -H 'Cache-Control: no-cache' \
  -H 'Connection: keep-alive' \
  -b 'frontend_lang=en_US; tz=Europe/Brussels; session_id=YdDD2YNBHpfPRBNQY-GUf9kk_nsGN2Fr_Rh_fWUnrMUUuLJSB1WGbQyr1wAwbVbxx4zL0NMBGvD20R-jSgwXog; cids=21; color_scheme=dark' \
  -H 'Pragma: no-cache' \
  -H 'Referer: http://localhost:8069/odoo?debug=assets' \
  -H 'Sec-Fetch-Dest: script' \
  -H 'Sec-Fetch-Mode: no-cors' \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36' \
  -H 'sec-ch-ua: "Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "Linux"'  > ../spreadsheet.o_spreadsheet_engine.js

node ../spreadsheet.o_spreadsheet_engine.js