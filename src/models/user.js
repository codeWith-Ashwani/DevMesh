const mongoose = require("mongoose");
const validator = require("validator");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema(
  {
    authVersion: { type: Number, default: 0 },
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
    githubUrl: {
      type: String,
      trim: true,
      validate(value) {
        if (value && !validator.isURL(value, { protocols: ["http", "https"], require_protocol: true })) {
          throw new Error("Invalid GitHub URL");
        }
      },
    },
    linkedInUrl: {
      type: String,
      trim: true,
      validate(value) {
        if (value && !validator.isURL(value, { protocols: ["http", "https"], require_protocol: true })) {
          throw new Error("Invalid LinkedIn URL");
        }
      },
    },
    portfolioUrl: {
      type: String,
      trim: true,
      validate(value) {
        if (value && !validator.isURL(value, { protocols: ["http", "https"], require_protocol: true })) {
          throw new Error("Invalid portfolio URL");
        }
      },
    },
    lookingFor: {
      type: String,
      enum: [
        "Job opportunities",
        "Project collaborators",
        "Study partners",
        "Mentorship",
        "Freelance work",
        "Open-source contributors",
      ],
    },
  },
  { timestamps: true } // automatically adds createdAt and updatedAt fields
);

userSchema.index({ firstName: 1, lastName: 1 });

const { getJWTSecret } = require("../utils/security");

userSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

userSchema.set("toObject", {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

userSchema.methods.getJWT = function () {
  const user = this;
  const token = jwt.sign({ _id: user._id, version: user.authVersion || 0 }, getJWTSecret(), {
    expiresIn: "1d",
  });
  return token;
};

userSchema.methods.toSafeObject = function () {
  const userObj = this.toObject();
  delete userObj.password;
  delete userObj.__v;
  return userObj;
};

module.exports = mongoose.model("User", userSchema);
