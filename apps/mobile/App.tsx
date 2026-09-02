import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type User = {
  id: string;
  name: string;
  email: string;
};

type Transaction = {
  id: string;
  title: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  date: string;
  description?: string;
};

type Summary = {
  income: number;
  expense: number;
  balance: number;
};

type AuthMode = 'login' | 'register';

type TransactionForm = {
  title: string;
  amount: string;
  category: string;
  type: 'income' | 'expense';
  description: string;
  date: string;
};

const API_BASE_URL = 'http://192.168.15.168:3001';
const TOKEN_KEY = 'finance_token';

const emptyAuth = {
  name: '',
  email: 'demo@financapp.com',
  password: '123456',
};

const emptyForm: TransactionForm = {
  title: '',
  amount: '',
  category: '',
  type: 'expense',
  description: '',
  date: new Date().toISOString().slice(0, 10),
};

const formatCurrency = (value: number) =>
  `R$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fetchJson = async <T,>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      (payload as { message?: string }).message ??
        'Erro ao comunicar com a API.',
    );
  }

  return payload as T;
};

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const [summary, setSummary] = useState<Summary>({
    income: 0,
    expense: 0,
    balance: 0,
  });

  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authData, setAuthData] = useState(emptyAuth);

  const [form, setForm] = useState<TransactionForm>(emptyForm);

  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);

  const [editForm, setEditForm] =
    useState<TransactionForm>(emptyForm);

  const [loading, setLoading] = useState(false);

  const loadData = async (authToken: string) => {
    const [transactionsData, summaryData] = await Promise.all([
      fetchJson<Transaction[]>('/api/transactions', {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),

      fetchJson<Summary>('/api/summary', {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),
    ]);

    setTransactions(transactionsData);
    setSummary(summaryData);
  };

  const restoreSession = async () => {
    const savedToken = await AsyncStorage.getItem(TOKEN_KEY);

    if (!savedToken) {
      return;
    }

    try {
      const payload = await fetchJson<{ user: User }>('/api/me', {
        headers: {
          Authorization: `Bearer ${savedToken}`,
        },
      });

      setToken(savedToken);
      setUser(payload.user);

      await loadData(savedToken);
    } catch (_error) {
      await AsyncStorage.removeItem(TOKEN_KEY);

      setToken(null);
      setUser(null);
    }
  };

  useEffect(() => {
    void restoreSession();
  }, []);

  // =========================
  // LOGIN / REGISTRO
  // =========================

  const handleAuthSubmit = async () => {
    try {
      setLoading(true);

      const endpoint =
        authMode === 'login'
          ? '/api/auth/login'
          : '/api/auth/register';

      const payload =
        authMode === 'login'
          ? {
              email: authData.email,
              password: authData.password,
            }
          : {
              name: authData.name,
              email: authData.email,
              password: authData.password,
            };

      const result = await fetchJson<{
        user: User;
        token: string;
      }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      await AsyncStorage.setItem(TOKEN_KEY, result.token);

      setToken(result.token);
      setUser(result.user);

      setAuthData(emptyAuth);

      await loadData(result.token);
    } catch (error) {
      Alert.alert(
        'Erro',
        error instanceof Error
          ? error.message
          : 'Não foi possível autenticar.',
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // CRIAR TRANSAÇÃO
  // =========================

  const handleTransactionSubmit = async () => {
    if (!token) {
      Alert.alert(
        'Sessão expirada',
        'Faça login novamente.',
      );
      return;
    }

    if (
      !form.title.trim() ||
      !form.amount ||
      !form.category.trim() ||
      !form.date
    ) {
      Alert.alert(
        'Dados incompletos',
        'Preencha título, valor, categoria e data.',
      );
      return;
    }

    const numericAmount = Number(
      form.amount.replace(',', '.'),
    );

    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert(
        'Valor inválido',
        'Digite um valor válido.',
      );
      return;
    }

    try {
      setLoading(true);

      await fetchJson<Transaction>('/api/transactions', {
        method: 'POST',

        headers: {
          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          title: form.title.trim(),
          amount: numericAmount,
          type: form.type,
          category: form.category.trim(),
          date: form.date,
          description: form.description.trim(),
        }),
      });

      setForm(emptyForm);

      await loadData(token);

      Alert.alert(
        'Sucesso',
        'Transação criada com sucesso.',
      );
    } catch (error) {
      Alert.alert(
        'Erro',
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar a transação.',
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // INICIAR EDIÇÃO
  // =========================

  const handleEditStart = (transaction: Transaction) => {
    setEditingTransaction(transaction);

    setEditForm({
      title: transaction.title,
      amount: String(transaction.amount),
      category: transaction.category,
      type: transaction.type,
      description: transaction.description ?? '',
      date: transaction.date,
    });
  };

  // =========================
  // SALVAR EDIÇÃO
  // =========================

  const handleEditTransaction = async () => {
    if (!token || !editingTransaction) {
      return;
    }

    if (
      !editForm.title.trim() ||
      !editForm.amount ||
      !editForm.category.trim() ||
      !editForm.date
    ) {
      Alert.alert(
        'Dados incompletos',
        'Preencha título, valor, categoria e data.',
      );
      return;
    }

    const numericAmount = Number(
      editForm.amount.replace(',', '.'),
    );

    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert(
        'Valor inválido',
        'Digite um valor válido.',
      );
      return;
    }

    try {
      setLoading(true);

      await fetchJson<Transaction>(
        `/api/transactions/${editingTransaction.id}`,
        {
          method: 'PUT',

          headers: {
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            title: editForm.title.trim(),
            amount: numericAmount,
            type: editForm.type,
            category: editForm.category.trim(),
            date: editForm.date,
            description: editForm.description.trim(),
          }),
        },
      );

      setEditingTransaction(null);
      setEditForm(emptyForm);

      await loadData(token);

      Alert.alert(
        'Sucesso',
        'Transação atualizada com sucesso.',
      );
    } catch (error) {
      Alert.alert(
        'Erro',
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar a transação.',
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // EXCLUIR TRANSAÇÃO
  // =========================

  const handleDeleteTransaction = (transaction: Transaction) => {
    Alert.alert(
      'Excluir transação',
      `Tem certeza que deseja excluir "${transaction.title}"?`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },

        {
          text: 'Excluir',
          style: 'destructive',

          onPress: async () => {
            if (!token) {
              return;
            }

            try {
              setLoading(true);

              await fetchJson(
                `/api/transactions/${transaction.id}`,
                {
                  method: 'DELETE',

                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                },
              );

              await loadData(token);

              Alert.alert(
                'Sucesso',
                'Transação excluída.',
              );
            } catch (error) {
              Alert.alert(
                'Erro',
                error instanceof Error
                  ? error.message
                  : 'Não foi possível excluir a transação.',
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  // =========================
  // LOGOUT
  // =========================

  const logout = async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);

    setToken(null);
    setUser(null);

    setTransactions([]);

    setSummary({
      income: 0,
      expense: 0,
      balance: 0,
    });
  };

  // =========================
  // LOGIN
  // =========================

  if (!token || !user) {
    return (
      <KeyboardAvoidingView
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
        style={styles.authScreen}
      >
        <View style={styles.authCard}>
          <Text style={styles.eyebrow}>
            Finance App
          </Text>

          <Text style={styles.title}>
            {authMode === 'login'
              ? 'Acessar conta'
              : 'Criar conta'}
          </Text>

          <View style={styles.switchRow}>
            <Pressable
              style={[
                styles.switchButton,
                authMode === 'login' &&
                  styles.switchButtonActive,
              ]}
              onPress={() => setAuthMode('login')}
            >
              <Text style={styles.switchText}>
                Login
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.switchButton,
                authMode === 'register' &&
                  styles.switchButtonActive,
              ]}
              onPress={() => setAuthMode('register')}
            >
              <Text style={styles.switchText}>
                Registrar
              </Text>
            </Pressable>
          </View>

          {authMode === 'register' && (
            <TextInput
              style={styles.input}
              placeholder="Nome"
              value={authData.name}
              onChangeText={(value) =>
                setAuthData((current) => ({
                  ...current,
                  name: value,
                }))
              }
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="E-mail"
            autoCapitalize="none"
            keyboardType="email-address"
            value={authData.email}
            onChangeText={(value) =>
              setAuthData((current) => ({
                ...current,
                email: value,
              }))
            }
          />

          <TextInput
            style={styles.input}
            placeholder="Senha"
            secureTextEntry
            value={authData.password}
            onChangeText={(value) =>
              setAuthData((current) => ({
                ...current,
                password: value,
              }))
            }
          />

          <Pressable
            style={styles.primaryButton}
            onPress={handleAuthSubmit}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading
                ? 'Aguarde...'
                : authMode === 'login'
                ? 'Entrar'
                : 'Criar conta'}
            </Text>
          </Pressable>
        </View>

        <StatusBar style="auto" />
      </KeyboardAvoidingView>
    );
  }

  // =========================
  // DASHBOARD
  // =========================

  return (
    <View style={styles.screen}>
      {/* HEADER */}

      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>
            Finance App
          </Text>

          <Text style={styles.pageTitle}>
            Dashboard
          </Text>

          <Text style={styles.userLabel}>
            Olá, {user.name}
          </Text>
        </View>

        <Pressable
          style={styles.logoutButton}
          onPress={logout}
        >
          <Text style={styles.logoutButtonText}>
            Sair
          </Text>
        </Pressable>
      </View>

      {/* RESUMO */}

      <View style={styles.summaryRow}>
        <View
          style={[
            styles.summaryCard,
            styles.incomeCard,
          ]}
        >
          <Text style={styles.summaryLabel}>
            Receitas
          </Text>

          <Text style={styles.summaryValue}>
            {formatCurrency(summary.income)}
          </Text>
        </View>

        <View
          style={[
            styles.summaryCard,
            styles.expenseCard,
          ]}
        >
          <Text style={styles.summaryLabel}>
            Despesas
          </Text>

          <Text style={styles.summaryValue}>
            {formatCurrency(summary.expense)}
          </Text>
        </View>

        <View
          style={[
            styles.summaryCard,
            styles.balanceCard,
          ]}
        >
          <Text style={styles.summaryLabel}>
            Saldo
          </Text>

          <Text style={styles.summaryValue}>
            {formatCurrency(summary.balance)}
          </Text>
        </View>
      </View>

      {/* NOVA TRANSAÇÃO */}

      <View style={styles.formCard}>
        <Text style={styles.cardTitle}>
          Nova transação
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Título"
          value={form.title}
          onChangeText={(value) =>
            setForm((current) => ({
              ...current,
              title: value,
            }))
          }
        />

        <View style={styles.rowTwo}>
          <TextInput
            style={[
              styles.input,
              styles.halfInput,
            ]}
            placeholder="Valor"
            keyboardType="numeric"
            value={form.amount}
            onChangeText={(value) =>
              setForm((current) => ({
                ...current,
                amount: value,
              }))
            }
          />

          <TextInput
            style={[
              styles.input,
              styles.halfInput,
            ]}
            placeholder="Categoria"
            value={form.category}
            onChangeText={(value) =>
              setForm((current) => ({
                ...current,
                category: value,
              }))
            }
          />
        </View>

        <View style={styles.rowTwo}>
          <TextInput
            style={[
              styles.input,
              styles.halfInput,
            ]}
            placeholder="Data"
            value={form.date}
            onChangeText={(value) =>
              setForm((current) => ({
                ...current,
                date: value,
              }))
            }
          />

          <Pressable
            style={[
              styles.typeButton,
              form.type === 'income' &&
                styles.typeButtonIncome,
            ]}
            onPress={() =>
              setForm((current) => ({
                ...current,
                type:
                  current.type === 'income'
                    ? 'expense'
                    : 'income',
              }))
            }
          >
            <Text style={styles.typeButtonText}>
              {form.type === 'income'
                ? 'Receita'
                : 'Despesa'}
            </Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Descrição"
          value={form.description}
          onChangeText={(value) =>
            setForm((current) => ({
              ...current,
              description: value,
            }))
          }
        />

        <Pressable
          style={styles.primaryButton}
          onPress={handleTransactionSubmit}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>
            {loading
              ? 'Salvando...'
              : 'Salvar transação'}
          </Text>
        </Pressable>
      </View>

      {/* HISTÓRICO */}

      <View style={styles.listCard}>
        <Text style={styles.cardTitle}>
          Histórico
        </Text>

        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View
              style={[
                styles.transactionItem,
                item.type === 'income'
                  ? styles.incomeItem
                  : styles.expenseItem,
              ]}
            >
              <View style={styles.transactionInfo}>
                <Text
                  style={styles.transactionTitle}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>

                <Text style={styles.transactionMeta}>
                  {item.category} · {item.date}
                </Text>

                {item.description ? (
                  <Text
                    style={styles.transactionDescription}
                    numberOfLines={1}
                  >
                    {item.description}
                  </Text>
                ) : null}
              </View>

              <View style={styles.transactionRight}>
                <Text style={styles.transactionAmount}>
                  {item.type === 'income'
                    ? '+'
                    : '-'}{' '}
                  {formatCurrency(item.amount)}
                </Text>

                {/* BOTÕES */}

                <View style={styles.actionRow}>
                  <Pressable
                    style={styles.editButton}
                    onPress={() =>
                      handleEditStart(item)
                    }
                  >
                    <Text style={styles.actionText}>
                      ✏️
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.deleteButton}
                    onPress={() =>
                      handleDeleteTransaction(item)
                    }
                  >
                    <Text style={styles.actionText}>
                      🗑️
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Nenhuma movimentação registrada.
            </Text>
          }
          contentContainerStyle={{
            paddingBottom: 20,
          }}
        />
      </View>

      {/* MODAL DE EDIÇÃO */}

      <Modal
        visible={editingTransaction !== null}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setEditingTransaction(null)
        }
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={
            Platform.OS === 'ios'
              ? 'padding'
              : undefined
          }
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Editar transação
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Título"
              value={editForm.title}
              onChangeText={(value) =>
                setEditForm((current) => ({
                  ...current,
                  title: value,
                }))
              }
            />

            <View style={styles.rowTwo}>
              <TextInput
                style={[
                  styles.input,
                  styles.halfInput,
                ]}
                placeholder="Valor"
                keyboardType="numeric"
                value={editForm.amount}
                onChangeText={(value) =>
                  setEditForm((current) => ({
                    ...current,
                    amount: value,
                  }))
                }
              />

              <TextInput
                style={[
                  styles.input,
                  styles.halfInput,
                ]}
                placeholder="Categoria"
                value={editForm.category}
                onChangeText={(value) =>
                  setEditForm((current) => ({
                    ...current,
                    category: value,
                  }))
                }
              />
            </View>

            <View style={styles.rowTwo}>
              <TextInput
                style={[
                  styles.input,
                  styles.halfInput,
                ]}
                placeholder="Data"
                value={editForm.date}
                onChangeText={(value) =>
                  setEditForm((current) => ({
                    ...current,
                    date: value,
                  }))
                }
              />

              <Pressable
                style={[
                  styles.typeButton,
                  editForm.type === 'income' &&
                    styles.typeButtonIncome,
                ]}
                onPress={() =>
                  setEditForm((current) => ({
                    ...current,
                    type:
                      current.type === 'income'
                        ? 'expense'
                        : 'income',
                  }))
                }
              >
                <Text style={styles.typeButtonText}>
                  {editForm.type === 'income'
                    ? 'Receita'
                    : 'Despesa'}
                </Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Descrição"
              value={editForm.description}
              onChangeText={(value) =>
                setEditForm((current) => ({
                  ...current,
                  description: value,
                }))
              }
            />

            <Pressable
              style={styles.primaryButton}
              onPress={handleEditTransaction}
              disabled={loading}
            >
              <Text style={styles.primaryButtonText}>
                {loading
                  ? 'Salvando...'
                  : 'Salvar alterações'}
              </Text>
            </Pressable>

            <Pressable
              style={styles.cancelButton}
              onPress={() =>
                setEditingTransaction(null)
              }
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>
                Cancelar
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <StatusBar style="auto" />
    </View>
  );
}

// =========================
// ESTILOS
// =========================

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#eef4ff',
    padding: 20,
    gap: 16,
  },

  authScreen: {
    flex: 1,
    backgroundColor: '#eef4ff',
    justifyContent: 'center',
    padding: 20,
  },

  authCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 24,

    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 16,

    elevation: 5,
  },

  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.2,
    color: '#4f46e5',
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 8,
    marginBottom: 18,
  },

  switchRow: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },

  switchButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },

  switchButtonActive: {
    backgroundColor: '#ffffff',
  },

  switchText: {
    fontWeight: '700',
    color: '#0f172a',
  },

  input: {
    borderWidth: 1,
    borderColor: '#dbe3f0',
    backgroundColor: '#f8fafc',
    borderRadius: 10,

    paddingHorizontal: 12,
    paddingVertical: 12,

    marginBottom: 12,

    color: '#0f172a',
  },

  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },

  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 4,
  },

  userLabel: {
    color: '#475569',
    marginTop: 4,
  },

  logoutButton: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },

  logoutButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },

  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },

  summaryCard: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
  },

  incomeCard: {
    backgroundColor: '#dcfce7',
  },

  expenseCard: {
    backgroundColor: '#fee2e2',
  },

  balanceCard: {
    backgroundColor: '#dbeafe',
  },

  summaryLabel: {
    color: '#334155',
    fontSize: 12,
    marginBottom: 4,
  },

  summaryValue: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },

  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
  },

  listCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },

  rowTwo: {
    flexDirection: 'row',
    gap: 10,
  },

  halfInput: {
    flex: 1,
  },

  typeButton: {
    flex: 1,

    borderWidth: 1,
    borderColor: '#dbe3f0',

    backgroundColor: '#fef2f2',

    borderRadius: 10,

    paddingHorizontal: 12,
    paddingVertical: 12,

    marginBottom: 12,

    justifyContent: 'center',
    alignItems: 'center',
  },

  typeButtonIncome: {
    backgroundColor: '#ecfdf5',
  },

  typeButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },

  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',

    padding: 12,

    borderRadius: 10,

    marginBottom: 8,
  },

  incomeItem: {
    backgroundColor: '#ecfdf5',
  },

  expenseItem: {
    backgroundColor: '#fef2f2',
  },

  transactionInfo: {
    flex: 1,
    marginRight: 10,
  },

  transactionTitle: {
    fontWeight: '700',
    fontSize: 14,
    color: '#0f172a',
  },

  transactionMeta: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4,
  },

  transactionDescription: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },

  transactionRight: {
    alignItems: 'flex-end',
    minWidth: 100,
  },

  transactionAmount: {
    fontWeight: '800',
    color: '#0f172a',
    fontSize: 13,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },

  editButton: {
    backgroundColor: '#dbeafe',
    borderRadius: 8,

    width: 34,
    height: 34,

    alignItems: 'center',
    justifyContent: 'center',
  },

  deleteButton: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,

    width: 34,
    height: 34,

    alignItems: 'center',
    justifyContent: 'center',
  },

  actionText: {
    fontSize: 16,
  },

  emptyText: {
    color: '#64748b',
    paddingVertical: 12,
  },

  // =========================
  // MODAL
  // =========================

  modalOverlay: {
    flex: 1,

    backgroundColor: 'rgba(15, 23, 42, 0.55)',

    justifyContent: 'center',

    padding: 20,
  },

  modalCard: {
    backgroundColor: '#ffffff',

    borderRadius: 20,

    padding: 20,

    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,

    elevation: 10,
  },

  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',

    marginBottom: 18,
  },

  cancelButton: {
    backgroundColor: '#e2e8f0',

    paddingVertical: 13,

    borderRadius: 10,

    alignItems: 'center',

    marginTop: 10,
  },

  cancelButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
});