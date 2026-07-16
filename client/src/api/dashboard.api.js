import api from '../lib/axios.js';

export const dashboardApi = {
  async overview() {
    const { data } = await api.get('/dashboard/overview');
    // { generatedAt, tasks?, goals?, projects?, renewals?, support?,
    //   finance?, maintenance?, reporting?, employees? } — sections the user
    // cannot read are omitted by the server.
    return data.data;
  },
};
