import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTheme } from '../theme';
import { LandingChrome, Input, Button } from '../components';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { slugify } from '../utils/slugify';
import { formatPhoneBR, isValidMobileBR } from '../utils/phone';
import {
  signup,
  listColorPresets,
  checkSlugAvailability,
  SignupApiError,
  type ColorPresetsResult,
  type SlugAvailabilityResult,
} from '../services/signup-api';
import type { ColorPreset } from '@order-system/shared';

/**
 * Signup_Form (`/signup`, R3–R7): formulário público de onboarding self-service.
 *
 * Reutiliza a casca pública (`LandingChrome`: navbar + hero + footer) e, no
 * miolo, apresenta a seção de cadastro (título/subtítulo + card do formulário),
 * fiel ao frame "Signup" do Penpot. Os campos usam os componentes de formulário
 * reutilizáveis do `apps/web` (`Input`/`Button`), cujo visual espelha o app
 * mobile; estilos derivam do tema (`useTheme()`), sem cores/tamanhos hardcoded.
 *
 * Coleta os dados obrigatórios do cadastro (empresa, contato comercial e
 * administrador — R3.1), sugere um slug derivado do nome (R4.1) e para de
 * re-sugerir após edição manual (R4.2), consulta disponibilidade no backend
 * (R5.1), permite escolher exatamente um Color_Preset (R6.2) e anexar uma
 * logomarca opcional (R7.1). O backend é a autoridade final de validação; aqui
 * a validação é leve (campos obrigatórios). Elementos interativos e de mensagem
 * expõem `data-testid` e acessibilidade, com erros em `role="alert"`.
 *
 * Validates: Requirements 3.1, 4.1, 4.2, 5.1, 6.2, 7.1
 */

/** Tipos de arquivo aceitos para a logomarca (R7), espelhando o backend. */
const ACCEPTED_LOGO_TYPES = 'image/png,image/jpeg,image/svg+xml,image/webp';

/** Atraso (ms) do debounce da checagem de disponibilidade de slug (R5.1). */
const SLUG_CHECK_DEBOUNCE_MS = 500;

/** Comprimento mínimo do slug para valer a checagem de disponibilidade (R4.3). */
const MIN_SLUG_LENGTH = 3;

/** Abaixo desta largura o miolo do signup reduz os respiros laterais. */
const MOBILE_QUERY = '(max-width: 768px)';

/**
 * Id do preset de cores "Padrão" (paleta neutra da plataforma). Exibido como a
 * primeira opção e selecionado por padrão no formulário.
 */
const DEFAULT_COLOR_PRESET_ID = 'padrao';

/**
 * Ordena os presets deixando o "Padrão" em primeiro; os demais mantêm a ordem
 * vinda do backend. Fonte única da regra de ordenação usada na exibição.
 */
function orderPresets(presets: ColorPreset[]): ColorPreset[] {
  return [...presets].sort((a, b) => {
    if (a.id === DEFAULT_COLOR_PRESET_ID) return -1;
    if (b.id === DEFAULT_COLOR_PRESET_ID) return 1;
    return 0;
  });
}

/** Estado da checagem de disponibilidade do slug exibido ao cliente. */
type SlugStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'result'; result: SlugAvailabilityResult }
  | { kind: 'error'; message: string };

export function SignupPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(MOBILE_QUERY);

  const fontFamily = `"${theme.typography.fontFamily}", -apple-system, sans-serif`;

  // Campos de cadastro (R3.1) + slug (R4) + preset de cores (R6).
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [slug, setSlug] = useState('');
  const [colorPresetId, setColorPresetId] = useState('');
  const [logo, setLogo] = useState<File | null>(null);

  // Uma vez que o cliente edita o slug manualmente, paramos de re-sugerir (R4.2).
  const slugManuallyEditedRef = useRef(false);

  // Presets de cores carregados do backend (R6.1/R6.2).
  const [presets, setPresets] = useState<ColorPreset[]>([]);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  // Checagem de disponibilidade do slug (R5.1).
  const [slugStatus, setSlugStatus] = useState<SlugStatus>({ kind: 'idle' });

  // Erro específico do campo de telefone (validação de celular BR).
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Erro específico da confirmação de senha (coincidência com a senha).
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);

  // Estado de envio do formulário.
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Carrega os presets de cores ao montar (R6.1). Coloca o "Padrão" em primeiro
  // e o seleciona por padrão, garantindo "exatamente um" selecionado (R6.2).
  useEffect(() => {
    let cancelled = false;
    listColorPresets()
      .then((data: ColorPresetsResult) => {
        if (cancelled) return;
        const ordered = orderPresets(data.presets);
        setPresets(ordered);
        const first = ordered[0];
        if (first) {
          setColorPresetId((current) => current || first.id);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPresetsError(
          error instanceof SignupApiError
            ? error.message
            : 'Não foi possível carregar os presets de cores.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Atualiza o nome da empresa e re-sugere o slug enquanto o cliente não o
  // tiver editado manualmente (R4.1/R4.2).
  const handleBusinessNameChange = (value: string): void => {
    setBusinessName(value);
    if (!slugManuallyEditedRef.current) {
      setSlug(slugify(value));
    }
  };

  // Edição manual do slug: preserva o valor do cliente e para de re-sugerir (R4.2).
  const handleSlugChange = (value: string): void => {
    slugManuallyEditedRef.current = true;
    setSlug(value);
  };

  // Debounce da checagem de disponibilidade sempre que o slug muda (R5.1).
  useEffect(() => {
    if (slug.length < MIN_SLUG_LENGTH) {
      setSlugStatus({ kind: 'idle' });
      return;
    }

    let cancelled = false;
    setSlugStatus({ kind: 'checking' });
    const timer = setTimeout(() => {
      checkSlugAvailability(slug)
        .then((result) => {
          if (!cancelled) setSlugStatus({ kind: 'result', result });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setSlugStatus({
            kind: 'error',
            message:
              error instanceof SignupApiError
                ? error.message
                : 'Não foi possível verificar a disponibilidade do slug.',
          });
        });
    }, SLUG_CHECK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug]);

  // Aplica a máscara de celular BR conforme digita e limpa o erro do campo.
  const handleContactPhoneChange = (value: string): void => {
    setContactPhone(formatPhoneBR(value));
    if (phoneError) setPhoneError(null);
  };

  // Editar qualquer campo de senha limpa o erro de coincidência.
  const handlePasswordChange = (value: string): void => {
    setPassword(value);
    if (confirmPasswordError) setConfirmPasswordError(null);
  };

  const handleConfirmPasswordChange = (value: string): void => {
    setConfirmPassword(value);
    if (confirmPasswordError) setConfirmPasswordError(null);
  };

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setLogo(event.target.files?.[0] ?? null);
  };

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setPhoneError(null);
    setConfirmPasswordError(null);

    // Validação leve client-side (o backend é a autoridade final): apenas
    // garante que os campos obrigatórios (R3.1) e a seleção de preset (R6.2)
    // estão preenchidos antes de enviar.
    if (
      !businessName.trim() ||
      !contactName.trim() ||
      !contactPhone.trim() ||
      !adminName.trim() ||
      !adminEmail.trim() ||
      !password ||
      !confirmPassword ||
      !slug.trim() ||
      !colorPresetId
    ) {
      setFormError('Preencha todos os campos obrigatórios antes de continuar.');
      return;
    }

    // O telefone deve ser um celular BR válido (DDD + 9 + 8 dígitos).
    if (!isValidMobileBR(contactPhone)) {
      setPhoneError('Informe um celular válido com DDD, ex.: (11) 90000-0000.');
      return;
    }

    // A confirmação de senha deve coincidir com a senha.
    if (password !== confirmPassword) {
      setConfirmPasswordError('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await signup({
        businessName,
        contactName,
        contactPhone,
        adminName,
        adminEmail,
        password,
        slug,
        colorPresetId,
        logo,
      });
      setSuccessMessage(
        `Cadastro concluído! Seu endereço será /${result.slug}. Verifique seu e-mail para acessar.`,
      );
    } catch (error: unknown) {
      setFormError(
        error instanceof SignupApiError
          ? error.message
          : 'Não foi possível concluir o cadastro. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  /** Mensagem de disponibilidade do slug derivada do estado da checagem (R5.1). */
  const slugHelp = ((): { help?: string; error?: string } => {
    switch (slugStatus.kind) {
      case 'checking':
        return { help: 'Verificando disponibilidade…' };
      case 'result': {
        const { valid, available } = slugStatus.result;
        if (!valid)
          return {
            error:
              'Formato de slug inválido. Use 3 a 60 caracteres: letras minúsculas, números e hífen.',
          };
        if (!available) return { error: 'Este endereço já está em uso. Escolha outro.' };
        return { help: 'Endereço disponível.' };
      }
      case 'error':
        return { error: slugStatus.message };
      default:
        return {};
    }
  })();

  // --- Estilos da seção de cadastro (miolo, fiel ao Penpot) ---
  const sidePadding = isMobile ? theme.spacing.md : theme.spacing.xl * 1.5; // 48px
  const sectionSize = isMobile
    ? theme.typography.sizes.xl * 1.2 // 24px
    : theme.typography.sizes.xxl; // 32px

  const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: `${theme.spacing.lg}px`,
    width: '100%',
    boxSizing: 'border-box',
    padding: `${theme.spacing.xl * 2}px ${sidePadding}px`,
    backgroundColor: theme.colors.primary,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${sectionSize}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.surface,
    margin: 0,
    textAlign: 'center',
    maxWidth: '640px',
  };

  const sectionSubtitleStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.lg}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.surface,
    opacity: 0.85,
    margin: 0,
    textAlign: 'center',
    maxWidth: '640px',
    lineHeight: 1.6,
  };

  const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.md}px`,
    width: '100%',
    maxWidth: '440px',
    boxSizing: 'border-box',
    backgroundColor: theme.colors.surface,
    borderRadius: `${theme.borderRadius.md}px`,
    padding: `${theme.spacing.xl}px`,
  };

  const presetLabelStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.sm}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.text,
  };

  const presetGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: `${theme.spacing.sm}px`,
  };

  const presetSwatchStyle = (selected: boolean): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: `${theme.spacing.xs}px`,
    padding: `${theme.spacing.sm}px`,
    borderRadius: `${theme.borderRadius.md}px`,
    border: `2px solid ${selected ? theme.colors.primary : theme.colors.border}`,
    backgroundColor: theme.colors.surface,
    cursor: 'pointer',
    minWidth: '88px',
  });

  const swatchColorStyle = (color: string): React.CSSProperties => ({
    width: '36px',
    height: '36px',
    borderRadius: `${theme.borderRadius.full}px`,
    backgroundColor: color,
    border: `1px solid ${theme.colors.border}`,
  });

  const swatchLabelStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.sm}px`,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.text,
  };

  const fieldStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.xs}px`,
  };

  const helpTextStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.xs}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.textSecondary,
    margin: 0,
  };

  const errorTextStyle: React.CSSProperties = {
    ...helpTextStyle,
    color: theme.colors.error,
  };

  const successTextStyle: React.CSSProperties = {
    ...helpTextStyle,
    color: theme.colors.success,
  };

  // "Trigger" de upload estilizado como os demais campos (raio `md`, altura 48,
  // fundo `surface`, borda), com ícone `upload` da biblioteca à esquerda. O
  // input nativo fica escondido e é acionado ao clicar no rótulo.
  const logoTriggerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: `${theme.spacing.sm}px`,
    height: '48px',
    padding: `0 ${theme.spacing.md}px`,
    boxSizing: 'border-box',
    width: '100%',
    backgroundColor: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: `${theme.borderRadius.md}px`,
    cursor: 'pointer',
  };

  const logoIconStyle: React.CSSProperties = {
    fontFamily: '"Material Symbols Outlined"',
    fontSize: `${theme.typography.sizes.xl}px`,
    lineHeight: 0,
    color: theme.colors.textSecondary,
    flexShrink: 0,
  };

  const logoTextStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.md}px`,
    color: logo ? theme.colors.text : theme.colors.textSecondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const visuallyHiddenStyle: React.CSSProperties = {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
  };

  const termsStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.xs}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    margin: 0,
  };

  return (
    <LandingChrome
      heroTitle="Seu negócio de um jeito fácil"
      heroSubtitle="Seu time opera pelo celular, seus clientes pedem sozinhos pelo QR Code e você enxerga o negócio inteiro em tempo real — do primeiro pedido ao faturamento do mês."
      onPrimaryCta={() => navigate('/signup')}
      onLogin={() => navigate('/login')}
    >
      <section style={sectionStyle} aria-labelledby="signup-title">
        <h2 id="signup-title" style={sectionTitleStyle}>
          Comece hoje, sem cartão de crédito
        </h2>
        <p style={sectionSubtitleStyle}>
          Crie sua conta em minutos e veja o próximo pedido cair na sua fila. <br />
          30 dias grátis para testar tudo.
        </p>

        <form style={cardStyle} onSubmit={handleSubmit} noValidate data-testid="signup-page">
          <Input
            label="Empresa"
            value={businessName}
            onChangeText={handleBusinessNameChange}
            placeholder="Ex.: Pastel das Meninas"
            testId="signup-business-name-input"
            autoComplete="organization"
          />

          <Input
            label="Endereço público"
            value={slug}
            onChangeText={handleSlugChange}
            placeholder="ex.: pastel-das-meninas"
            testId="signup-slug-input"
            disableAutoCorrect
            error={slugHelp.error}
            helpText={slugHelp.help}
          />

          <Input
            label="Nome do responsável"
            value={contactName}
            onChangeText={setContactName}
            placeholder="Quem cuida do negócio"
            testId="signup-contact-name-input"
            autoComplete="name"
          />

          <Input
            label="Telefone / WhatsApp"
            value={contactPhone}
            onChangeText={handleContactPhoneChange}
            placeholder="(11) 90000-0000"
            type="tel"
            testId="signup-contact-phone-input"
            autoComplete="tel"
            inputMode="tel"
            error={phoneError ?? undefined}
          />

          <Input
            label="Nome do administrador"
            value={adminName}
            onChangeText={setAdminName}
            placeholder="Quem vai acessar o painel"
            testId="signup-admin-name-input"
            autoComplete="name"
          />

          <Input
            label="E-mail"
            value={adminEmail}
            onChangeText={setAdminEmail}
            placeholder="voce@seunegocio.com"
            type="email"
            testId="signup-admin-email-input"
            autoComplete="email"
            inputMode="email"
          />

          <Input
            label="Senha"
            value={password}
            onChangeText={handlePasswordChange}
            placeholder="Crie uma senha"
            type="password"
            testId="signup-password-input"
            autoComplete="new-password"
            helpText="Mínimo de 8 caracteres."
          />

          <Input
            label="Confirmar senha"
            value={confirmPassword}
            onChangeText={handleConfirmPasswordChange}
            placeholder="Repita a senha"
            type="password"
            testId="signup-confirm-password-input"
            autoComplete="new-password"
            error={confirmPasswordError ?? undefined}
          />

          <div style={fieldStyle}>
            <span style={presetLabelStyle} id="signup-color-preset-label">
              Preset de cores
            </span>
            {presetsError ? (
              <p style={errorTextStyle} role="alert" aria-live="polite" data-testid="signup-presets-error">
                {presetsError}
              </p>
            ) : (
              <div
                style={presetGroupStyle}
                role="radiogroup"
                aria-labelledby="signup-color-preset-label"
                data-testid="signup-color-preset-group"
              >
                {presets.map((preset) => {
                  const selected = preset.id === colorPresetId;
                  return (
                    <label
                      key={preset.id}
                      style={presetSwatchStyle(selected)}
                      data-testid={`signup-color-preset-${preset.id}`}
                    >
                      <input
                        type="radio"
                        name="colorPreset"
                        value={preset.id}
                        checked={selected}
                        onChange={() => setColorPresetId(preset.id)}
                        aria-label={preset.label}
                        data-testid={`signup-color-preset-input-${preset.id}`}
                        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
                      />
                      <span style={swatchColorStyle(preset.colors.primary)} aria-hidden="true" />
                      <span style={swatchLabelStyle}>{preset.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div style={fieldStyle}>
            <span style={presetLabelStyle}>Logomarca (opcional)</span>
            <label htmlFor="signup-logo" style={logoTriggerStyle}>
              <span className="material-symbols-outlined" aria-hidden="true" style={logoIconStyle}>
                upload
              </span>
              <span style={logoTextStyle}>
                {logo ? logo.name : 'Selecionar arquivo'}
              </span>
              <input
                id="signup-logo"
                type="file"
                accept={ACCEPTED_LOGO_TYPES}
                onChange={handleLogoChange}
                data-testid="signup-logo-input"
                aria-label="Logomarca (opcional)"
                style={visuallyHiddenStyle}
              />
            </label>
            <p style={helpTextStyle}>PNG, JPG, JPEG, SVG ou WEBP, até 2 MB.</p>
          </div>

          {formError ? (
            <p style={errorTextStyle} role="alert" aria-live="polite" data-testid="signup-form-error">
              {formError}
            </p>
          ) : null}

          {successMessage ? (
            <p style={successTextStyle} role="alert" aria-live="polite" data-testid="signup-success">
              {successMessage}
            </p>
          ) : null}

          <Button
            type="submit"
            title="Criar conta grátis"
            loading={submitting}
            loadingLabel="Enviando…"
            fullWidth
            ariaLabel="Criar conta de teste"
            testId="signup-submit-button"
          />

          <p style={termsStyle}>Ao criar a conta, você aceita os termos de uso.</p>
        </form>
      </section>
    </LandingChrome>
  );
}
