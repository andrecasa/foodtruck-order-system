import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

/**
 * Testes example-based do `signup.controller` (task 9.3): tradução HTTP↔serviço
 * dos três handlers do onboarding (POST /api/signup, GET color-presets, GET
 * slug-availability). O serviço e o loader de presets são mockados — o
 * controller só orquestra HTTP, sem I/O real. Erros lançados sobem ao
 * `errorHandler` central via `invokeHandler`, refletindo o Error_Envelope tal
 * como o cliente o receberia.
 *
 * _Requirements: 5.1, 5.2, 5.3, 6.1, 9.2, 9.3, 9.6, 9.7, 10.5_
 */

// Mock do serviço de signup (efeitos colaterais fora do escopo do controller).
vi.mock('../../services/signup.service.js', () => ({
  signup: vi.fn(),
  checkSlugAvailability: vi.fn(),
}));

// Mock do loader de presets (fonte da verdade do backend).
vi.mock('../../services/color-presets.js', () => ({
  listColorPresets: vi.fn(),
}));

import {
  signupController,
  listColorPresetsController,
  slugAvailabilityController,
} from '../../controllers/signup.controller.js';
import * as signupService from '../../services/signup.service.js';
import { listColorPresets } from '../../services/color-presets.js';
import { invokeHandler } from '../helpers/invoke-handler.js';

/** Resposta Express mockada, capturando status e corpo JSON. */
function mockResponse(): {
  res: Response;
  statusFn: ReturnType<typeof vi.fn>;
  jsonFn: ReturnType<typeof vi.fn>;
} {
  const jsonFn = vi.fn().mockReturnThis();
  const statusFn = vi.fn().mockReturnThis();
  const res = { status: statusFn, json: jsonFn } as unknown as Response;
  return { res, statusFn, jsonFn };
}

/** Campos de texto válidos do multipart (sem logo). */
const validBody = {
  businessName: 'Restaurante Teste',
  contactName: 'Maria Responsável',
  contactPhone: '+55 (11) 99999-1234',
  adminName: 'Admin Teste',
  adminEmail: 'admin@teste.com',
  password: 'senhaForte1',
  slug: 'restaurante-teste',
  colorPresetId: 'classico',
};

/** Request multipart mockado (Content-Type multipart + body + file opcional). */
function multipartRequest(
  body: Record<string, unknown>,
  file?: { buffer: Buffer; mimetype: string; size: number },
): Request {
  return {
    headers: { 'content-type': 'multipart/form-data; boundary=x' },
    body,
    file,
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('signupController (POST /api/signup)', () => {
  it('responde 201 com { tenantId, slug, trialEndsAt } em cadastro novo (R9.6)', async () => {
    const trialEndsAt = new Date('2024-02-01T00:00:00.000Z');
    vi.mocked(signupService.signup).mockResolvedValue({
      tenantId: 'tenant-1',
      slug: 'restaurante-teste',
      trialEndsAt,
      idempotentHit: false,
    });

    const req = multipartRequest(validBody);
    const { res, statusFn, jsonFn } = mockResponse();

    await invokeHandler(signupController, req, res);

    expect(statusFn).toHaveBeenCalledWith(201);
    expect(jsonFn).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      slug: 'restaurante-teste',
      trialEndsAt,
    });
    // A logo não foi enviada ⇒ o serviço recebe logo=null (R7.2).
    expect(vi.mocked(signupService.signup).mock.calls[0]?.[0].logo).toBeNull();
  });

  it('responde 200 em reenvio idempotente (R10.5)', async () => {
    vi.mocked(signupService.signup).mockResolvedValue({
      tenantId: 'tenant-1',
      slug: 'restaurante-teste',
      trialEndsAt: new Date(),
      idempotentHit: true,
    });

    const req = multipartRequest(validBody);
    const { res, statusFn } = mockResponse();

    await invokeHandler(signupController, req, res);

    expect(statusFn).toHaveBeenCalledWith(200);
  });

  it('repassa os bytes da logo ao serviço quando um arquivo é enviado', async () => {
    vi.mocked(signupService.signup).mockResolvedValue({
      tenantId: 'tenant-1',
      slug: 'restaurante-teste',
      trialEndsAt: new Date(),
      idempotentHit: false,
    });

    const buffer = Buffer.from('logo-bytes');
    const req = multipartRequest(validBody, {
      buffer,
      mimetype: 'image/png',
      size: buffer.length,
    });
    const { res } = mockResponse();

    await invokeHandler(signupController, req, res);

    expect(vi.mocked(signupService.signup).mock.calls[0]?.[0].logo).toEqual({
      body: buffer,
      contentType: 'image/png',
    });
  });

  it('rejeita corpo inválido com 422 VALIDATION_ERROR antes de chamar o serviço (R9.2/R9.3)', async () => {
    const req = multipartRequest({ ...validBody, adminEmail: 'nao-e-email' });
    const { res, statusFn, jsonFn } = mockResponse();

    await invokeHandler(signupController, req, res);

    expect(statusFn).toHaveBeenCalledWith(422);
    expect(jsonFn.mock.calls[0]?.[0]).toMatchObject({
      statusCode: 422,
      error: 'VALIDATION_ERROR',
    });
    expect(signupService.signup).not.toHaveBeenCalled();
  });

  it('rejeita Content-Type não multipart com 422, sem efeito colateral (R9.7)', async () => {
    const req = {
      headers: { 'content-type': 'application/json' },
      body: validBody,
    } as unknown as Request;
    const { res, statusFn, jsonFn } = mockResponse();

    await invokeHandler(signupController, req, res);

    expect(statusFn).toHaveBeenCalledWith(422);
    expect(jsonFn.mock.calls[0]?.[0]).toMatchObject({
      statusCode: 422,
      error: 'VALIDATION_ERROR',
    });
    expect(signupService.signup).not.toHaveBeenCalled();
  });
});

describe('listColorPresetsController (GET /api/signup/color-presets)', () => {
  it('responde 200 com { presets } do loader (R6.1)', async () => {
    const presets = [
      { id: 'classico', label: 'Clássico', colors: {} as never },
    ];
    vi.mocked(listColorPresets).mockReturnValue(presets as never);

    const { res, statusFn, jsonFn } = mockResponse();

    await invokeHandler(listColorPresetsController, {} as Request, res);

    expect(statusFn).toHaveBeenCalledWith(200);
    expect(jsonFn).toHaveBeenCalledWith({ presets });
  });
});

describe('slugAvailabilityController (GET /api/signup/slug-availability)', () => {
  it('responde 200 com { slug, valid, available } do serviço (R5.1)', async () => {
    vi.mocked(signupService.checkSlugAvailability).mockResolvedValue({
      slug: 'restaurante-teste',
      valid: true,
      available: true,
    });

    const req = { query: { slug: 'restaurante-teste' } } as unknown as Request;
    const { res, statusFn, jsonFn } = mockResponse();

    await invokeHandler(slugAvailabilityController, req, res);

    expect(statusFn).toHaveBeenCalledWith(200);
    expect(jsonFn).toHaveBeenCalledWith({
      slug: 'restaurante-teste',
      valid: true,
      available: true,
    });
  });

  it('rejeita ausência da query slug com 422 VALIDATION_ERROR', async () => {
    const req = { query: {} } as unknown as Request;
    const { res, statusFn, jsonFn } = mockResponse();

    await invokeHandler(slugAvailabilityController, req, res);

    expect(statusFn).toHaveBeenCalledWith(422);
    expect(jsonFn.mock.calls[0]?.[0]).toMatchObject({
      statusCode: 422,
      error: 'VALIDATION_ERROR',
    });
    expect(signupService.checkSlugAvailability).not.toHaveBeenCalled();
  });
});
