import { router, Stack } from 'expo-router';
import { Alert } from 'react-native';

import { importFromFiles, scanForNewFiles, type ImportSummary } from '@/library/importer';
import { pluralize } from '@/lib/format';

export function showImportSummary(summary: ImportSummary | null) {
  if (!summary) return;
  const parts: string[] = [];
  parts.push(summary.added > 0 ? `Added ${pluralize(summary.added, 'song')}.` : 'No new songs were added.');
  if (summary.duplicates > 0) parts.push(`${pluralize(summary.duplicates, 'song')} already in your library.`);
  if (summary.failed.length > 0) {
    const list = summary.failed.slice(0, 4).map((f) => `• ${f.name}: ${f.reason}`).join('\n');
    parts.push(`${pluralize(summary.failed.length, 'file')} couldn’t be imported:\n${list}`);
  }
  if (summary.added > 0 && summary.duplicates === 0 && summary.failed.length === 0) return;
  Alert.alert('Import Finished', parts.join('\n\n'));
}

export async function runImportFromFiles() {
  showImportSummary(await importFromFiles());
}

export async function runScan() {
  const summary = await scanForNewFiles();
  if (summary && summary.added === 0 && summary.failed.length === 0 && summary.duplicates === 0) {
    Alert.alert(
      'No New Files',
      'To add music this way, copy files into “On My iPhone › SONDER” in the Files app (or SONDER in Finder), then scan again.',
    );
    return;
  }
  showImportSummary(summary);
}

/** Header buttons shared by Listen and Library: add music, and settings. */
export function LibraryToolbar() {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu icon="plus" accessibilityLabel="Add Music">
        <Stack.Toolbar.MenuAction icon="folder" onPress={runImportFromFiles}>
          Import from Files
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction icon="arrow.clockwise" onPress={runScan}>
          Scan SONDER Folder
        </Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
      <Stack.Toolbar.Button icon="gearshape" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
    </Stack.Toolbar>
  );
}
