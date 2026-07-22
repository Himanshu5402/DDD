import api from '../lib/axios.js';

export const ATTENDANCE_STATUSES = ['present', 'absent', 'half_day', 'leave', 'wfh', 'holiday'];
export const ATTENDANCE_LABELS = {
  present: 'Present',
  absent: 'Absent',
  half_day: 'Half day',
  leave: 'Leave',
  wfh: 'WFH',
  holiday: 'Holiday',
};

export const employeeAnalyticsApi = {
  async listRecords(params = {}) {
    const { data } = await api.get('/employee-analytics/records', { params });
    return data; // { data: records[], meta: { page, limit, total, ... } }
  },
  async createRecord(payload) {
    const { data } = await api.post('/employee-analytics/records', payload);
    return data.data.record;
  },
  async updateRecord(id, payload) {
    const { data } = await api.patch(`/employee-analytics/records/${id}`, payload);
    return data.data.record;
  },
  async removeRecord(id) {
    await api.delete(`/employee-analytics/records/${id}`);
  },
  async summary(params = {}) {
    const { data } = await api.get('/employee-analytics/summary', { params });
    return data.data; // { user, range, days, attendancePct, avgHours, avgProductivity, kpiAverages }
  },
  async team(params = {}) {
    const { data } = await api.get('/employee-analytics/team', { params });
    return data.data; // { range, team: [{ userId, name, email, department, presentDays, avgHours, avgProductivity }] }
  },
  async hrmsSync() {
    const { data } = await api.post('/employee-analytics/hrms-sync');
    return data; // { data: { synced, status }, message }
  },

  // --- HRMS employee write-through (owner acts on HRMS master data) ----------
  // Bodies use the HRMS employee shape: { name, dept, role, email, phone,
  // join, dob, salary, gender, access, managerId } — see the server validation.
  async createHrmsEmployee(payload) {
    const { data } = await api.post('/employee-analytics/employees', payload);
    return data; // { data: { user, employee }, message }
  },
  async updateHrmsEmployee(empId, payload) {
    const { data } = await api.put(`/employee-analytics/employees/${encodeURIComponent(empId)}`, payload);
    return data; // { data: { user, employee }, message }
  },
  async toggleHrmsEmployee(empId) {
    const { data } = await api.patch(`/employee-analytics/employees/${encodeURIComponent(empId)}/toggle-status`);
    return data; // { data: { user, employee }, message }
  },
};
