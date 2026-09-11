import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColorPreset } from '@order-system/shared';
import { NEUTRAL_PLATFORM_THEME, TRIAL_WARNING_DAYS } from '@order-system/shared';
import { ThemeProvider } from '../theme';
import type * as SignupApiModule from '../services/signup-api';

/**
 * Testes Testing Library do Signup_Form (feature landing-onboarding, task 15.3).
 *
 * Cobrem o comportamento observável da `SignupPage` (R3.1, R4.2, R6.2) e a
 * visibilidade do `Trial_Warning` (R13.1/R13.2). Como a `SignupPage` NÃO integra
 * o `Trial_Warning` diretamente (ele foi criado como componente standalone na
 * task 15.2), a regra de exibição/ocultação é verificada renderizando
 * `<TrialWarning>` diretamente com dias restantes dentro e fora do limite.
 *
 * O cliente de API (`services/signup-api`) é mockado (`vi.mock`) para tornar o
 * carregamento de presets e a checagem de slug determinísticos, sem rede:
 * `listColorPresets` devolve dois presets, `checkSlugAvailability` devolve um
 * resultado válido/disponível e `signup` é controlável por teste. O backend é a
 * autoridade final de validação; aqui exercitamos apenas a UI.
 */

// --- Mock do cliente de API do onboarding (sem rede) ---
// A `SignupPage` importa `SignupApiError` do módulo, então preservamos a classe
// real via `importActual` e sobrescrevemos apenas as funções de rede.
const mockListColorPresets = vi.fn();
const mockCheckSlugAvailability = vi.fn();
const mockSignup = vi.fn();

vi.mock('../services/signup-api', async () => {
  const actual = await vi.importActual<typeof SignupApiModule>('../services/signup-api');
  return {
    ...actual,
    listColorPresets: () => mockListColorPresets(),
    checkSlugAvailability: (slug: string) => mockCheckSlugAvailability(slug),
    signup: (input: unknown) => mockSignup(input),
  };
});

// Import após o mock para garantir que a página use as funções mockadas.
import { SignupPage } from '../pages/SignupPage';
import { TrialWarning } from '../components/TrialWarning';

/** Dois presets de cores com paleta completa (reusa a paleta neutra do shared). */
const PRESET_CLASSICO: ColorPreset = {
  id: 'classico',
  label: 'Clássico',
  colors: NEUTRAL_PLATFORM_THEME.colors,
};
const PRESET_VIBRANTE: ColorPreset = {
  id: 'vibrante',
  label: 'Vibrante',
  colors: { ...NEUTRAL_PLATFORM_THEME.colors, primary: '#ff5722' },
};

function renderSignup() {
  return render(
    <ThemeProvider>
      <SignupPage />
    </ThemeProvider>,
  );
}

/** Preenche os campos obrigatórios (exceto os passados em `overrides` como ''). */
async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId('signup-business-name-input'), 'Pastel da Praça');
  // O slug é sugerido automaticamente a partir do nome; não precisa preencher.
  await user.type(screen.getByTestId('signup-contact-name-input'), 'Maria Silva');
  await user.type(screen.getByTestId('signup-contact-phone-input'), '+5511999998888');
  await user.type(screen.getByTestId('signup-admin-name-input'), 'Admin');
  await user.type(screen.getByTestId('signup-admin-email-input'), 'admin@exemplo.com');
  await user.type(screen.getByTestId('signup-password-input'), 'senha1234');
}

describe('SignupPage (Signup_Form)', () => {
  beforeEach(() => {
    mockListColorPresets.mockResolvedValue({ presets: [PRESET_CLASSICO, PRESET_VIBRANTE] });
    mockCheckSlugAvailability.mockResolvedValue({
      slug: 'pastel-da-praca',
      valid: true,
      available: true,
    });
    mockSignup.mockResolvedValue({
      tenantId: 'tenant-1',
      slug: 'pastel-da-praca',
      trialEndsAt: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sugere o slug a partir do nome da empresa e para de re-sugerir após edição manual (R4.2)', async () => {
    const user = userEvent.setup();
    renderSignup();

    const businessInput = screen.getByTestId('signup-business-name-input');
    const slugInput = screen.getByTestId('signup-slug-input') as HTMLInputElement;

    // Ao digitar o nome, o slug é sugerido via slugify (acentos removidos,
    // minúsculas, espaços viram hífen) — R4.1.
    await user.type(businessInput, 'Café São João');
    expect(slugInput.value).toBe('cafe-sao-joao');

    // O cliente edita o slug manualmente: a partir daqui o valor é preservado.
    await user.clear(slugInput);
    await user.type(slugInput, 'meu-slug');
    expect(slugInput.value).toBe('meu-slug');

    // Alterar novamente o nome NÃO deve sobrescrever o slug editado (R4.2).
    await user.clear(businessInput);
    await user.type(businessInput, 'Outro Nome Qualquer');
    expect(slugInput.value).toBe('meu-slug');
  });

  it('exige os campos obrigatórios: submeter vazio mostra o erro e não chama o serviço de signup (R3.1)', async () => {
    const user = userEvent.setup();
    renderSignup();

    // Aguarda o carregamento dos presets (efeito assíncrono).
    await screen.findByTestId('signup-color-preset-classico');

    // Submete o formulário sem preencher nada.
    await user.click(screen.getByTestId('signup-submit-button'));

    const error = await screen.findByTestId('signup-form-error');
    expect(error).toBeInTheDocument();
    expect(error).toHaveTextContent(/preencha todos os campos obrigatórios/i);

    // Nenhuma chamada de rede de cadastro foi feita.
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it('envia o cadastro quando todos os campos obrigatórios estão preenchidos', async () => {
    const user = userEvent.setup();
    renderSignup();

    await screen.findByTestId('signup-color-preset-classico');
    await fillRequiredFields(user);

    await user.click(screen.getByTestId('signup-submit-button'));

    await waitFor(() => expect(mockSignup).toHaveBeenCalledTimes(1));
    // O preset selecionado por padrão (primeiro) acompanha o envio (R6.2).
    expect(mockSignup).toHaveBeenCalledWith(
      expect.objectContaining({ colorPresetId: 'classico' }),
    );
    expect(await screen.findByTestId('signup-success')).toBeInTheDocument();
  });

  describe('seleção de preset de cores (R6.2)', () => {
    it('renderiza os presets retornados por listColorPresets e mantém exatamente um selecionado', async () => {
      const user = userEvent.setup();
      renderSignup();

      // Os dois presets mockados são renderizados.
      const classico = await screen.findByTestId('signup-color-preset-classico');
      const vibrante = await screen.findByTestId('signup-color-preset-vibrante');
      expect(classico).toBeInTheDocument();
      expect(vibrante).toBeInTheDocument();

      const classicoRadio = within(classico).getByTestId(
        'signup-color-preset-input-classico',
      ) as HTMLInputElement;
      const vibranteRadio = within(vibrante).getByTestId(
        'signup-color-preset-input-vibrante',
      ) as HTMLInputElement;

      // O primeiro preset é selecionado por padrão (garante "exatamente um").
      expect(classicoRadio.checked).toBe(true);
      expect(vibranteRadio.checked).toBe(false);

      // Selecionar outro preset transfere a seleção — continua exatamente um.
      await user.click(vibranteRadio);
      expect(vibranteRadio.checked).toBe(true);
      expect(classicoRadio.checked).toBe(false);
    });
  });
});

/**
 * Visibilidade do `Trial_Warning` (R13.1/R13.2). A `SignupPage` não integra o
 * componente diretamente, então validamos a regra renderizando-o de forma
 * isolada: visível quando `0 < daysRemaining <= TRIAL_WARNING_DAYS`; oculto para
 * mais dias que o limite ou para teste já encerrado (`daysRemaining <= 0`).
 */
describe('TrialWarning — exibição conforme dias restantes (R13.1/R13.2)', () => {
  function renderWarning(daysRemaining: number) {
    return render(
      <ThemeProvider>
        <TrialWarning daysRemaining={daysRemaining} />
      </ThemeProvider>,
    );
  }

  it(`exibe o aviso quando faltam dias dentro do limite (<= ${TRIAL_WARNING_DAYS}) (R13.1)`, () => {
    renderWarning(TRIAL_WARNING_DAYS);
    const warning = screen.getByTestId('trial-warning');
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent(new RegExp(`${TRIAL_WARNING_DAYS} dias`));
  });

  it('usa a forma singular quando falta exatamente 1 dia (R13.1)', () => {
    renderWarning(1);
    expect(screen.getByTestId('trial-warning')).toHaveTextContent(/termina em 1 dia\./i);
  });

  it(`oculta o aviso quando faltam mais dias que o limite (> ${TRIAL_WARNING_DAYS}) (R13.2)`, () => {
    renderWarning(TRIAL_WARNING_DAYS + 1);
    expect(screen.queryByTestId('trial-warning')).not.toBeInTheDocument();
  });

  it('oculta o aviso quando o teste já encerrou (daysRemaining <= 0)', () => {
    renderWarning(0);
    expect(screen.queryByTestId('trial-warning')).not.toBeInTheDocument();
  });
});
