const mongoose = require("mongoose");
const validator = require("validator");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      index: true,
      minlength: 3,
      maxlength: 30,
      trim: true,
    },
    lastName: {
      type: String,
    },
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
      validate(value) {
        if (!validator.isEmail(value)) {
          throw new Error("Invalid email address");
        }
      },
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      trim: true,
    },
    age: {
      type: Number,
      min: 18,
    },
    gender: {
      type: String,
      validate(value) {
        // only run for new or modified documents
        if (!["Male", "Female", "Other"].includes(value)) {
          throw new Error("Gender must be Male, Female  or Other");
        }
      },
    },
    photoUrl: {
      type: String,
      default: "https://example.com/default-photo.png",
      validate(value) {
        if (!validator.isURL(value)) {
          throw new Error("Invalid URL for photo");
        }
      },
    },
    about: {
      type: String,
      default: "This user prefers to keep an air of mystery about them.",
    },
    skills: {
      type: [String],
    },
  },
  { timestamps: true } // automatically adds createdAt and updatedAt fields
);

userSchema.index({ firstName: 1, lastName: 1 });

userSchema.methods.getJWT = function () {
  const user = this;
  const token = jwt.sign({ _id: user._id }, "DEV@Tinder$790", {
    expiresIn: "1d",
  });
  return token;
};
module.exports = mongoose.model("User", userSchema);
