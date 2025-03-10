# Start Openbox on the second display as described in 
# http://openbox.org/wiki/Help:FAQ > "How do I run Openbox across multiple X screens?"

XAUTHORITY=/run/lightdm/odoo/xauthority DISPLAY=:0.1 openbox & 
exec openbox-session
