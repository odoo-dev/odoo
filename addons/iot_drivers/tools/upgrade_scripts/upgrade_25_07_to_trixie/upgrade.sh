#!/usr/bin/env bash
set -o errexit
set -o nounset
set -o pipefail

logfile=/home/pi/upgrade.log
exec 3>&1 4>&2
trap 'exec 2>&4 1>&3' 0 1 2 3
exec > >(tee -a "$logfile") 2>&1  # Print to stdout and logfile
set -x                            # display commands before execution

# Commands to upgrade IoT 25.07 to Raspbian 13 Trixie

# Setup chroot
sudo mount -o remount,rw / && sudo mount -o remount,rw /root_bypass_ramdisks
cd /root_bypass_ramdisks/
sudo mount -t proc /proc proc/
sudo mount -t sysfs /sys sys/
sudo mount --rbind /dev dev/
sudo chroot /root_bypass_ramdisks/ /home/pi/upgrade_chroot.sh

# Checkout master
cd /home/pi/odoo
sudo -u odoo git remote set-url origin https://github.com/odoo/odoo.git
# TODO: change to saas-19.1
sudo -u odoo git fetch origin master --depth=1 --prune
sudo -u odoo git reset --hard FETCH_HEAD
sudo -u odoo git branch -m master

# Copy service scripts to /etc
sudo cp /home/pi/odoo/setup/iot_box_builder/overwrite_after_init/etc/setup_ramdisks.sh /root_bypass_ramdisks/etc/setup_ramdisks.sh
sudo cp /home/pi/odoo/setup/iot_box_builder/overwrite_after_init/etc/led_manager.sh /root_bypass_ramdisks/etc/led_manager.sh

# Reinstall PIP packages
sudo mount -o remount,rw / && sudo mount -o remount,rw /root_bypass_ramdisks
sudo -u odoo pip install --break-system-packages -r /home/pi/odoo/setup/iot_box_builder/configuration/requirements.txt

set +x

echo -e "\nThe upgrade to Raspbian Trixie was completed successfully."
echo -e "Odoo is now checked out in master.\n"
echo -e "Please reboot and ensure everything is working correctly.\n"