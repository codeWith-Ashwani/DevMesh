const router = require('express').Router();
const auth = require('../middlewares/auth');
const Profile = require('../models/collaborationProfile');
const Project = require('../models/project');
const Milestone = require('../models/milestone');
const Trial = require('../models/trial');
const CheckIn = require('../models/checkIn');
const { projectMembers } = require('../services/chat');
const { match } = require('../services/matching');
const { fail, id, text, endpoint } = require('../utils/domain');
const { throttle } = require('../services/throttle');
const validator = require('validator');
const date = value => { const d = new Date(value); if (!Number.isFinite(d.getTime()) || d <= new Date() || d > new Date(Date.now() + 366 * 86400000)) fail(400, 'Choose a future deadline within one year'); return d; };
const url = value => { if (typeof value !== 'string' || value.length > 500 || (value && !validator.isURL(value, { protocols: ['https', 'http'], require_protocol: true }))) fail(400, 'Invalid evidence URL'); return value; };
async function team(userId, projectId, ownerOnly = false) {
  const project = await Project.findById(id(projectId)).lean();
  if (!project) fail(404, 'Project not found');
  const members = projectMembers(project);
  if (ownerOnly ? String(project.creator) !== String(userId) : !members.includes(String(userId))) fail(403, 'Project access denied');
  return { project, members };
}
router.use(['/collaboration', '/projects'], auth);
router.use(['/collaboration', '/projects'], (req, res, next) => { if (req.method === 'GET') return next(); throttle(`collaboration:${req.user._id}`, 60).then(() => next()).catch(e => res.status(e.status || 503).json({ message: e.message })); });
router.get('/collaboration/profile', endpoint(async (req, res) => res.json({ data: await Profile.findOne({ user: req.user._id }).lean() })));
router.put('/collaboration/profile', endpoint(async (req, res) => {
  const { hoursPerWeek, durationWeeks, goal, roles } = req.body;
  if (!Number.isInteger(hoursPerWeek) || hoursPerWeek < 1 || hoursPerWeek > 40 || !Number.isInteger(durationWeeks) || durationWeeks < 1 || durationWeeks > 52 || !Array.isArray(roles) || roles.length > 10) fail(400, 'Invalid availability');
  const data = await Profile.findOneAndUpdate({ user: req.user._id }, { $set: { hoursPerWeek, durationWeeks, goal, roles: roles.map(r => text(r, 1, 60)), availableUntil: new Date(Date.now() + 30 * 86400000) } }, { upsert: true, returnDocument: 'after', runValidators: true });
  res.json({ data });
}));
router.get('/collaboration/recommendations', endpoint(async (req, res) => {
  const profile = await Profile.findOne({ user: req.user._id, availableUntil: { $gt: new Date() } }).lean();
  if (!profile) fail(400, 'Renew your collaboration availability first');
  const filter = { creator: { $ne: req.user._id }, stage: { $ne: 'Launched' } };
  if (req.query.before) filter._id = { $lt: id(req.query.before) };
  const projects = await Project.find(filter).sort({ _id: -1 }).limit(51).populate('creator', 'firstName lastName').lean();
  const hasMore = projects.length > 50;
  if (hasMore) projects.pop();
  const data = projects.map(p => ({ _id: p._id, title: p.title, techStack: p.techStack, rolesNeeded: p.rolesNeeded, commitment: p.commitment, durationWeeks: p.durationWeeks, firstDeliverable: p.firstDeliverable, ...match(profile, req.user, p) })).sort((a,b) => b.score - a.score || String(a._id).localeCompare(String(b._id)));
  res.json({ data, hasMore, before: projects.at(-1)?._id || null });
}));
router.get('/projects/:projectId/collaborators', endpoint(async (req, res) => {
  const { project } = await team(req.user._id, req.params.projectId, true);
  const filter = { user: { $ne: req.user._id }, availableUntil: { $gt: new Date() } };
  if (req.query.before) filter._id = { $lt: id(req.query.before) };
  const profiles = await Profile.find(filter).sort({ _id: -1 }).limit(51).populate('user', 'firstName lastName skills photoUrl').lean();
  const hasMore = profiles.length > 50;
  if (hasMore) profiles.pop();
  res.json({ data: profiles.filter(p => p.user).map(p => ({ user: p.user, hoursPerWeek: p.hoursPerWeek, goal: p.goal, ...match(p, p.user, project) })).sort((a,b) => b.score - a.score), hasMore, before: profiles.at(-1)?._id || null });
}));
router.get('/projects/:projectId/workspace', endpoint(async (req, res) => {
  const { project, members } = await team(req.user._id, req.params.projectId);
  const User = require('../models/user');
  const [people, milestones, checkIns, trials, total, completed] = await Promise.all([
    User.find({ _id: { $in: members } }).select('firstName lastName photoUrl skills').lean(),
    Milestone.find({ project: project._id }).sort({ _id: -1 }).limit(50).lean(),
    CheckIn.find({ project: project._id }).sort({ _id: -1 }).limit(30).populate('user', 'firstName lastName').lean(),
    Trial.find({ project: project._id, $or: [{ owner: req.user._id }, { participant: req.user._id }] }).sort({ _id: -1 }).limit(30).lean(),
    Milestone.countDocuments({ project: project._id }),
    Milestone.countDocuments({ project: project._id, status: 'completed' }),
  ]);
  const { applications, ...safeProject } = project;
  res.json({ data: { project: safeProject, members: people, milestones, checkIns, trials, progress: total ? Math.round(completed / total * 100) : 0, totalMilestones: total } });
}));
router.post('/projects/:projectId/milestones', endpoint(async (req, res) => {
  const { project, members } = await team(req.user._id, req.params.projectId, true);
  const assignee = id(req.body.assignee);
  if (!members.includes(String(assignee))) fail(400, 'Assign a team member');
  res.status(201).json({ data: await Milestone.create({ project: project._id, creator: req.user._id, assignee, title: text(req.body.title, 3, 100), definitionOfDone: text(req.body.definitionOfDone, 5, 1000), dueAt: date(req.body.dueAt) }) });
}));
router.patch('/projects/:projectId/milestones/:milestoneId', endpoint(async (req, res) => {
  const { project } = await team(req.user._id, req.params.projectId);
  const milestone = await Milestone.findOne({ _id: id(req.params.milestoneId), project: project._id });
  if (!milestone) fail(404, 'Milestone not found');
  if (String(project.creator) !== String(req.user._id) && String(milestone.assignee) !== String(req.user._id)) fail(403, 'Only the assignee or project owner can update this milestone');
  const transitions = { planned: ['building'], building: ['completed', 'planned'], completed: [] };
  if (!transitions[milestone.status].includes(req.body.status)) fail(409, 'Invalid milestone transition');
  const evidenceUrl = req.body.evidenceUrl === undefined ? milestone.evidenceUrl : url(req.body.evidenceUrl);
  if (req.body.status === 'completed' && !evidenceUrl) fail(400, 'Link evidence before completing a milestone');
  const data = await Milestone.findOneAndUpdate({ _id: milestone._id, status: milestone.status }, { $set: { status: req.body.status, evidenceUrl } }, { returnDocument: 'after', runValidators: true });
  if (!data) fail(409, 'Milestone changed; reload');
  res.json({ data });
}));
router.post('/projects/:projectId/check-ins', endpoint(async (req, res) => {
  await team(req.user._id, req.params.projectId);
  res.status(201).json({ data: await CheckIn.create({ project: req.params.projectId, user: req.user._id, completed: text(req.body.completed, 1, 1000), blockers: text(req.body.blockers || 'None', 1, 1000), next: text(req.body.next, 1, 1000) }) });
}));
router.delete('/projects/:projectId/team/:userId', endpoint(async (req, res) => {
  const { project } = await team(req.user._id, req.params.projectId);
  const member = String(id(req.params.userId));
  if (member === String(project.creator)) fail(400, 'Project owner cannot leave');
  if (String(project.creator) !== String(req.user._id) && member !== String(req.user._id)) fail(403, 'Only the owner can remove another member');
  const result = await Project.updateOne({ _id: project._id, applications: { $elemMatch: { user: member, status: 'accepted' } } }, { $set: { 'applications.$.status': 'withdrawn' }, $inc: { __v: 1 } });
  if (!result.modifiedCount) fail(409, 'Member is no longer on the team');
  res.json({ message: 'Team membership ended' });
}));
router.delete('/projects/:projectId/application', endpoint(async (req, res) => {
  const result = await Project.updateOne({ _id: id(req.params.projectId), applications: { $elemMatch: { user: req.user._id, status: 'pending' } } }, { $set: { 'applications.$.status': 'withdrawn' }, $inc: { __v: 1 } });
  if (!result.modifiedCount) fail(409, 'No pending application to withdraw');
  res.json({ message: 'Application withdrawn' });
}));
router.post('/projects/:projectId/trials', endpoint(async (req, res) => {
  const { project } = await team(req.user._id, req.params.projectId, true);
  const participant = id(req.body.participant);
  if (!project.applications.some(a => String(a.user) === String(participant) && a.status === 'pending')) fail(400, 'Invite a pending applicant');
  const dueAt = date(req.body.dueAt);
  if (dueAt > new Date(Date.now() + 14 * 86400000)) fail(400, 'Trials must finish within 14 days');
  res.status(201).json({ data: await Trial.create({ project: project._id, owner: req.user._id, participant, deliverable: text(req.body.deliverable, 5, 1000), dueAt }) });
}));
router.get('/collaboration/trials', endpoint(async (req, res) => {
  const filter = { $or: [{ owner: req.user._id }, { participant: req.user._id }] };
  if (req.query.before) filter._id = { $lt: id(req.query.before) };
  const rows = await Trial.find(filter).sort({ _id: -1 }).limit(31).populate('project', 'title').lean();
  const hasMore = rows.length > 30;
  if (hasMore) rows.pop();
  res.json({ data: rows, hasMore, before: rows.at(-1)?._id || null });
}));
router.patch('/collaboration/trials/:trialId', endpoint(async (req, res) => {
  const trial = await Trial.findById(id(req.params.trialId));
  if (!trial) fail(404, 'Trial not found');
  const owner = String(trial.owner) === String(req.user._id);
  const participant = String(trial.participant) === String(req.user._id);
  if (!owner && !participant) fail(403, 'Trial access denied');
  if (!await Project.exists({ _id: trial.project })) fail(404, 'Project not found');
  const updates = {};
  if (trial.status === 'invited') {
    if (!participant || !['active', 'declined'].includes(req.body.status) || trial.dueAt <= new Date()) fail(409, 'Participant must accept or decline an unexpired invitation');
    updates.status = req.body.status;
  } else if (trial.status === 'active') {
    if (!['continue', 'stop'].includes(req.body.decision)) fail(400, 'Choose continue or stop');
    const field = owner ? 'ownerDecision' : 'participantDecision';
    if (trial[field] !== 'pending') fail(409, 'Decision already recorded');
    updates[field] = req.body.decision;
    if (req.body.evidenceUrl !== undefined) updates.evidenceUrl = url(req.body.evidenceUrl);
  } else fail(409, 'Trial is closed');
  const filter = { _id: trial._id, status: trial.status };
  if (updates.ownerDecision) filter.ownerDecision = 'pending';
  if (updates.participantDecision) filter.participantDecision = 'pending';
  const data = await Trial.findOneAndUpdate(filter, { $set: updates }, { returnDocument: 'after', runValidators: true });
  if (!data) fail(409, 'Trial changed; reload');
  // Atomic predicate handles simultaneous decisions by both participants.
  await Trial.updateOne({ _id: trial._id, status: 'active', ownerDecision: { $ne: 'pending' }, participantDecision: { $ne: 'pending' } }, { $set: { status: 'completed' } });
  res.json({ data: await Trial.findById(trial._id).lean() });
}));
router.patch('/projects/:projectId/showcase', endpoint(async (req, res) => {
  await team(req.user._id, req.params.projectId, true);
  const outcome = text(req.body.outcome, 10, 2000);
  const demoUrl = url(req.body.demoUrl);
  if (!demoUrl) fail(400, 'Provide a demo link');
  res.json({ data: await Project.findByIdAndUpdate(req.params.projectId, { $set: { outcome, demoUrl, stage: 'Launched' }, $inc: { __v: 1 } }, { returnDocument: 'after', runValidators: true }).select('-applications') });
}));
router.get('/collaboration/showcase', endpoint(async (req, res) => {
  const filter = { stage: 'Launched', outcome: { $ne: '' }, demoUrl: { $ne: '' } };
  if (req.query.before) filter._id = { $lt: id(req.query.before) };
  const rows = await Project.find(filter).sort({ _id: -1 }).limit(21).select('title outcome demoUrl githubUrl creator').populate('creator', 'firstName lastName').lean();
  const hasMore = rows.length > 20;
  if (hasMore) rows.pop();
  res.json({ data: rows, hasMore, before: rows.at(-1)?._id || null });
}));
module.exports = router;

