# Existing Sheet audit and dry-run repair

`framer-website/scripts/audit_managed_sheets.mjs` is intentionally read-only. It never calls a Google Sheets write endpoint and rejects `--apply` and `--write` flags.

With an exported tab-values fixture:

```sh
node framer-website/scripts/audit_managed_sheets.mjs \
  --input /path/to/existing-tabs.json \
  --backup-dir /tmp/twn-sheet-backup \
  --report /tmp/twn-sheet-repair-report.json
```

For a live read-only audit, provide an existing spreadsheet ID and a short-lived read-only OAuth token:

```sh
GOOGLE_ACCESS_TOKEN="$READ_ONLY_TOKEN" \
node framer-website/scripts/audit_managed_sheets.mjs \
  --sheet-id "$EXISTING_SHEET_ID" \
  --backup-dir /tmp/twn-sheet-backup \
  --report /tmp/twn-sheet-repair-report.json
```

The report identifies missing or drifted headers, duplicate current booking IDs, duplicate normalized lead emails, orphan rows, gateway-specific headers, and exact duplicate history events. It emits a dry-run repair plan only:

- current-state duplicates: keep the newest state and fill blank fields from older rows;
- lead duplicates: preserve first-seen, last-seen, and submission-count information;
- history duplicates: remove only exact duplicate event rows;
- all other duplicates, header drift, and orphan rows: stop for review.

No production cleanup or deployment is part of this workflow. Run it against staging first, review the backup and report, and obtain explicit authorization before implementing any production repair write.
