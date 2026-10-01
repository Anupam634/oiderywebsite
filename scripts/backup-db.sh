#!/usr/bin/env bash
# Nightly database backup: a compressed pg_dump, kept locally and (optionally) copied to an S3/R2 bucket.
#   DATABASE_URL=postgresql://… BACKUP_DIR=/var/backups/store [S3_BUCKET=… S3_ENDPOINT=…] scripts/backup-db.sh
# cron example (02:30 every night):  30 2 * * * /srv/store/scripts/backup-db.sh >> /var/log/store-backup.log 2>&1
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"
dir="${BACKUP_DIR:-./backups}"
keep_days="${KEEP_DAYS:-30}"
mkdir -p "$dir"
file="$dir/store-$(date -u +%Y%m%d-%H%M%S).sql.gz"
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$file"
echo "backup written: $file ($(du -h "$file" | cut -f1))"
if [ -n "${S3_BUCKET:-}" ]; then
  aws s3 cp "$file" "s3://$S3_BUCKET/db-backups/$(basename "$file")" ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"}
  echo "copied to s3://$S3_BUCKET/db-backups/"
fi
find "$dir" -name 'store-*.sql.gz' -mtime +"$keep_days" -delete
# restore: gunzip -c store-….sql.gz | psql "$DATABASE_URL"
