const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const connectDB = require("../src/config/database");
const User = require("../src/models/user");
connectDB();


const firstNames = ["Avery", "Noah", "Maya", "Theo", "Priya", "Ellis", "Zara", "Leo", "Amara", "Finn"];
const lastNames = ["Morgan", "Shaw", "Patel", "Bennett", "Khan", "Reed", "Clark", "Taylor", "Jones", "Walker"];
const cities = ["London", "Manchester", "Bristol", "Edinburgh", "Leeds", "Birmingham", "Glasgow", "Liverpool", "Cambridge", "Brighton"];
const stacks = [
  ["React", "TypeScript", "Node.js"], ["Python", "Django", "PostgreSQL"], ["Java", "Spring Boot", "AWS"],
  ["Vue", "Nuxt", "Firebase"], ["Go", "Docker", "Kubernetes"], ["Flutter", "Dart", "Firebase"],
  ["Next.js", "Tailwind CSS", "Vercel"], ["C#", ".NET", "Azure"], ["Rust", "WebAssembly", "Redis"],
  ["React Native", "GraphQL", "MongoDB"],
];
const goals = ["Job opportunities", "Project collaborators", "Study partners", "Mentorship", "Freelance work", "Open-source contributors"];
const bios = [
  "Building thoughtful products and always happy to talk about great developer experience.",
  "Full-stack builder who enjoys turning an ambitious idea into a polished launch.",
  "Curious engineer, open-source contributor, and enthusiastic coffee-shop debugger.",
  "Interested in accessible interfaces, practical AI, and shipping small projects often.",
  "Backend-minded product engineer looking for smart people to learn and build with.",
];

async function seedUsers() {
  await mongoose.connection.asPromise();
  const password = await bcrypt.hash("TempPass#2026", 10);
  const operations = Array.from({ length: 100 }, (_, index) => {
    const number = index + 1;
    const firstName = firstNames[index % firstNames.length];
    const lastName = lastNames[Math.floor(index / firstNames.length)];
    const city = cities[index % cities.length];
    const slug = `${firstName}-${lastName}-${number}`.toLowerCase();
    return {
      updateOne: {
        filter: { $or: [{ email: `demo.techie.${number}@devmesh.example` }, { email: `demo.techie.${number}@devtinder.example` }] },
        update: {
          $setOnInsert: {
            firstName,
            lastName,
            email: `demo.techie.${number}@devmesh.example`,
            password,
            age: 21 + (index % 18),
            gender: ["Male", "Female", "Other"][index % 3],
            photoUrl: `https://i.pravatar.cc/400?img=${(index % 70) + 1}`,
            about: `${bios[index % bios.length]} Based in ${city}, UK.`,
            skills: stacks[index % stacks.length],
            githubUrl: `https://github.com/${slug}`,
            linkedInUrl: `https://www.linkedin.com/in/${slug}`,
            portfolioUrl: `https://${slug}.dev`,
            lookingFor: goals[index % goals.length],
          },
        },
        upsert: true,
      },
    };
  });

  const result = await User.bulkWrite(operations, { ordered: false });
  console.log(`Seed complete: ${result.upsertedCount} new demo users added.`);
  await mongoose.disconnect();
}

seedUsers().catch(async (error) => {
  console.error("Unable to seed demo users:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
