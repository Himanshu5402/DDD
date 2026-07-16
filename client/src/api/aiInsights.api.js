import api from '../lib/axios.js';

export const aiInsightsApi = {
  async dailyBrief() {
    const { data } = await api.post('/ai/insights/daily-brief');
    return data.data; // { brief, provider, snapshot }
  },
  async search(query, withSynthesis) {
    const body = { query };
    if (typeof withSynthesis === 'boolean') body.withSynthesis = withSynthesis;
    const { data } = await api.post('/ai/insights/search', body);
    return data.data; // { query, results, totalHits, synthesis, provider }
  },
};

/** Free-form copilot question (same endpoint the classic copilot uses). */
export async function askAi(prompt) {
  const { data } = await api.post('/ai/ask', { prompt });
  return data.data; // { text, provider, model, usage }
}
