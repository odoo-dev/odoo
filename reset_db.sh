#!/bin/bash
if [ -z "$1" ]; then
    echo "Usage: ./reset_db.sh <db_name>"
    exit 1
fi
DB_NAME=$1
echo "======================================"
echo "1. Dropping existing database ($DB_NAME)..."
echo "======================================"
dropdb $DB_NAME --if-exists

echo "======================================"
echo "2. Creating foundation & installing base module..."
echo "======================================"
./odoo-bin --addons=addons,../pk_custom -d $DB_NAME -i base --stop-after-init --without-demo=all

echo "======================================"
echo "3. Stamping database with Country: India..."
echo "======================================"
echo "env.ref('base.main_company').write({'country_id': env.ref('base.in').id}); env.cr.commit()" | ./odoo-bin shell --addons=addons,../pk_custom -d $DB_NAME

echo "======================================"
echo "4. Installing garment_customization & booting server..."
echo "======================================"
./odoo-bin --addons=addons,../pk_custom -d $DB_NAME -i garment_customization --dev=all --http-port=9000 --without-demo=True
