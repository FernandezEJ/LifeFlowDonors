import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { ApiError } from './api';

export type ProofUpload = FormData;
export type ProofFile = File | NonNullable<DocumentPickerAsset['file']>;

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

function validateProofFile(file: ProofFile): void {
  if (!TYPES.includes(file.type)) throw new ApiError('Choose a JPEG, PNG, or PDF proof.');
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_BYTES) {
    throw new ApiError('Choose a non-empty proof file of 5 MB or smaller.');
  }
}

export async function pickProofFile(): Promise<ProofFile | null> {
  let file: ProofFile;
  if (Platform.OS === 'web') {
    const picker = await import('expo-document-picker');
    const selection = await picker.getDocumentAsync({ type: TYPES, copyToCacheDirectory: true, multiple: false });
    if (selection.canceled) return null;
    if (!selection.assets[0].file) throw new ApiError('Please select the proof file again.');
    file = selection.assets[0].file;
  } else {
    // Preserve the File returned by the native picker and its read access.
    const selection = await File.pickFileAsync({ mimeTypes: TYPES, multipleFiles: false });
    if (selection.canceled) return null;
    file = selection.result;
  }
  validateProofFile(file);
  return file;
}

export function prepareProofUpload(file: ProofFile): ProofUpload {
  validateProofFile(file);
  const form = new FormData();
  form.append('proof', file);
  return form;
}

export function reportProofFailure(error: unknown): void {
  if (__DEV__) {
    // Preserve actionable failure details without logging tokens, file contents,
    // filenames, local paths, private response bodies or the whole request/error.
    console.error('LifeFlow proof upload failed', {
      kind: error instanceof ApiError ? 'api' : 'file_or_transport',
      status: error instanceof ApiError ? error.status : undefined,
      transportName: error instanceof ApiError ? error.transportName : undefined,
      transportMessage: error instanceof ApiError ? error.transportMessage : undefined,
      validationFields: error instanceof ApiError ? Object.keys(error.fields) : [],
    });
  }
}
