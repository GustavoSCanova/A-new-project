import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAuthToken, verifyAuthToken } from './auth.js';

describe('autenticação', () => {
  it('deve criar e verificar um token válido', () => {
    const token = createAuthToken({ id: 'u-1', email: 'teste@teste.com', name: 'Teste' });
    const payload = verifyAuthToken(token);

    assert.equal(payload.id, 'u-1');
    assert.equal(payload.email, 'teste@teste.com');
    assert.equal(payload.name, 'Teste');
  });
});
