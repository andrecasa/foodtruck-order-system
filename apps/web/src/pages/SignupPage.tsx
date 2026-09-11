import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme';
import { Screen } from '../components';
import { slugify } from '../utils/slugify';
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
 * Coleta os dados obrigatórios do cadastro (empresa, contato comercial e
 * administrador — R3.1), permite escolher exatamente um Color_Preset carregado do
 * backend (R6.2), anexar uma logomarca opcional (R7.1) e sugere um slug derivado
 * do nome da empresa via {@link slugify} (R4.1), deixando de re-sugerir assim que
 * o cliente edita o slug manualmente (R4.2). A disponibilidade do slug é
 * consultada no backend (R5.1) e o cadastro é enviado como `multipart/form-data`
 * a `POST /api/signup`.
 *
 * O backend é a autoridade final de validação; aqui a validação é leve (apenas
 * campos obrigatórios) e serve para orientar o cliente antes do envio. Estilos
 * derivam de `useTheme()` (sem cores/tamanhos hardcoded); todos os elementos
 * interativos e de mensagem expõem `data-testid` e atributos de acessibilidade,
 * com mensagens de erro em `role="alert"`.
 *
 * Nota: o `Trial_Warning` é implementado na task 15.2; os testes (Testing Library
 * e property) nas tasks 15.3/15.4.
 *
 * Validates: Requirements 3.1, 4.1, 4.2, 5.1, 6.2, 7.1
 */

/** Tipos de arquivo aceitos para a logomarca (R7), espelhando o backend. */
const ACCEPTED_LOGO_TYPES = 'image/png,image/jpeg,image/svg+xml,image/webp';

/** Atraso (ms) do debounce da checagem de disponibilidade de slug (R5.1). */
const SLUG_CHECK_DEBOUNCE_MS = 500;

/** Comprimento mínimo do slug para valer a checagem de disponibilidade (R4.3). */
const MIN_SLUG_LENGTH = 3;

/** Estado da checagem de disponibilidade do slug exibido ao cliente. */
type SlugStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'result'; result: SlugAvailabilityResult }
  | { kind: 'error'; message: string };

export function SignupPage() {
  const theme = useTheme();

  // Campos de cadastro (R3.1) + slug (R4) + preset de cores (R6).
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
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

  // Estado de envio do formulário.
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Carrega os presets de cores ao montar (R6.1). Seleciona o primeiro por
  // padrão para garantir "exatamente um" selecionado (R6.2).
  useEffect(() => {
    let cancelled = false;
    listColorPresets()
      .then((data: ColorPresetsResult) => {
        if (cancelled) return;
        setPresets(data.presets);
        const first = data.presets[0];
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

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setLogo(event.target.files?.[0] ?? null);
  };

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

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
      !slug.trim() ||
      !colorPresetId
    ) {
      setFormError('Preencha todos os campos obrigatórios antes de continuar.');
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

  // --- Estilos derivados do tema (sem hardcode) ---

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: `${theme.spacing.xl}px ${theme.spacing.lg}px`,
    gap: `${theme.spacing.lg}px`,
  };

  const formStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.md}px`,
    width: '100%',
    maxWidth: '480px',
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.xl}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    margin: 0,
    textAlign: 'center',
  };

  const fieldStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.xs}px`,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.sm}px`,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.text,
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: `${theme.borderRadius.lg}px`,
    height: '48px',
    padding: `0 ${theme.spacing.md}px`,
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%',
  };

  const helpTextStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.xs}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.textSecondary,
    margin: 0,
  };

  const errorTextStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.xs}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.error,
    margin: 0,
  };

  const successTextStyle: React.CSSProperties = {
    ...errorTextStyle,
    color: theme.colors.success,
  };

  const submitStyle: React.CSSProperties = {
    backgroundColor: submitting ? theme.colors.surfaceDisabled : theme.colors.primary,
    color: submitting ? theme.colors.textDisabled : theme.colors.surface,
    border: 'none',
    borderRadius: `${theme.borderRadius.lg}px`,
    height: '48px',
    width: '100%',
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.bold,
    cursor: submitting ? 'not-allowed' : 'pointer',
  };

  const presetGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: `${theme.spacing.sm}px`,
  };

  const presetSwatchStyle = (preset: ColorPreset, selected: boolean): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: `${theme.spacing.xs}px`,
    padding: `${theme.spacing.sm}px`,
    borderRadius: `${theme.borderRadius.md}px`,
    border: `2px solid ${selected ? theme.colors.primary : theme.colors.border}`,
    backgroundColor: theme.colors.surface,
    cursor: 'pointer',
    minWidth: '96px',
  });

  const swatchColorStyle = (color: string): React.CSSProperties => ({
    width: '32px',
    height: '32px',
    borderRadius: `${theme.borderRadius.full}px`,
    backgroundColor: color,
    border: `1px solid ${theme.colors.border}`,
  });

  const swatchLabelStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.sm}px`,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.text,
  };

  /** Mensagem de disponibilidade do slug derivada do estado da checagem (R5.1). */
  const renderSlugStatus = (): React.ReactNode => {
    switch (slugStatus.kind) {
      case 'checking':
        return (
          <p style={helpTextStyle} data-testid="signup-slug-status" aria-live="polite">
            Verificando disponibilidade…
          </p>
        );
      case 'result': {
        const { valid, available } = slugStatus.result;
        if (!valid) {
          return (
            <p
              style={errorTextStyle}
              role="alert"
              aria-live="polite"
              data-testid="signup-slug-status"
            >
              Formato de slug inválido. Use 3 a 60 caracteres: letras minúsculas,
              números e hífen.
            </p>
          );
        }
        if (!available) {
          return (
            <p
              style={errorTextStyle}
              role="alert"
              aria-live="polite"
              data-testid="signup-slug-status"
            >
              Este endereço já está em uso. Escolha outro.
            </p>
          );
        }
        return (
          <p style={{ ...helpTextStyle, color: theme.colors.success }} data-testid="signup-slug-status" aria-live="polite">
            Endereço disponível.
          </p>
        );
      }
      case 'error':
        return (
          <p style={errorTextStyle} role="alert" aria-live="polite" data-testid="signup-slug-status">
            {slugStatus.message}
          </p>
        );
      case 'idle':
      default:
        return null;
    }
  };

  return (
    <Screen padding={false}>
      <main style={containerStyle} data-testid="signup-page">
        <h1 style={titleStyle}>Comece seu teste gratuito</h1>

        <form style={formStyle} onSubmit={handleSubmit} noValidate>
          <div style={fieldStyle}>
            <label htmlFor="signup-business-name" style={labelStyle}>
              Nome da empresa
            </label>
            <input
              id="signup-business-name"
              type="text"
              style={inputStyle}
              value={businessName}
              onChange={(e) => handleBusinessNameChange(e.target.value)}
              data-testid="signup-business-name-input"
              aria-label="Nome da empresa"
              autoComplete="organization"
            />
          </div>

          <div style={fieldStyle}>
            <label htmlFor="signup-slug" style={labelStyle}>
              Endereço público (slug)
            </label>
            <input
              id="signup-slug"
              type="text"
              style={inputStyle}
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              data-testid="signup-slug-input"
              aria-label="Endereço público (slug)"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            {renderSlugStatus()}
          </div>

          <div style={fieldStyle}>
            <label htmlFor="signup-contact-name" style={labelStyle}>
              Nome do responsável
            </label>
            <input
              id="signup-contact-name"
              type="text"
              style={inputStyle}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              data-testid="signup-contact-name-input"
              aria-label="Nome do responsável"
              autoComplete="name"
            />
          </div>

          <div style={fieldStyle}>
            <label htmlFor="signup-contact-phone" style={labelStyle}>
              Telefone/WhatsApp de contato
            </label>
            <input
              id="signup-contact-phone"
              type="tel"
              style={inputStyle}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              data-testid="signup-contact-phone-input"
              aria-label="Telefone/WhatsApp de contato"
              autoComplete="tel"
              inputMode="tel"
            />
          </div>

          <div style={fieldStyle}>
            <label htmlFor="signup-admin-name" style={labelStyle}>
              Nome do administrador
            </label>
            <input
              id="signup-admin-name"
              type="text"
              style={inputStyle}
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              data-testid="signup-admin-name-input"
              aria-label="Nome do administrador"
              autoComplete="name"
            />
          </div>

          <div style={fieldStyle}>
            <label htmlFor="signup-admin-email" style={labelStyle}>
              E-mail do administrador
            </label>
            <input
              id="signup-admin-email"
              type="email"
              style={inputStyle}
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              data-testid="signup-admin-email-input"
              aria-label="E-mail do administrador"
              autoComplete="email"
              inputMode="email"
            />
          </div>

          <div style={fieldStyle}>
            <label htmlFor="signup-password" style={labelStyle}>
              Senha
            </label>
            <input
              id="signup-password"
              type="password"
              style={inputStyle}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="signup-password-input"
              aria-label="Senha"
              autoComplete="new-password"
            />
            <p style={helpTextStyle}>Mínimo de 8 caracteres.</p>
          </div>

          <div style={fieldStyle}>
            <span style={labelStyle} id="signup-color-preset-label">
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
                      style={presetSwatchStyle(preset, selected)}
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
            <label htmlFor="signup-logo" style={labelStyle}>
              Logomarca (opcional)
            </label>
            <input
              id="signup-logo"
              type="file"
              accept={ACCEPTED_LOGO_TYPES}
              onChange={handleLogoChange}
              data-testid="signup-logo-input"
              aria-label="Logomarca (opcional)"
              style={{ ...inputStyle, height: 'auto', paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.sm }}
            />
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

          <button
            type="submit"
            style={submitStyle}
            disabled={submitting}
            aria-busy={submitting}
            aria-label="Criar conta de teste"
            data-testid="signup-submit-button"
          >
            {submitting ? 'Enviando…' : 'Criar conta gratuita'}
          </button>
        </form>
      </main>
    </Screen>
  );
}
