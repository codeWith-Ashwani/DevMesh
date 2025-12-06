const mongoose = require("mongoose");

const connectDB = async () => {
  mongoose.connect(
    "mongodb+srv://work639280_db_user:La5udQvtNc1NELTr@cluster0.83xtjwl.mongodb.net/?appName=Cluster0"
  );
};

connectDB()
  .then(() => {
    console.log("Database connected successfully");
  })
  .catch((err) => {
    console.log("Database connection failed", err);
  });

module.exports = connectDB;
