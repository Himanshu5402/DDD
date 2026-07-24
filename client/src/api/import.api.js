import api from '../lib/axios.js';

export const importApi = {
  /**
   * Parse an uploaded .xlsx/.xls/.csv/.pdf into {columns, rows, meta}.
   * `entity` + `fields` give the AI context when structuring a PDF.
   */
  async parse(file, { entity, fields } = {}) {
    const fd = new FormData();
    fd.append('file', file);
    if (entity) fd.append('entity', entity);
    if (fields?.length) {
      fd.append(
        'fields',
        JSON.stringify(fields.map(({ key, label, hint }) => ({ key, label, hint })))
      );
    }
    const { data } = await api.post('/import/parse', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data;
  },
};
