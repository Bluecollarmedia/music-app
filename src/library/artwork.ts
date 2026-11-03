import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { CUSTOM_ART_DIR, ensureDir, fileForRelative } from '@/lib/paths';
import { getLibrary } from '@/stores/library';

/** What the artwork applies to. */
export type ArtworkTarget = { kind: 'album'; id: string } | { kind: 'track'; id: string };

export type PickedImage = { uri: string; width: number; height: number };

export type CropRect = { originX: number; originY: number; width: number; height: number };

/** Saved artwork is square, at most this many pixels per side. */
const OUTPUT_SIZE = 1400;

/**
 * Opens the system Photos picker. It runs out of process, so SONDER never needs
 * access to the whole photo library.
 */
export async function pickFromPhotos(): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (asset.width && asset.height) return { uri: asset.uri, width: asset.width, height: asset.height };
  return measure(asset.uri);
}

export async function pickFromFiles(): Promise<PickedImage | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/*'],
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets[0]) return null;
  return measure(result.assets[0].uri);
}

async function measure(uri: string): Promise<PickedImage> {
  const ref = await ImageManipulator.manipulate(uri).renderAsync();
  return { uri, width: ref.width, height: ref.height };
}

/** Crops to the chosen square, resizes, and stores the result as custom artwork. */
export async function saveArtwork(target: ArtworkTarget, source: PickedImage, crop: CropRect): Promise<void> {
  const side = Math.min(crop.width, crop.height);
  const rect: CropRect = {
    originX: Math.max(0, Math.round(crop.originX)),
    originY: Math.max(0, Math.round(crop.originY)),
    width: Math.round(side),
    height: Math.round(side),
  };
  rect.width = Math.min(rect.width, source.width - rect.originX);
  rect.height = Math.min(rect.height, source.height - rect.originY);
  const finalSide = Math.min(rect.width, rect.height);
  rect.width = finalSide;
  rect.height = finalSide;

  let context = ImageManipulator.manipulate(source.uri).crop(rect);
  if (finalSide > OUTPUT_SIZE) {
    context = context.resize({ width: OUTPUT_SIZE, height: OUTPUT_SIZE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });

  ensureDir(CUSTOM_ART_DIR);
  // A new file name each time means every image cache sees a new image right away.
  const relative = `${CUSTOM_ART_DIR}/${target.kind}-${target.id}-${Date.now()}.jpg`;
  await new File(saved.uri).move(fileForRelative(relative));

  if (target.kind === 'album') {
    await getLibrary().setAlbumArtwork(target.id, relative);
  } else {
    await getLibrary().setTrackArtwork(target.id, relative);
  }
}

/** Removes custom artwork so the artwork embedded in the music files shows again. */
export async function restoreOriginalArtwork(target: ArtworkTarget): Promise<void> {
  if (target.kind === 'album') {
    await getLibrary().setAlbumArtwork(target.id, null);
  } else {
    await getLibrary().setTrackArtwork(target.id, null);
  }
}

/**
 * Only when the user asks for it: gives every song on the album its own copy of the
 * album's cover. Album covers never change song artwork on their own.
 */
export async function applyAlbumArtworkToAllSongs(albumId: string): Promise<void> {
  const lib = getLibrary();
  const album = lib.albums[albumId];
  const cover = album?.customArtwork ?? album?.embeddedArtwork;
  if (!album || !cover) return;
  ensureDir(CUSTOM_ART_DIR);
  for (const id of album.trackIds) {
    const relative = `${CUSTOM_ART_DIR}/track-${id}-${Date.now()}.jpg`;
    new File(fileForRelative(cover)).copy(fileForRelative(relative));
    await lib.setTrackArtwork(id, relative);
  }
}
