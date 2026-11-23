// The diagnostics page (D24): app and collection versions, storage, offline status, recent errors, and a plain-English
// report the reader can copy. It NEVER includes the content of notes or any other user text, only counts. Nothing is sent
// anywhere automatically.

/** Gathers the facts. `idb` is only asked how many records each user store holds, never what is in them. */
export async function collectDiagnostics({
  appVersion,
  collection,
  storage,
  online,
  errors,
  locale,
  persisted,
  serviceWorker,
  idb,
}) {
  const userRecords = {};
  try {
    userRecords.userdata = await idb.count('userdata');
  } catch {
    userRecords.userdata = null;
  }
  return {
    appVersion,
    collection: collection ?? null,
    storage: storage ?? null,
    online,
    persisted: persisted ?? null,
    serviceWorker: serviceWorker ?? null,
    locale,
    userRecords,
    errors: (errors ?? []).map((e) => ({ at: e.at, context: e.context, name: e.name, message: e.message })),
  };
}

const mb = (bytes) => (bytes === null || bytes === undefined ? 'unknown' : `${(bytes / 1048576).toFixed(2)} MB`);

/** The copyable report. `t` supplies the labels so the report follows the interface language. */
export function formatDiagnosticsReport(data, t) {
  const lines = [t('diag_report_title'), ''];
  lines.push(`${t('diag_app_version')}: ${data.appVersion}`);
  if (data.collection === null) lines.push(`${t('diag_collection')}: ${t('diag_none')}`);
  else {
    lines.push(`${t('diag_collection')}: ${data.collection.version}`);
    lines.push(`${t('diag_files')}: ${data.collection.fileCount}, ${mb(data.collection.bytes)}`);
    if (data.collection.closedTesting) lines.push(t('diag_closed_testing'));
    if (data.collection.pending) lines.push(`${t('diag_pending')}: ${data.collection.pending}`);
  }
  if (data.storage !== null) {
    lines.push(`${t('diag_storage_app')}: ${mb(data.storage.measuredBytes)}`);
    lines.push(`${t('diag_storage_browser')}: ${mb(data.storage.browserUsage)} / ${mb(data.storage.browserQuota)}`);
  }
  lines.push(`${t('diag_online')}: ${data.online ? t('diag_yes') : t('diag_no')}`);
  lines.push(
    `${t('diag_persistent')}: ${data.persisted === null ? t('diag_unknown') : data.persisted ? t('diag_yes') : t('diag_no')}`,
  );
  lines.push(`${t('diag_service_worker')}: ${data.serviceWorker ?? t('diag_unknown')}`);
  lines.push(`${t('diag_language')}: ${data.locale.ui} / ${data.locale.content}`);
  lines.push(`${t('diag_user_records')}: ${data.userRecords.userdata ?? t('diag_unknown')}`);
  lines.push('', t('diag_errors'));
  if (data.errors.length === 0) lines.push(t('diag_no_errors'));
  for (const e of data.errors) lines.push(`${e.at} ${e.context || e.name}: ${e.message}`);
  lines.push('', t('diag_privacy_note'));
  return lines.join('\n');
}
