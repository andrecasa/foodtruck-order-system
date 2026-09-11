import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ColorPreset } from '@order-system/shared';
import {
  signup,
  listColorPresets,
  checkSlugAvailability,
  SignupApiError,
  type SignupInput,
} from './signup-api';

/**
 * Testes example-based do cliente de API do onboarding (`signup-api.ts`).
 *
 * Cobrem o caminho feliz dos três endpoints e a tradução do `Error_Envelope`
 * (`{ statusCode, error, message }`) em {@link SignupApiError}, além da
 * montagem do corpo `multipart/form-data` do `POST /api/signup`.
 *
 * Validates: Requirements 6.1, 5.1, 9.1
 */

const API_URL = 'http://localhost:4000';

/** Constrói uma `Response` fake com corpo JSON. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Entrada de cadastro base reutilizável nos testes. */
function makeInput(overrides: Partial<SignupInput> = {}): SignupInput {
  return {
    businessName: 'Pastel da Praça',
    contactName: 'Maria Silva',
    contactPhone: '+5511999998888',
    adminName: 'Maria Silva',
    adminEmail: 'maria@example.com',
    password: 'senhaSegura1',
    slug: 'pastel-da-praca',
    colorPresetId: 'classico',
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signup — POST /api/signup (R9.1)', () => {
  it('envia multipart/form-data com todos os campos de texto e retorna o resultado', async () => {
    const result = { tenantId: 't-1', slug: 'pastel-da-praca', trialEndsAt: '2025-01-31T00:00:00.000Z' };
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(result, true, 201));

    const returned = await signup(makeInput());

    expect(returned).toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API_URL}/api/signup`);
    expect(init?.method).toBe('POST');

    const body = init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('businessName')).toBe('Pastel da Praça');
    expect(body.get('contactName')).toBe('Maria Silva');
    expect(body.get('contactPhone')).toBe('+5511999998888');
    expect(body.get('adminName')).toBe('Maria Silva');
    expect(body.get('adminEmail')).toBe('maria@example.com');
    expect(body.get('password')).toBe('senhaSegura1');
    expect(body.get('slug')).toBe('pastel-da-praca');
    expect(body.get('colorPresetId')).toBe('classico');
    // Sem logo: o campo não deve ser anexado.
    expect(body.has('logo')).toBe(false);
  });

  it('anexa a logo ao FormData quando fornecida', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ tenantId: 't-1', slug: 's', trialEndsAt: null }));
    const logo = new File(['abc'], 'logo.png', { type: 'image/png' });

    await signup(makeInput({ logo }));

    const body = (fetchMock.mock.calls[0]![1]?.body as FormData);
    expect(body.get('logo')).toBeInstanceOf(File);
  });

  it('traduz o Error_Envelope em SignupApiError (409 CONFLICT)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(
        { statusCode: 409, error: 'CONFLICT', message: 'E-mail já em uso' },
        false,
        409,
      ),
    );

    const promise = signup(makeInput());
    await expect(promise).rejects.toBeInstanceOf(SignupApiError);
    await expect(promise).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
      message: 'E-mail já em uso',
    });
  });

  it('usa mensagem/código neutros quando o corpo de erro não é JSON', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    const promise = signup(makeInput());
    await expect(promise).rejects.toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
    });
  });
});

describe('listColorPresets — GET /api/signup/color-presets (R6.1)', () => {
  it('retorna a lista de presets do backend', async () => {
    const presets: ColorPreset[] = [
      {
        id: 'classico',
        label: 'Clássico',
        colors: { primary: '#111' } as unknown as ColorPreset['colors'],
      },
    ];
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ presets }));

    const result = await listColorPresets();

    expect(result).toEqual({ presets });
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/signup/color-presets`);
  });

  it('lança SignupApiError em resposta de erro', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ statusCode: 500, error: 'INTERNAL_ERROR', message: 'Falha' }, false, 500),
    );

    await expect(listColorPresets()).rejects.toBeInstanceOf(SignupApiError);
  });
});

describe('checkSlugAvailability — GET /api/signup/slug-availability (R5.1)', () => {
  it('passa o slug via query string e retorna o resultado', async () => {
    const body = { slug: 'pastel-da-praca', valid: true, available: true };
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(body));

    const result = await checkSlugAvailability('pastel-da-praca');

    expect(result).toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/api/signup/slug-availability?slug=pastel-da-praca`,
    );
  });

  it('codifica caracteres especiais do slug na query string', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ slug: 'a b', valid: false, available: false }));

    await checkSlugAvailability('a b');

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/api/signup/slug-availability?slug=a+b`,
    );
  });

  it('lança SignupApiError em resposta de erro', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ statusCode: 500, error: 'INTERNAL_ERROR', message: 'Falha' }, false, 500),
    );

    await expect(checkSlugAvailability('x')).rejects.toBeInstanceOf(SignupApiError);
  });
});
