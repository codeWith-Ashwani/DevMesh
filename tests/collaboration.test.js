const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, stopTestServer, createTestUser, request } = require('./helpers/testUtils');
const { match } = require('../src/services/matching');
let owner, applicant, outsider, project, application;
describe('Team formation and shipping workflow', () => {
  before(async () => {
    await startTestServer(); owner = await createTestUser({ firstName: 'Owner' }); applicant = await createTestUser({ firstName: 'Applicant' }); outsider = await createTestUser({ firstName: 'Outsider' });
    const response = await request('POST', '/projects', { title: 'Developer project', description: 'A useful original developer collaboration project', techStack: ['React'], rolesNeeded: ['Frontend'], firstDeliverable: 'A working accessible interface', durationWeeks: 4 }, owner.cookie);
    assert.equal(response.status, 201); project = response.data.data;
  });
  after(stopTestServer);
  it('ranks compatible developers with explainable reasons', () => {
    const result = match({ goal: 'Ship a portfolio project', hoursPerWeek: 5, durationWeeks: 4, roles: ['Frontend'] }, { skills: ['react'] }, { techStack: ['React'], commitment: '5 hrs/week', rolesNeeded: ['Frontend'], durationWeeks: 4 });
    assert.equal(result.score, 100); assert.ok(result.reasons.includes('Weekly availability fits'));
  });
  it('renews availability and returns project suggestions without private fields', async () => {
    assert.equal((await request('PUT', '/collaboration/profile', { hoursPerWeek: 5, durationWeeks: 4, goal: 'Ship a portfolio project', roles: ['Frontend'] }, applicant.cookie)).status, 200);
    const response = await request('GET', '/collaboration/recommendations', null, applicant.cookie);
    assert.equal(response.status, 200); assert.equal(response.data.data[0]._id, project._id); assert.equal(response.data.data[0].applications, undefined);
  });
  it('allows only one application under simultaneous submissions', async () => {
    const responses = await Promise.all(Array.from({ length: 4 }, () => request('POST', `/projects/${project._id}/apply`, { role: 'Frontend', message: 'I can build this' }, applicant.cookie)));
    assert.equal(responses.filter(r => r.status === 201).length, 1);
    const list = await request('GET', `/projects/${project._id}/applications`, null, owner.cookie); application = list.data.data[0]; assert.equal(list.data.data.length, 1);
  });
  it('supports voluntary trial acceptance and mutual decisions', async () => {
    const created = await request('POST', `/projects/${project._id}/trials`, { participant: applicant._id, deliverable: 'Build a small accessible login form', dueAt: new Date(Date.now() + 7 * 86400000) }, owner.cookie);
    assert.equal(created.status, 201); const trial = created.data.data;
    assert.equal((await request('PATCH', `/collaboration/trials/${trial._id}`, { status: 'active' }, outsider.cookie)).status, 403);
    assert.equal((await request('PATCH', `/collaboration/trials/${trial._id}`, { status: 'active' }, applicant.cookie)).status, 200);
    const decisions = await Promise.all([request('PATCH', `/collaboration/trials/${trial._id}`, { decision: 'continue' }, owner.cookie), request('PATCH', `/collaboration/trials/${trial._id}`, { decision: 'continue' }, applicant.cookie)]);
    assert.ok(decisions.every(r => r.status === 200));
    const list = await request('GET', '/collaboration/trials', null, applicant.cookie); assert.equal(list.data.data[0].status, 'completed');
  });
  it('creates team access after acceptance and rejects outsiders', async () => {
    const accepted = await request('PATCH', `/projects/${project._id}/applications/${application._id}`, { status: 'accepted' }, owner.cookie); assert.equal(accepted.status, 200);
    assert.equal((await request('GET', `/projects/${project._id}/workspace`, null, applicant.cookie)).status, 200);
    assert.equal((await request('GET', `/projects/${project._id}/workspace`, null, outsider.cookie)).status, 403);
    const channel = await request('POST', `/conversations/project/${project._id}`, {}, applicant.cookie); assert.equal(channel.status, 200);
    assert.equal((await request('GET', `/conversations/${channel.data.data._id}/messages`, null, outsider.cookie)).status, 403);
  });
  it('requires evidence to complete milestones and computes real progress', async () => {
    const created = await request('POST', `/projects/${project._id}/milestones`, { title: 'Login flow', definitionOfDone: 'Accessible form and passing tests', assignee: applicant._id, dueAt: new Date(Date.now() + 86400000) }, owner.cookie);
    assert.equal(created.status, 201); const path = `/projects/${project._id}/milestones/${created.data.data._id}`;
    assert.equal((await request('PATCH', path, { status: 'building' }, applicant.cookie)).status, 200);
    assert.equal((await request('PATCH', path, { status: 'completed' }, applicant.cookie)).status, 400);
    assert.equal((await request('PATCH', path, { status: 'completed', evidenceUrl: 'https://github.com/example/project/pull/1' }, applicant.cookie)).status, 200);
    const workspace = await request('GET', `/projects/${project._id}/workspace`, null, owner.cookie); assert.equal(workspace.data.data.progress, 100);
  });
  it('publishes check-ins and a shipped outcome with ownership protection', async () => {
    assert.equal((await request('POST', `/projects/${project._id}/check-ins`, { completed: 'Login done', blockers: '', next: 'Review' }, applicant.cookie)).status, 201);
    const payload = { outcome: 'Shipped an accessible login experience together.', demoUrl: 'https://example.com/demo' };
    assert.equal((await request('PATCH', `/projects/${project._id}/showcase`, payload, outsider.cookie)).status, 403);
    assert.equal((await request('PATCH', `/projects/${project._id}/showcase`, payload, owner.cookie)).status, 200);
    const list = await request('GET', '/collaboration/showcase', null, applicant.cookie); assert.equal(list.data.data[0].title, project.title);
  });
  it('blocks cross-origin browser writes', async () => {
    const base = await startTestServer();
    const response = await fetch(`${base}/logout`, { method: 'POST', headers: { Cookie: owner.cookie, Origin: 'https://attacker.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 403);
  });
  it('does not overfill a role under concurrent owner reviews', async () => {
    const created = await request('POST', '/projects', { title: 'One seat project', description: 'A project with one role seat to test concurrent reviews.', techStack: ['React'], rolesNeeded: ['Frontend'] }, owner.cookie);
    const p = created.data.data;
    await request('POST', `/projects/${p._id}/apply`, { role: 'Frontend' }, applicant.cookie);
    await request('POST', `/projects/${p._id}/apply`, { role: 'Frontend' }, outsider.cookie);
    const applications = (await request('GET', `/projects/${p._id}/applications`, null, owner.cookie)).data.data;
    const results = await Promise.all(applications.map(a => request('PATCH', `/projects/${p._id}/applications/${a._id}`, { status: 'accepted' }, owner.cookie)));
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.equal(results.filter(r => r.status === 409).length, 1);
    const reviewed = (await request('GET', `/projects/${p._id}/applications`, null, owner.cookie)).data.data;
    assert.equal(reviewed.filter(a => a.status === 'accepted').length, 1);
  });
  it('revokes project channel and workspace access when a team member leaves', async () => {
    const channel = await request('POST', `/conversations/project/${project._id}`, {}, applicant.cookie);
    assert.equal(channel.status, 200);
    assert.equal((await request('DELETE', `/projects/${project._id}/team/${applicant._id}`, null, applicant.cookie)).status, 200);
    assert.equal((await request('GET', `/projects/${project._id}/workspace`, null, applicant.cookie)).status, 403);
    assert.equal((await request('GET', `/conversations/${channel.data.data._id}/messages`, null, applicant.cookie)).status, 403);
  });
});
