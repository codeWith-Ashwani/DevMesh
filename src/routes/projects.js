const express = require("express");
const validator = require("validator");
const Project = require("../models/project");
const userAuth = require("../middlewares/auth");
const { isValidObjectId } = require("../utils/validation");

const projectsRouter = express.Router();
const allowedStages = ["Idea", "Building", "Launched"];
const allowedCommitments = ["Flexible", "5 hrs/week", "10 hrs/week", "20+ hrs/week"];

projectsRouter.post("/projects", userAuth, async (req, res) => {
  try {
    const { title, description, techStack, rolesNeeded, stage, commitment, githubUrl, firstDeliverable = '', durationWeeks = 4, roleOpenings } = req.body;
    if (typeof firstDeliverable !== 'string' || firstDeliverable.length > 500 || !Number.isInteger(durationWeeks) || durationWeeks < 1 || durationWeeks > 52) return res.status(400).json({ message: 'Invalid deliverable or duration' });

    if (!title || typeof title !== "string" || title.trim().length < 3 || title.trim().length > 100) {
      return res.status(400).json({ message: "Title must be between 3 and 100 characters" });
    }

    if (!description || typeof description !== "string" || description.trim().length < 10 || description.trim().length > 2000) {
      return res.status(400).json({ message: "Description must be between 10 and 2000 characters" });
    }

    if (!Array.isArray(techStack) || techStack.length === 0 || techStack.length > 30) {
      return res.status(400).json({ message: "Tech stack must be an array of 1 to 30 items" });
    }
    for (const tech of techStack) {
      if (typeof tech !== "string" || tech.trim().length === 0 || tech.trim().length > 50) {
        return res.status(400).json({ message: "Each tech stack item must be a non-empty string up to 50 characters" });
      }
    }

    if (!Array.isArray(rolesNeeded) || rolesNeeded.length === 0 || rolesNeeded.length > 20) {
      return res.status(400).json({ message: "Roles needed must be an array of 1 to 20 items" });
    }
    for (const role of rolesNeeded) {
      if (typeof role !== "string" || role.trim().length === 0 || role.trim().length > 50) {
        return res.status(400).json({ message: "Each role must be a non-empty string up to 50 characters" });
      }
    }
    const openings = roleOpenings || rolesNeeded.map(title => ({ title, seats: 1 }));
    if (!Array.isArray(openings) || openings.length !== rolesNeeded.length || new Set(rolesNeeded.map(r => r.trim().toLowerCase())).size !== rolesNeeded.length || openings.some((o, i) => !o || o.title !== rolesNeeded[i] || !Number.isInteger(o.seats) || o.seats < 1 || o.seats > 10)) return res.status(400).json({ message: 'Provide unique roles with 1-10 seats each' });

    if (stage && !allowedStages.includes(stage)) {
      return res.status(400).json({ message: "Invalid project stage" });
    }
    if (commitment && !allowedCommitments.includes(commitment)) {
      return res.status(400).json({ message: "Invalid commitment" });
    }

    if (githubUrl) {
      if (typeof githubUrl !== "string" || !validator.isURL(githubUrl.trim(), { protocols: ["http", "https"], require_protocol: true })) {
        return res.status(400).json({ message: "Invalid GitHub URL" });
      }
    }

    const project = await Project.create({
      creator: req.user._id,
      title: title.trim(),
      description: description.trim(),
      techStack: techStack.map((s) => s.trim()),
      rolesNeeded: rolesNeeded.map((r) => r.trim()),
      roleOpenings: openings,
      firstDeliverable: firstDeliverable.trim(),
      durationWeeks,
      goal: req.body.goal || 'Ship a portfolio project',
      stage: stage || "Idea",
      commitment: commitment || "Flexible",
      githubUrl: githubUrl ? githubUrl.trim() : undefined,
    });

    return res.status(201).json({ data: project });
  } catch (error) {
    return res.status(400).json({ message: "Unable to create project. Check the project details and try again." });
  }
});

projectsRouter.get("/projects", userAuth, async (req, res) => {
  try {
    const parsedPage = parseInt(req.query.page, 10);
    const page = !isNaN(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const parsedLimit = parseInt(req.query.limit, 10);
    let limit = !isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;
    if (limit > 50) limit = 50;

    const skip = (page - 1) * limit;

    const projects = await Project.find({})
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate("creator", "firstName lastName photoUrl skills")
      .select("title description techStack rolesNeeded roleOpenings firstDeliverable durationWeeks goal stage commitment githubUrl demoUrl outcome creator applications createdAt")
      .lean();

    const data = projects.map(({ applications, ...project }) => ({
      ...project,
      applicationsCount: applications ? applications.length : 0,
      hasApplied: applications ? applications.some((application) => application.user.toString() === req.user._id.toString()) : false,
      isTeamMember: project.creator._id.toString() === req.user._id.toString() || applications.some(a => a.status === 'accepted' && a.user.toString() === req.user._id.toString()),
      teamSize: 1 + applications.filter(a => a.status === 'accepted').length,
      roleOpenings: (project.roleOpenings?.length ? project.roleOpenings : project.rolesNeeded.map(title => ({ title, seats: 1 }))).map(o => ({ ...o, filled: applications.filter(a => a.status === 'accepted' && (a.role || project.rolesNeeded[0]) === o.title).length })),
    }));

    return res.json({ data });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch projects" });
  }
});

projectsRouter.post("/projects/:projectId/apply", userAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isValidObjectId(projectId)) {
      return res.status(400).json({ message: "Invalid project ID format" });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (project.creator.equals(req.user._id)) {
      return res.status(400).json({ message: "You cannot apply to your own project" });
    }

    if (project.applications.some((application) => application.user.equals(req.user._id))) {
      return res.status(409).json({ message: "You have already applied to this project" });
    }

    const messageText = req.body?.message;
    if (messageText !== undefined && messageText !== null) {
      if (typeof messageText !== "string" || messageText.length > 1000) {
        return res.status(400).json({ message: "Application message cannot exceed 1000 characters" });
      }
    }

    const role = req.body.role || project.rolesNeeded[0];
    if (typeof role !== 'string' || !project.rolesNeeded.includes(role)) return res.status(400).json({ message: 'Choose an open project role' });
    const opening = project.roleOpenings.find(o => o.title === role);
    if (project.applications.filter(a => a.status === 'accepted' && (a.role || project.rolesNeeded[0]) === role).length >= (opening?.seats || 1)) return res.status(409).json({ message: 'Role is already filled' });
    const result = await Project.updateOne({ _id: projectId, creator: { $ne: req.user._id }, applications: { $not: { $elemMatch: { user: req.user._id } } }, $expr: { $lt: [{ $size: '$applications' }, 200] } }, { $push: { applications: { user: req.user._id, role, message: messageText ? messageText.trim() : '' } }, $inc: { __v: 1 } }, { runValidators: true });
    if (!result.modifiedCount) return res.status(409).json({ message: 'Already applied or application limit reached' });
    return res.status(201).json({ message: "Application sent successfully" });
  } catch (error) {
    return res.status(400).json({ message: "Unable to submit application" });
  }
});

projectsRouter.get("/projects/:projectId/applications", userAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isValidObjectId(projectId)) {
      return res.status(400).json({ message: "Invalid project ID format" });
    }

    const project = await Project.findById(projectId)
      .populate("applications.user", "firstName lastName photoUrl skills about")
      .lean();

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // IDOR Check: Authenticated user must be the creator of the project
    if (project.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied: You can only view applications for your own projects" });
    }

    return res.json({ data: project.applications || [] });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch applications" });
  }
});


projectsRouter.patch("/projects/:projectId/applications/:applicationId", userAuth, async (req, res) => {
  try {
    const { projectId, applicationId } = req.params;
    const { status } = req.body;

    if (!isValidObjectId(projectId)) {
      return res.status(400).json({ message: "Invalid project ID format" });
    }
    if (!isValidObjectId(applicationId)) {
      return res.status(400).json({ message: "Invalid application ID format" });
    }

    if (!status || !["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid application status. Must be 'accepted' or 'rejected'" });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // IDOR Check: Authenticated user must be the creator of the project
    if (!project.creator.equals(req.user._id)) {
      return res.status(403).json({ message: "Access denied: You can only review applications for your own projects" });
    }

    const application = project.applications.id(applicationId);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.status !== 'pending') return res.status(409).json({ message: 'Application has already been reviewed' });
    if (status === 'accepted') {
      const role = application.role || project.rolesNeeded[0];
      const seats = project.roleOpenings.find(o => o.title === role)?.seats || 1;
      if (project.applications.filter(a => a.status === 'accepted' && (a.role || project.rolesNeeded[0]) === role).length >= seats) return res.status(409).json({ message: 'Role is already filled' });
    }
    const result = await Project.updateOne({ _id: projectId, __v: project.__v, applications: { $elemMatch: { _id: applicationId, status: 'pending' } } }, { $set: { 'applications.$.status': status }, $inc: { __v: 1 } });
    if (!result.modifiedCount) return res.status(409).json({ message: 'Project changed; reload and try again' });

    return res.json({ message: `Application ${status}` });
  } catch (error) {
    return res.status(500).json({ message: "Unable to review application" });
  }
});

projectsRouter.patch("/projects/:projectId", userAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isValidObjectId(projectId)) {
      return res.status(400).json({ message: "Invalid project ID format" });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // IDOR Check: Authenticated user must be the creator
    if (!project.creator.equals(req.user._id)) {
      return res.status(403).json({ message: "Access denied: You can only modify your own projects" });
    }

    const allowedUpdates = ["title", "description", "techStack", "rolesNeeded", "stage", "commitment", "githubUrl"];
    const updates = req.body;

    const isUpdateAllowed = Object.keys(updates).every((field) => allowedUpdates.includes(field));
    if (!isUpdateAllowed) {
      return res.status(400).json({ message: "Invalid fields in project update" });
    }

    if (updates.title !== undefined) {
      if (typeof updates.title !== "string" || updates.title.trim().length < 3 || updates.title.trim().length > 100) {
        return res.status(400).json({ message: "Title must be between 3 and 100 characters" });
      }
      project.title = updates.title.trim();
    }

    if (updates.description !== undefined) {
      if (typeof updates.description !== "string" || updates.description.trim().length < 10 || updates.description.trim().length > 2000) {
        return res.status(400).json({ message: "Description must be between 10 and 2000 characters" });
      }
      project.description = updates.description.trim();
    }

    if (updates.techStack !== undefined) {
      if (!Array.isArray(updates.techStack) || updates.techStack.length === 0 || updates.techStack.length > 30) {
        return res.status(400).json({ message: "Tech stack must be an array of 1 to 30 items" });
      }
      project.techStack = updates.techStack.map((s) => s.trim());
    }

    if (updates.rolesNeeded !== undefined) {
      if (project.applications.length) return res.status(409).json({ message: 'Roles cannot change after applications arrive' });
      if (!Array.isArray(updates.rolesNeeded) || updates.rolesNeeded.length === 0 || updates.rolesNeeded.length > 20) {
        return res.status(400).json({ message: "Roles needed must be an array of 1 to 20 items" });
      }
      project.rolesNeeded = updates.rolesNeeded.map((r) => r.trim());
      project.roleOpenings = project.rolesNeeded.map(title => ({ title, seats: 1 }));
    }

    if (updates.stage !== undefined) {
      if (!allowedStages.includes(updates.stage)) {
        return res.status(400).json({ message: "Invalid project stage" });
      }
      project.stage = updates.stage;
    }

    if (updates.commitment !== undefined) {
      if (!allowedCommitments.includes(updates.commitment)) {
        return res.status(400).json({ message: "Invalid commitment" });
      }
      project.commitment = updates.commitment;
    }

    if (updates.githubUrl !== undefined) {
      if (updates.githubUrl && (typeof updates.githubUrl !== "string" || !validator.isURL(updates.githubUrl.trim(), { protocols: ["http", "https"], require_protocol: true }))) {
        return res.status(400).json({ message: "Invalid GitHub URL" });
      }
      project.githubUrl = updates.githubUrl ? updates.githubUrl.trim() : undefined;
    }

    const savedProject = await project.save();
    return res.json({ message: "Project updated successfully", data: savedProject });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update project" });
  }
});

projectsRouter.delete("/projects/:projectId", userAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!isValidObjectId(projectId)) {
      return res.status(400).json({ message: "Invalid project ID format" });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // IDOR Check: Authenticated user must be the creator
    if (!project.creator.equals(req.user._id)) {
      return res.status(403).json({ message: "Access denied: You can only delete your own projects" });
    }

    await project.deleteOne();
    return res.json({ message: "Project deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Unable to delete project" });
  }

});

module.exports = projectsRouter;
