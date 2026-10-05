function match(profile, user, project) {
  const skills = new Set((user.skills || []).map(s => s.toLowerCase().trim()));
  const required = [...new Set(project.techStack.map(s => s.toLowerCase().trim()))];
  const shared = required.filter(skill => skills.has(skill));
  const hours = { '5 hrs/week': 5, '10 hrs/week': 10, '20+ hrs/week': 20 }[project.commitment] || 0;
  const commitment = hours === 0 || profile.hoursPerWeek >= hours;
  const duration = profile.durationWeeks >= (project.durationWeeks || 4);
  const role = (profile.roles || []).some(r => project.rolesNeeded.some(p => p.toLowerCase() === r.toLowerCase()));
  const goal = profile.goal === (project.goal || 'Ship a portfolio project');
  const score = Math.round((required.length ? shared.length / required.length : 0) * 50 + (commitment ? 20 : 0) + (duration ? 10 : 0) + (role ? 10 : 0) + (goal ? 10 : 0));
  const reasons = [];
  if (shared.length) reasons.push(`Matches ${shared.join(', ')}`);
  reasons.push(commitment ? 'Weekly availability fits' : 'Weekly availability below requested commitment');
  reasons.push(duration ? 'Project duration fits' : 'Prefers a shorter project');
  if (role) reasons.push('Matches a preferred role');
  reasons.push(goal ? 'Shared collaboration goal' : 'Different collaboration goal');
  return { score, reasons };
}
module.exports = { match };
