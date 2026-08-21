const mongoose = require("mongoose");

const connectDB = async () => {
  return mongoose.connect(
    process.env.DB_CONNECTION_STRING ||
      "mongodb+srv://work639280_db_user:La5udQvtNc1NELTr@cluster0.83xtjwl.mongodb.net/?appName=Cluster0"
  );
};

module.exports = connectDB;

