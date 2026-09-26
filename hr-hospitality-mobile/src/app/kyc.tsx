import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge, Banner, Button, Card, Field, Loading, Screen, SectionHeader } from '@/components/ui';
import { HOTEL } from '@/constants/hotel';
import {
  currentAccount,
  fetchGuestProfile,
  signInGuest,
  signUpGuest,
  submitKyc,
  type GuestProfileRow,
} from '@/lib/guestAuth';
import { formatDay, todayIso } from '@/lib/format';
import { capturePhoto, uploadKycDocument, type CapturedFile, type DocumentKind } from '@/lib/upload';

const KYC_STATUS_LABEL: Record<GuestProfileRow['kyc_status'], { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' }> = {
  APROVADO: { label: 'Aprovado', tone: 'success' },
  EM_ANALISE: { label: 'Em análise', tone: 'warning' },
  REJEITADO: { label: 'Rejeitado', tone: 'danger' },
  PENDENTE: { label: 'Pendente', tone: 'muted' },
};

/** Peças exigidas, por tipo de documento. A selfie é obrigatória a estrangeiros. */
function requiredPieces(documentType: 'BI' | 'PASSAPORTE'): { kind: DocumentKind; label: string; hint: string }[] {
  if (documentType === 'BI') {
    return [
      { kind: 'BI_FRENTE', label: 'BI (frente)', hint: 'Fotografe a frente do bilhete, com o número legível.' },
      { kind: 'BI_VERSO', label: 'BI (verso)', hint: 'Fotografe o verso.' },
    ];
  }
  return [
    { kind: 'PASSAPORTE', label: 'Passaporte', hint: 'Fotografe a página com os seus dados e fotografia.' },
    { kind: 'SELFIE', label: 'Selfie', hint: 'Uma selfie de rosto, à luz do dia, sem óculos.' },
  ];
}

/**
 * Registo e check-in digital (KYC).
 *
 * O hóspede cria conta, preenche os dados e carrega as peças do documento. A
 * aprovação é sempre da recepção: a base de dados recusa um KYC `APROVADO` sem
 * a peça principal, e um hóspede não se auto-aprova em nenhuma circumstances.
 */
export default function KycScreen() {
  const router = useRouter();

  const [account, setAccount] = useState<{ authUserId: string; email: string } | null>(null);
  const [profile, setProfile] = useState<GuestProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<'entrar' | 'criar'>('criar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [documentType, setDocumentType] = useState<'BI' | 'PASSAPORTE'>('BI');
  const [fullName, setFullName] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentCountry, setDocumentCountry] = useState('');
  const [birthDate, setBirthDate] = useState(todayIso());
  const [nationality, setNationality] = useState('Angolana');
  const [phone, setPhone] = useState('');

  const [files, setFiles] = useState<Partial<Record<DocumentKind, CapturedFile>>>({});
  const [uploading, setUploading] = useState<DocumentKind | null>(null);

  const refresh = useCallback(async () => {
    const current = await currentAccount();
    setAccount(current);
    if (current) {
      try {
        setProfile(await fetchGuestProfile());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar o perfil.');
      }
    } else {
      setProfile(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void refresh().finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  const authenticate = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = mode === 'criar' ? await signUpGuest(email, password) : await signInGuest(email, password);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setNotice('Sessão iniciada. Preencha os dados abaixo.');
    await refresh();
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await submitKyc({
      fullName,
      documentType,
      documentNumber,
      documentCountry: documentType === 'PASSAPORTE' ? documentCountry.trim() || null : null,
      birthDate: birthDate || null,
      nationality: nationality.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
    });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setNotice('Dados enviados. A recepção vai validar os documentos.');
    await refresh();
  };

  const capture = async (kind: DocumentKind) => {
    setError(null);
    const result = await capturePhoto('camera');
    if (result.cancelled) return;
    if (!result.ok) {
      // A câmara pode estar bloqueada em emulador: recorre à galeria.
      const fallback = await capturePhoto('library');
      if (fallback.cancelled) return;
      if (!fallback.ok) { setError(fallback.error); return; }
      setFiles(current => ({ ...current, [kind]: fallback.file }));
      return;
    }
    setFiles(current => ({ ...current, [kind]: result.file }));
  };

  const upload = async () => {
    if (!profile) { setError('Guarde primeiro os dados do hóspede.'); return; }
    const pieces = requiredPieces(documentType);
    setBusy(true);
    setError(null);
    for (const piece of pieces) {
      const file = files[piece.kind];
      if (!file) { setBusy(false); setError(`Falta carregar: ${piece.label}.`); return; }
      setUploading(piece.kind);
      const result = await uploadKycDocument(profile.id, piece.kind, file);
      if (!result.ok) { setBusy(false); setUploading(null); setError(result.error); return; }
    }
    setUploading(null);
    setBusy(false);
    setNotice('Documentos carregados. A recepção valida e confirma o acesso.');
  };

  if (loading) {
    return (
      <Screen>
        <Loading label="A verificar a sessão…" />
      </Screen>
    );
  }

  if (!account) {
    return (
      <Screen>
        <View className="gap-1">
          <Text className="text-2xl font-black text-white">Check-in digital</Text>
          <Text className="text-sm text-white/50">
            Crie a sua conta para registar o BI ou passaporte e desbloquear a reserva.
          </Text>
        </View>

        <View className="flex-row gap-2">
          {(['criar', 'entrar'] as const).map(option => (
            <Pressable
              key={option}
              onPress={() => setMode(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === option }}
              className={`flex-1 items-center rounded-2xl border px-4 py-3.5 ${
                mode === option ? 'border-gold bg-gold/15' : 'border-white/15 bg-white/5'
              }`}
            >
              <Text className={`text-sm font-bold ${mode === option ? 'text-gold' : 'text-white/55'}`}>
                {option === 'criar' ? 'Criar conta' : 'Já tenho conta'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Field label="Email" value={email} onChangeText={setEmail} placeholder="email@exemplo.ao" keyboardType="email-address" autoCapitalize="none" />
        <Field label="Palavra-passe" value={password} onChangeText={setPassword} placeholder="Mínimo 6 caracteres" autoCapitalize="none" />

        {error ? <Banner tone="error" message={error} /> : null}
        {notice ? <Banner tone="success" message={notice} /> : null}

        <Button label={mode === 'criar' ? 'Criar conta' : 'Entrar'} loading={busy} onPress={() => void authenticate()} />

        <Card className="gap-2">
          <Text className="text-xs font-bold uppercase tracking-wider text-white/45">Para que servem os documentos</Text>
          <Text className="text-sm leading-relaxed text-white/65">
            Angola exige identificação do hóspede no check-in. Os documentos ficam num arquivo
            privado, só visíveis para si e para a recepção deste hotel, e só enquanto o check-in não
            estiver decidido.
          </Text>
        </Card>
      </Screen>
    );
  }

  const status = profile ? KYC_STATUS_LABEL[profile.kyc_status] : null;

  return (
    <Screen>
      <View className="gap-1">
        <Text className="text-2xl font-black text-white">Os meus documentos</Text>
        <Text className="text-sm text-white/50">{account.email}</Text>
      </View>

      {status && profile ? (
        <Card className="gap-2">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-sm font-bold text-white">{profile.full_name}</Text>
            <Badge label={status.label} tone={status.tone} />
          </View>
          <Text className="text-xs text-white/50">
            {profile.document_type === 'BI' ? 'Bilhete de identidade' : 'Passaporte'} · {profile.document_number}
          </Text>
          {profile.kyc_notes ? (
            <Text className="text-xs italic text-white/45">Receção: {profile.kyc_notes}</Text>
          ) : null}
        </Card>
      ) : null}

      {error ? <Banner tone="error" message={error} /> : null}
      {notice ? <Banner tone="success" message={notice} /> : null}

      {profile?.kyc_status === 'APROVADO' ? (
        <Card className="gap-2 border-emerald-400/30 bg-emerald-500/10">
          <Text className="text-sm font-bold text-emerald-200">Documentação validada</Text>
          <Text className="text-xs leading-relaxed text-emerald-100/80">
            Já pode fazer check-in na recepção de {HOTEL.name}. Se viajar de novo, o registo fica
            guardado neste hotel.
          </Text>
        </Card>
      ) : null}

      <View className="gap-3">
        <SectionHeader title="Tipo de documento" />
        <View className="flex-row gap-2">
          {(['BI', 'PASSAPORTE'] as const).map(option => (
            <Pressable
              key={option}
              onPress={() => setDocumentType(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: documentType === option }}
              className={`flex-1 items-center rounded-2xl border px-4 py-3.5 ${
                documentType === option ? 'border-aqua bg-aqua/10' : 'border-white/15 bg-white/5'
              }`}
            >
              <Text className={`text-sm font-bold ${documentType === option ? 'text-aqua' : 'text-white/55'}`}>
                {option === 'BI' ? 'BI (nacional)' : 'Passaporte (estrangeiro)'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="gap-3">
        <SectionHeader title="Dados do hóspede" />
        <Field label="Nome completo" value={fullName} onChangeText={setFullName} placeholder="Nome como no documento" autoCapitalize="words" />
        <Field
          label={documentType === 'BI' ? 'Número do BI' : 'Número do passaporte'}
          value={documentNumber}
          onChangeText={setDocumentNumber}
          placeholder="Ex.: 123456789"
          autoCapitalize="words"
        />
        {documentType === 'PASSAPORTE' ? (
          <Field label="País emissor" value={documentCountry} onChangeText={setDocumentCountry} placeholder="Ex.: Portugal" autoCapitalize="words" />
        ) : null}
        <Field label="Data de nascimento" value={birthDate} onChangeText={setBirthDate} placeholder="AAAA-MM-DD" autoCapitalize="none" />
        <Field label="Nacionalidade" value={nationality} onChangeText={setNationality} placeholder="Angolana" autoCapitalize="words" />
        <Field label="Telefone" value={phone} onChangeText={setPhone} placeholder="+244 9XX XXX XXX" keyboardType="numeric" />
      </View>

      <Button label="Guardar dados" loading={busy} onPress={() => void save()} />

      <View className="gap-3">
        <SectionHeader title="Fotografias do documento" subtitle="Obrigatórias para concluir o registo" />
        {requiredPieces(documentType).map(piece => (
          <Card key={piece.kind} className="gap-3">
            <Text className="text-sm font-bold text-white">{piece.label}</Text>
            <Text className="text-xs leading-relaxed text-white/50">{piece.hint}</Text>
            {files[piece.kind] ? (
              <Text className="text-[11px] font-semibold text-emerald-300">Fotografia capturada</Text>
            ) : null}
            <Button
              label={files[piece.kind] ? 'Recapturar' : 'Capturar'}
              variant="secondary"
              loading={uploading === piece.kind}
              onPress={() => void capture(piece.kind)}
            />
          </Card>
        ))}
        <Button label="Enviar documentos" loading={busy} onPress={() => void upload()} />
      </View>

      <Button label="Voltar" variant="secondary" onPress={() => router.back()} />

      <Text className="text-center text-[11px] leading-relaxed text-white/30">
        Registo válido a partir de {formatDay(todayIso())}. Os ficheiros ficam num bucket privado e
        são apagados se o check-in for recusado.
      </Text>
    </Screen>
  );
}
