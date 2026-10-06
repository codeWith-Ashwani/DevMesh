const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, trim: true, maxlength: 60 },
    message: { type: String, trim: true, maxlength: 1000, default: "" },
    status: { type: String, enum: ["pending", "accepted", "rejected", "withdrawn"], default: "pending" },
  },
  { timestamps: true }
);

const projectSchema = new mongoose.Schema(
  {
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 100 },
    description: { type: String, required: true, trim: true, minlength: 20, maxlength: 2000 },
    techStack: [{ type: String, trim: true, maxlength: 40 }],
    rolesNeeded: [{ type: String, trim: true, maxlength: 60 }],
    roleOpenings: [{ title: { type: String, required: true, maxlength: 60 }, seats: { type: Number, min: 1, max: 10, default: 1 } }],
    firstDeliverable: { type: String, trim: true, maxlength: 500, default: '' },
    durationWeeks: { type: Number, min: 1, max: 52, default: 4 },
    goal: { type: String, enum: ['Learn together', 'Ship a portfolio project', 'Contribute to open source', 'Launch a product'], default: 'Ship a portfolio project' },
    demoUrl: { type: String, maxlength: 500, default: '' },
    outcome: { type: String, maxlength: 2000, default: '' },
    stage: { type: String, enum: ["Idea", "Building", "Launched"], default: "Idea" },
    commitment: { type: String, enum: ["Flexible", "5 hrs/week", "10 hrs/week", "20+ hrs/week"], default: "Flexible" },
    githubUrl: { type: String, trim: true },
    applications: [applicationSchema],
  },
  { timestamps: true, optimisticConcurrency: true }
);

projectSchema.index({ createdAt: -1, _id: -1 });
projectSchema.index({ creator: 1 });
projectSchema.index({ 'applications.user': 1, 'applications.status': 1 });


module.exports = mongoose.model("Project", projectSchema);
