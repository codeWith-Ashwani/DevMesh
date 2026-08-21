const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, trim: true, maxlength: 500, default: "" },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
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
    stage: { type: String, enum: ["Idea", "Building", "Launched"], default: "Idea" },
    commitment: { type: String, enum: ["Flexible", "5 hrs/week", "10 hrs/week", "20+ hrs/week"], default: "Flexible" },
    githubUrl: { type: String, trim: true },
    applications: [applicationSchema],
  },
  { timestamps: true }
);

projectSchema.index({ createdAt: -1 });
projectSchema.index({ creator: 1 });


module.exports = mongoose.model("Project", projectSchema);
