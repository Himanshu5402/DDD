import Campaign from '../../models/campaign.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';

const POPULATE = [{ path: 'createdBy', select: 'name email avatar' }];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFilter(query = {}) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.channel) filter.channel = query.channel;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: rx }];
  }
  return filter;
}

export async function listCampaigns(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildFilter(query);

  const [items, total] = await Promise.all([
    Campaign.find(filter).populate(POPULATE).sort(sort).skip(skip).limit(limit),
    Campaign.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function getCampaign(id) {
  const campaign = await Campaign.findById(id).populate(POPULATE);
  if (!campaign) throw ApiError.notFound('Campaign not found');
  return campaign;
}

export async function createCampaign(data, user) {
  const campaign = await Campaign.create({ ...data, createdBy: user._id });
  return Campaign.findById(campaign._id).populate(POPULATE);
}

const UPDATABLE = ['name', 'channel', 'status', 'budget', 'startDate', 'endDate'];

export async function updateCampaign(id, data) {
  const campaign = await Campaign.findById(id);
  if (!campaign) throw ApiError.notFound('Campaign not found');

  for (const f of UPDATABLE) if (data[f] !== undefined) campaign[f] = data[f];

  if (data.metrics !== undefined) {
    const current = campaign.metrics?.toObject ? campaign.metrics.toObject() : campaign.metrics || {};
    campaign.metrics = { ...current, ...data.metrics };
  }

  await campaign.save();
  return Campaign.findById(campaign._id).populate(POPULATE);
}

export async function deleteCampaign(id) {
  const campaign = await Campaign.findById(id);
  if (!campaign) throw ApiError.notFound('Campaign not found');
  await campaign.deleteOne();
  return { success: true };
}
