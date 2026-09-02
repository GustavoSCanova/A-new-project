import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createUser,
  deleteTransactionById,
  findUserByEmail,
  listAllTransactions,
  listTransactions,
  listUsers,
  persistTransaction,
  updateTransactionById,
} from './database.js';

describe('persistência do banco', () => {
  it('deve criar um usuário e registrar uma transação salva no banco', async () => {
    const email = `teste-${Date.now()}@persistencia.com`;

    const user = await createUser({
      name: 'Usuário Teste',
      email,
      password: '123456',
    });

    const savedUser = await findUserByEmail(email);
    assert.ok(savedUser);
    assert.equal(savedUser?.email, user.email);

    const transaction = await persistTransaction({
      userId: user.id,
      title: 'Teste de persistência',
      amount: 900,
      type: 'expense',
      category: 'Teste',
      date: '2026-09-02',
      description: 'Registro no banco',
    });

    const transactions = await listTransactions(user.id);
    assert.ok(transactions.some((item) => item.id === transaction.id));

    const allUsers = await listUsers();
    assert.ok(allUsers.some((item) => item.email === email));

    const allTransactions = await listAllTransactions();
    assert.ok(allTransactions.some((item) => item.id === transaction.id));

    const updated = await updateTransactionById(transaction.id, user.id, {
      title: 'Teste atualizado',
      amount: 1500,
      category: 'Atualizado',
      description: 'Registro alterado',
      date: '2026-09-03',
      type: 'income',
    });

    assert.equal(updated.title, 'Teste atualizado');
    assert.equal(updated.amount, 1500);

    const deleted = await deleteTransactionById(transaction.id, user.id);
    assert.equal(deleted, true);
  });
});
