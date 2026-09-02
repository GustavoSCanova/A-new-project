import express, { type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import type { Summary, Transaction, TransactionType } from '@a-new-project/shared';
import { createAuthToken, verifyAuthToken, type AuthUser } from './auth.js';
import {
  createUser,
  deleteTransactionById,
  deleteUserById,
  findUserByEmail,
  listAllTransactions,
  listTransactions,
  listUsers,
  persistTransaction,
  updateTransactionById,
  verifyUserCredentials,
} from './database.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3001);

const seedDemoUser = async () => {
  const existingUser = await findUserByEmail('demo@financapp.com');

  if (!existingUser) {
    await createUser({
      name: 'Usuário Demo',
      email: 'demo@financapp.com',
      password: '123456',
    });
  }
};

const getSummary = (items: Transaction[]): Summary => {
  const income = items
    .filter((item) => item.type === 'income')
    .reduce((total, item) => total + item.amount, 0);

  const expense = items
    .filter((item) => item.type === 'expense')
    .reduce((total, item) => total + item.amount, 0);

  return {
    income,
    expense,
    balance: income - expense,
  };
};

const authMiddleware = (req: Request, res: Response, next: () => void) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token de autenticação obrigatório.' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const user = verifyAuthToken(token);
    req.user = user;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Token inválido ou expirado.' });
  }
};

app.use(cors());
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'api' });
});

app.post('/api/auth/register', async (req: Request, res: Response) => {
  const { name, email, password } = req.body as { name?: string; email?: string; password?: string };

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Nome, e-mail e senha são obrigatórios.' });
  }

  const existingUser = await findUserByEmail(email);

  if (existingUser) {
    return res.status(409).json({ message: 'Usuário já cadastrado.' });
  }

  const newUser = await createUser({ name, email, password });
  const authUser: AuthUser = {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
  };

  const token = createAuthToken(authUser);

  return res.status(201).json({ user: authUser, token });
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
  }

  const user = await verifyUserCredentials(email, password);

  if (!user) {
    return res.status(401).json({ message: 'Credenciais inválidas.' });
  }

  const token = createAuthToken(user);

  return res.status(200).json({ user, token });
});

app.get('/api/me', authMiddleware, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

app.get('/api/admin', authMiddleware, async (_req: Request, res: Response) => {
  const [users, transactions] = await Promise.all([listUsers(), listAllTransactions()]);

  return res.json({ users, transactions });
});

app.get('/api/transactions', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Usuário não autenticado.' });
  }

  const transactions = await listTransactions(userId);
  return res.json(transactions);
});

app.get('/api/summary', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Usuário não autenticado.' });
  }

  const transactions = await listTransactions(userId);
  return res.json(getSummary(transactions));
});

app.post('/api/transactions', authMiddleware, async (req: Request, res: Response) => {
  const { title, amount, type, category, date, description } = req.body as Partial<Transaction>;

  if (!title || !amount || !type || !category || !date) {
    return res.status(400).json({ message: 'Dados inválidos para criar transação.' });
  }

  if (type !== 'income' && type !== 'expense') {
    return res.status(400).json({ message: 'Tipo de transação inválido.' });
  }

  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Usuário não autenticado.' });
  }

  const validType = type as TransactionType;
  const newTransaction = await persistTransaction({
    userId,
    title,
    amount: Number(amount),
    type: validType,
    category,
    date,
    description,
  });

  return res.status(201).json(newTransaction);
});

app.put('/api/transactions/:id', authMiddleware, async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { title, amount, type, category, date, description } = req.body as Partial<Transaction>;

  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Usuário não autenticado.' });
  }

  if (!title || !amount || !type || !category || !date) {
    return res.status(400).json({ message: 'Dados inválidos para atualizar transação.' });
  }

  try {
    const updated = await updateTransactionById(id, userId, {
      title,
      amount: Number(amount),
      type: type as TransactionType,
      category,
      date,
      description,
    });

    return res.json(updated);
  } catch (error) {
    return res.status(404).json({ message: error instanceof Error ? error.message : 'Transação não encontrada.' });
  }
});

app.delete('/api/transactions/:id', authMiddleware, async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Usuário não autenticado.' });
  }

  try {
    await deleteTransactionById(id, userId);
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(404).json({ message: error instanceof Error ? error.message : 'Transação não encontrada.' });
  }
});

app.delete('/api/users/:id', authMiddleware, async (req: Request, res: Response) => {
  const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const currentUserId = req.user?.id;
  const { password } = req.body as { password: string };

  if (!currentUserId) {
    return res.status(401).json({ message: 'Usuário não autenticado.' });
  }

  if (userId !== currentUserId) {
    return res.status(403).json({ message: 'Você só pode deletar sua própria conta.' });
  }

  if (!password) {
    return res.status(400).json({ message: 'Senha é obrigatória.' });
  }

  try {
    await deleteUserById(userId, password);
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : 'Erro ao deletar usuário.' });
  }
});

app.listen(port, async () => {
  await seedDemoUser();
  console.log(`API running on http://localhost:${port}`);
});
