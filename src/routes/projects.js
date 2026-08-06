const express = require("express");
const Project = require("../models/project");
const userAuth = require("../middlewares/auth");

const projectsRouter = express.Router();
const allowedStages = ["Idea", "Building", "Launched"];
const allowedCommitments = ["Flexible", "5 hrs/week", "10 hrs/week", "20+ hrs/week"];

projectsRouter.post("/projects", userAuth, async (req, res) => {
  try {
    const { title, description, techStack, rolesNeeded, stage, commitment, githubUrl } = req.body;
    if (!title || !description || !Array.isArray(techStack) || !Array.isArray(rolesNeeded)) {
      return res.status(400).json({ message: "Title, description, tech stack, and roles are required" });
    }
    if (stage && !allowedStages.includes(stage)) return res.status(400).json({ message: "Invalid project stage" });
    if (commitment && !allowedCommitments.includes(commitment)) return res.status(400).json({ message: "Invalid commitment" });

    const project = await Project.create({ creator: req.user._id, title, description, techStack, rolesNeeded, stage, commitment, githubUrl });
    return res.status(201).json({ data: project });
  } catch (error) {
    return res.status(400).json({ message: "Unable to create project. Check the project details and try again." });
  }
});

projectsRouter.get("/projects", userAuth, async (req, res) => {
  try {
    const projects = await Project.find({})
      .sort({ createdAt: -1 })
      .populate("creator", "firstName lastName photoUrl skills")
      .select("title description techStack rolesNeeded stage commitment githubUrl creator applications createdAt")
      .lean();
    const data = projects.map(({ applications, ...project }) => ({
      ...project,
      applicationsCount: applications.length,
      hasApplied: applications.some((application) => application.user.toString() === req.user._id.toString()),
    }));
    return res.json({ data });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch projects" });
  }
});

projectsRouter.post("/projects/:projectId/apply", userAuth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (project.creator.equals(req.user._id)) return res.status(400).json({ message: "You cannot apply to your own project" });
    if (project.applications.some((application) => application.user.equals(req.user._id))) {
      return res.status(409).json({ message: "You have already applied to this project" });
    }
    project.applications.push({ user: req.user._id, message: req.body?.message || "" });
    await project.save();
    return res.status(201).json({ message: "Application sent successfully" });
  } catch (error) {
    return res.status(400).json({ message: "Unable to submit application" });
  }
});

projectsRouter.get("/projects/:projectId/applications", userAuth, async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, creator: req.user._id })
      .populate("applications.user", "firstName lastName photoUrl skills about");
    if (!project) return res.status(404).json({ message: "Project not found or access denied" });
    return res.json({ data: project.applications });
  } catch (error) {
    return res.status(400).json({ message: "Unable to fetch applications" });
  }
});

projectsRouter.patch("/projects/:projectId/applications/:applicationId", userAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["accepted", "rejected"].includes(status)) return res.status(400).json({ message: "Invalid application status" });
    const project = await Project.findOne({ _id: req.params.projectId, creator: req.user._id });
    if (!project) return res.status(404).json({ message: "Project not found or access denied" });
    const application = project.applications.id(req.params.applicationId);
    if (!application) return res.status(404).json({ message: "Application not found" });
    application.status = status;
    await project.save();
    return res.json({ message: `Application ${status}` });
  } catch (error) {
    return res.status(400).json({ message: "Unable to review application" });
  }
});

module.exports = projectsRouter;
