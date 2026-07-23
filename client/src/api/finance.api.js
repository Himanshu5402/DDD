import api from '../lib/axios.js';

export const TRANSACTION_TYPES = ['income', 'expense'];
export const TRANSACTION_TYPE_LABELS = { income: 'Income', expense: 'Expense' };

export const PAYMENT_METHODS = ['cash', 'bank', 'upi', 'card', 'cheque', 'invoice', 'other'];
export const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  bank: 'Bank',
  upi: 'UPI',
  card: 'Card',
  cheque: 'Cheque',
  invoice: 'Invoice',
  other: 'Other',
};

export const BUDGET_PERIODS = ['monthly', 'quarterly', 'yearly'];
export const BUDGET_PERIOD_LABELS = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };

export const financeApi = {
  // --- Transactions ---
  async listTransactions(params = {}) {
    const { data } = await api.get('/finance/transactions', { params });
    return data; // { data: items, meta: { page, limit, total, ... } }
  },
  async getTransaction(id) {
    const { data } = await api.get(`/finance/transactions/${id}`);
    return data.data.transaction;
  },
  async createTransaction(payload) {
    const { data } = await api.post('/finance/transactions', payload);
    return data.data.transaction;
  },
  async updateTransaction(id, payload) {
    const { data } = await api.patch(`/finance/transactions/${id}`, payload);
    return data.data.transaction;
  },
  async removeTransaction(id) {
    await api.delete(`/finance/transactions/${id}`);
  },
  // Distinct custom payment-method labels saved so far (for the reusable dropdown).
  async listCustomMethods() {
    const { data } = await api.get('/finance/transactions/custom-methods');
    return data.data.methods || [];
  },
  // Dynamic dropdown options — admin-customizable categories + payment methods.
  async options() {
    const { data } = await api.get('/finance/options');
    return data.data; // { categories: [{key,label}], methods: [{key,label,refLabel}] }
  },
  async addOption({ kind, label, refLabel }) {
    const { data } = await api.post('/finance/options', { kind, label, refLabel });
    return data.data.option; // { key, label, refLabel? }
  },

  // --- Budgets ---
  async listBudgets(params = {}) {
    const { data } = await api.get('/finance/budgets', { params });
    return data; // { data: items, meta }
  },
  async createBudget(payload) {
    const { data } = await api.post('/finance/budgets', payload);
    return data.data.budget;
  },
  async updateBudget(id, payload) {
    const { data } = await api.patch(`/finance/budgets/${id}`, payload);
    return data.data.budget;
  },
  async removeBudget(id) {
    await api.delete(`/finance/budgets/${id}`);
  },

  // --- Summary / AI ---
  async summary(params = {}) {
    const { data } = await api.get('/finance/summary', { params });
    return data.data; // { from, to, totals, byCategory, monthly, budgetUsage }
  },
  async aiInsights(body = {}) {
    const { data } = await api.post('/finance/ai-insights', body);
    return data.data; // { insights, provider, model }
  },
};
