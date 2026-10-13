/**
 * Captura de documentos e comprovativos.
 *
 * Os ficheiros vão para buckets privados (`kyc-documents`, `payment-proofs`).
 * O caminho segue `<tenant_id>/<dono_id>/<ficheiro>`, porque as policies de
 * `storage.objects` validam o primeiro segmento contra o tenant do utilizador.
 * Nada é enviado sem sessão: sem ela o upload é recusado pela RLS.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { currentAccount } from '@/lib/guestAuth';
import { getSupabase, isSupabaseConfigured, TENANT_ID } from '@/lib/supabase';

export type CaptureSource = 'camera' | 'library';

export interface CapturedFile {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
}

/**
 * Resultado de captura. `cancelled` é um campo presente em todos os ramos de
 * erro, para que o consumidor possa distinguir "o utilizador cancelou" de
 * "houve uma falha" sem estreitamento ambíguo.
 */
export type CaptureResult =
  | { ok: true; file: CapturedFile; cancelled: false }
  | { ok: false; cancelled: true; error?: undefined }
  | { ok: false; cancelled: false; error: string };

/** Fotografia com a câmara do dispositivo. */
export async function capturePhoto(source: CaptureSource): Promise<CaptureResult> {
  if (source === 'library') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return { ok: false, cancelled: false, error: 'Permissão de acesso à galeria negada.' };
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: false,
    });
    if (result.canceled) return { ok: false, cancelled: true };
    const asset = result.assets[0];
    if (!asset) return { ok: false, cancelled: false, error: 'Nenhuma imagem seleccionada.' };
    return {
      ok: true,
      cancelled: false,
      file: {
        uri: asset.uri,
        name: asset.fileName ?? `captura-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        sizeBytes: asset.fileSize ?? null,
      },
    };
  }

  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { ok: false, cancelled: false, error: 'Permissão de câmara negada. Active-a nas definições do dispositivo.' };
  }
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.7,
    allowsEditing: false,
  });
  if (result.canceled) return { ok: false, cancelled: true };
  const asset = result.assets[0];
  if (!asset) return { ok: false, cancelled: false, error: 'Nenhuma imagem capturada.' };
  return {
    ok: true,
    cancelled: false,
    file: {
      uri: asset.uri,
      name: asset.fileName ?? `bi-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
      sizeBytes: asset.fileSize ?? null,
    },
  };
}

/** Comprovativo: imagem do Multicaixa Express ou PDF do extracto. */
export async function pickProofFile(): Promise<CaptureResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/*', 'application/pdf'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return { ok: false, cancelled: true };
  const asset = result.assets[0];
  if (!asset) return { ok: false, cancelled: false, error: 'Nenhum ficheiro seleccionado.' };
  return {
    ok: true,
    cancelled: false,
    file: {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      sizeBytes: asset.size ?? null,
    },
  };
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

// ---------------------------------------------------------------------------
// Registo universal (migração 017) — documento, comprovativo e rosto
// ---------------------------------------------------------------------------

export type PublicMediaKind = 'document' | 'receipt' | 'face';

const PUBLIC_BUCKETS: Record<PublicMediaKind, 'kyc-documents' | 'payment-proofs' | 'client-faces'> = {
  document: 'kyc-documents',
  receipt: 'payment-proofs',
  face: 'client-faces',
};

export const PUBLIC_MEDIA_LABELS: Record<PublicMediaKind, string> = {
  document: 'Documento de identidade',
  receipt: 'Comprovativo de pagamento',
  face: 'Fotografia do rosto',
};

/** Limites alinhados com `file_size_limit`/`allowed_mime_types` dos buckets. */
const PUBLIC_MEDIA_RULES: Record<PublicMediaKind, { maxBytes: number; mime: string[] }> = {
  document: { maxBytes: 10 * 1024 * 1024, mime: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
  receipt: { maxBytes: 10 * 1024 * 1024, mime: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
  face: { maxBytes: 5 * 1024 * 1024, mime: ['image/jpeg', 'image/png', 'image/webp'] },
};

/**
 * Fotografia do rosto — câmara da frente OU galeria.
 *
 * Paridade v0.2.1 com a Landing (`handleFaceFile`): quem não tem webcam/câmara
 * pode escolher uma imagem já existente. Ambos os ramos devolvem o mesmo
 * `CapturedFile`, pelo que o consumidor alimenta sempre o mesmo estado de envio.
 */
export async function captureFace(source: CaptureSource = 'camera'): Promise<CaptureResult> {
  if (source === 'library') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return { ok: false, cancelled: false, error: 'Permissão de acesso à galeria negada.' };
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled) return { ok: false, cancelled: true };
    const asset = result.assets[0];
    if (!asset) return { ok: false, cancelled: false, error: 'Nenhuma imagem escolhida.' };
    return {
      ok: true,
      cancelled: false,
      file: {
        uri: asset.uri,
        name: asset.fileName ?? `rosto-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        sizeBytes: asset.fileSize ?? null,
      },
    };
  }

  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { ok: false, cancelled: false, error: 'Permissão de câmara negada. Active-a nas definições do dispositivo.' };
  }
  const result = await ImagePicker.launchCameraAsync({
    cameraType: ImagePicker.CameraType.front,
    quality: 0.75,
    allowsEditing: true,
    aspect: [1, 1],
  });
  if (result.canceled) return { ok: false, cancelled: true };
  const asset = result.assets[0];
  if (!asset) return { ok: false, cancelled: false, error: 'Nenhuma fotografia capturada.' };
  return {
    ok: true,
    cancelled: false,
    file: {
      uri: asset.uri,
      name: asset.fileName ?? `rosto-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
      sizeBytes: asset.fileSize ?? null,
    },
  };
}

/**
 * Valida localmente antes de submeter — evita três uploads a falharem a meio.
 * Devolve `null` quando o ficheiro está aceite.
 */
export function validatePublicMedia(kind: PublicMediaKind, file: CapturedFile | null): string | null {
  const label = PUBLIC_MEDIA_LABELS[kind].toLowerCase();
  if (!file) return `Falta o ${label}.`;
  const rules = PUBLIC_MEDIA_RULES[kind];
  if (!rules.mime.includes(file.mimeType)) {
    return `Formato do ${label} não permitido (JPG, PNG, WEBP${kind === 'face' ? '' : ' ou PDF'}).`;
  }
  if (file.sizeBytes !== null && file.sizeBytes > rules.maxBytes) {
    return `O ${label} excede ${Math.round(rules.maxBytes / 1048576)} MB.`;
  }
  return null;
}

/**
 * Carrega uma peça do registo universal SEM sessão.
 *
 * A policy `public_media_upload_anon` (migração 017) deixa o visitante subir
 * ficheiros, mas só dentro do tenant e só com extensão conhecida; o `anon`
 * não tem SELECT nem DELETE, portanto os ficheiros são privados e não podem
 * ser removidos por quem os subiu.
 *
 * O caminho isolado não vale nada: só passa a referenciar a reserva quando a
 * RPC `hr_create_public_reservation` o aceita e o grava nas colunas
 * `document_path`/`receipt_path`/`face_path`.
 */
export async function uploadPublicMedia(
  kind: PublicMediaKind,
  ownerId: string,
  file: CapturedFile,
): Promise<UploadResult> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Supabase não configurado.' };

  const invalid = validatePublicMedia(kind, file);
  if (invalid) return { ok: false, error: invalid };

  // Mesmo formato do resto do sistema: `<tenant>/<dono>/<ficheiro>` — três
  // segmentos, exactamente o que a policy valida.
  const path = `${TENANT_ID}/${ownerId}/${kind}-${Date.now()}-${safeName(file.name)}.${extensionFor(file.mimeType)}`;

  try {
    const response = await fetch(file.uri);
    const blob = await response.blob();

    // Defesa em profundidade: quando o picker não reporta o tamanho
    // (`sizeBytes === null`), valida-se aqui pelo tamanho real do blob.
    const maxBytes = PUBLIC_MEDIA_RULES[kind].maxBytes;
    if (blob.size > maxBytes) {
      return {
        ok: false,
        error: `O ${PUBLIC_MEDIA_LABELS[kind].toLowerCase()} excede ${Math.round(maxBytes / 1048576)} MB.`,
      };
    }

    const { error } = await getSupabase().storage.from(PUBLIC_BUCKETS[kind]).upload(path, blob, {
      contentType: file.mimeType,
      upsert: false,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, path };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha ao carregar o ficheiro.' };
  }
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
}

type UploadResult = { ok: true; path: string } | { ok: false; error: string };

async function upload(
  bucket: 'kyc-documents' | 'payment-proofs',
  ownerId: string,
  file: CapturedFile,
): Promise<UploadResult> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Supabase não configurado.' };
  const account = await currentAccount();
  if (!account) return { ok: false, error: 'Inicie sessão para carregar ficheiros.' };

  const path = `${TENANT_ID}/${ownerId}/${Date.now()}-${safeName(file.name)}.${extensionFor(file.mimeType)}`;

  try {
    const response = await fetch(file.uri);
    const blob = await response.blob();

    if (blob.size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: `O ficheiro excede ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB.` };
    }

    const { error } = await getSupabase().storage.from(bucket).upload(path, blob, {
      contentType: file.mimeType,
      upsert: false,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, path };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha ao carregar o ficheiro.' };
  }
}

export type DocumentKind = 'BI_FRENTE' | 'BI_VERSO' | 'PASSAPORTE' | 'SELFIE';

/** Teto único dos buckets privados (documentos KYC e comprovativos). */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Formatos aceites nos documentos de KYC — espelha as policies do bucket. */
const KYC_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Carrega uma peça de KYC e regista-a em `guest_documents`. */
export async function uploadKycDocument(
  guestProfileId: string,
  kind: DocumentKind,
  file: CapturedFile,
): Promise<UploadResult> {
  if (!KYC_MIME_TYPES.includes(file.mimeType)) {
    return { ok: false, error: 'Formato não permitido nos documentos (JPG, PNG, WEBP ou PDF).' };
  }
  if (file.sizeBytes !== null && file.sizeBytes > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `O documento excede ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB.` };
  }

  const uploaded = await upload('kyc-documents', guestProfileId, file);
  if (!uploaded.ok) return uploaded;

  try {
    const account = await currentAccount();
    const { error } = await getSupabase().from('guest_documents').insert({
      guest_profile_id: guestProfileId,
      kind,
      storage_path: uploaded.path,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
      uploaded_by: account?.authUserId ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, path: uploaded.path };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha ao registar o documento.' };
  }
}

/**
 * Carrega o comprovativo de pagamento e regista-o em `payment_proofs`.
 *
 * Sem sessão isto falha: um comprovativo sem hóspede associado não pode ser
 * validado por ninguém.
 */
export async function uploadPaymentProof(input: {
  reservationId: string | null;
  bankAccountId: string | null;
  amount: number;
  method: 'MULTICAIXA_EXPRESS' | 'TRANSFERENCIA';
  paymentReference: string;
  file: CapturedFile;
  /**
   * Caminho já carregado na reserva (registo universal, migração 017).
   * Quando presente não se repete o upload — só se cria a linha de
   * `payment_proofs`, que é o que dá ao hotel o valor e o método.
   */
  storagePath?: string;
}): Promise<UploadResult> {
  if (!input.reservationId) {
    return { ok: false, error: 'Registe primeiro a reserva para associar o comprovativo.' };
  }
  if (!(input.amount > 0)) {
    return { ok: false, error: 'Indique o valor transferido.' };
  }

  let path = input.storagePath ?? null;
  if (!path) {
    const uploaded = await upload('payment-proofs', input.reservationId, input.file);
    if (!uploaded.ok) return uploaded;
    path = uploaded.path;
  }

  try {
    const { error } = await getSupabase().from('payment_proofs').insert({
      reservation_id: input.reservationId,
      bank_account_id: input.bankAccountId,
      amount: input.amount,
      method: input.method,
      payment_reference: input.paymentReference.trim() || null,
      storage_path: path,
      mime_type: input.file.mimeType,
      size_bytes: input.file.sizeBytes,
      status: 'EM_ANALISE',
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, path };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha ao registar o comprovativo.' };
  }
}
