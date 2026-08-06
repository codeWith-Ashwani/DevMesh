const mongoose = require("mongoose");
require("../src/config/database");
const User = require("../src/models/user");
const Project = require("../src/models/project");

const title = "DevMesh — Find your next build partner";

async function seedAshProject() {
  await mongoose.connection.asPromise();
  const matches = await User.find({ firstName: /^ash$/i, lastName: /^singh$/i }).select("_id firstName lastName");
  if (matches.length !== 1) throw new Error(`Expected exactly one Ash Singh profile, found ${matches.length}`);

  const ash = matches[0];
  const result = await Project.updateOne(
    { creator: ash._id, title: { $in: [title, "DevConnect — Find your next build partner"] } },
    {
      $setOnInsert: {
        creator: ash._id,
        title,
        description: "A focused collaboration space for developers to discover compatible teammates, share project ideas, and turn side-project conversations into working products. We are building the first version around meaningful profiles, project applications, and a clean team workspace.",
        techStack: ["React", "Node.js", "MongoDB", "Express", "Tailwind CSS"],
        rolesNeeded: ["Frontend developer", "UI/UX designer", "Backend developer"],
        stage: "Building",
        commitment: "5 hrs/week",
        githubUrl: "https://github.com/ash-singh/devmesh-demo",
      },
    },
    { upsert: true }
  );

  console.log(result.upsertedCount ? "Demo project created for Ash Singh." : "Ash Singh demo project already exists.");
  await mongoose.disconnect();
}

seedAshProject().catch(async (error) => {
  console.error("Unable to seed Ash Singh's demo project:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
