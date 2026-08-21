const mongoose = require("mongoose");
const validator = require("validator");

const isValidObjectId = (id) => {
  if (!id || typeof id !== "string" && !(id instanceof mongoose.Types.ObjectId)) {
    return false;
  }
  const idStr = id.toString();
  return mongoose.Types.ObjectId.isValid(idStr) && new mongoose.Types.ObjectId(idStr).toString() === idStr;
};

// Private DTO for the authenticated user themselves (includes their own email)
const SAFE_USER_FIELDS = [
  "_id",
  "firstName",
  "lastName",
  "email",
  "age",
  "gender",
  "photoUrl",
  "about",
  "skills",
  "githubUrl",
  "linkedInUrl",
  "portfolioUrl",
  "lookingFor",
  "createdAt",
  "updatedAt",
];

// Public DTO for developer directory / other users (strictly excludes email, password, authentication data)
const PUBLIC_USER_FIELDS = [
  "_id",
  "firstName",
  "lastName",
  "age",
  "gender",
  "photoUrl",
  "about",
  "skills",
  "githubUrl",
  "linkedInUrl",
  "portfolioUrl",
  "lookingFor",
  "createdAt",
];

const getSafeUser = (user) => {
  if (!user) return null;
  const userObj = typeof user.toObject === "function" ? user.toObject() : { ...user };
  const safeUser = {};
  for (const field of SAFE_USER_FIELDS) {
    if (userObj[field] !== undefined) {
      safeUser[field] = userObj[field];
    }
  }
  return safeUser;
};

const getPublicUser = (user) => {
  if (!user) return null;
  const userObj = typeof user.toObject === "function" ? user.toObject() : { ...user };
  const publicUser = {};
  for (const field of PUBLIC_USER_FIELDS) {
    if (userObj[field] !== undefined) {
      publicUser[field] = userObj[field];
    }
  }
  return publicUser;
};

const validatePassword = (password) => {
  if (!password || typeof password !== "string") {
    throw new Error("Password is required");
  }
  if (
    !validator.isStrongPassword(password, {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    })
  ) {
    throw new Error(
      "Password must be at least 8 characters long and include uppercase, lowercase letters, numbers, and symbols"
    );
  }
};

const validateSingUpData = (req) => {
  const { firstName, lastName, email, password } = req.body;

  if (!firstName || typeof firstName !== "string" || firstName.trim().length < 3 || firstName.trim().length > 30) {
    throw new Error("First name must be between 3 and 30 characters");
  }
  if (lastName !== undefined && lastName !== null) {
    if (typeof lastName !== "string" || (lastName.trim().length > 0 && (lastName.trim().length < 2 || lastName.trim().length > 30))) {
      throw new Error("Last name must be between 2 and 30 characters");
    }
  }
  if (!email || typeof email !== "string" || !validator.isEmail(email)) {
    throw new Error("Invalid email address");
  }
  validatePassword(password);
};

const validateEditProfileData = (req) => {
  const allowedEditFields = [
    "firstName",
    "lastName",
    "email",
    "photoUrl",
    "about",
    "skills",
    "age",
    "gender",
    "githubUrl",
    "linkedInUrl",
    "portfolioUrl",
    "lookingFor",
  ];

  const bodyKeys = Object.keys(req.body);
  if (bodyKeys.length === 0) {
    return true;
  }

  const isEditAllowed = bodyKeys.every((field) =>
    allowedEditFields.includes(field)
  );
  if (!isEditAllowed) {
    return false;
  }

  const {
    firstName,
    lastName,
    age,
    gender,
    photoUrl,
    about,
    skills,
    githubUrl,
    linkedInUrl,
    portfolioUrl,
    lookingFor,
  } = req.body;

  if (firstName !== undefined) {
    if (typeof firstName !== "string" || firstName.trim().length < 3 || firstName.trim().length > 30) {
      throw new Error("First name must be between 3 and 30 characters");
    }
  }

  if (lastName !== undefined && lastName !== null && lastName !== "") {
    if (typeof lastName !== "string" || lastName.trim().length > 30) {
      throw new Error("Last name cannot exceed 30 characters");
    }
  }

  if (age !== undefined && age !== null && age !== "") {
    const parsedAge = Number(age);
    if (isNaN(parsedAge) || parsedAge < 18 || parsedAge > 120) {
      throw new Error("Age must be a valid number of at least 18");
    }
  }

  if (gender !== undefined && gender !== null && gender !== "") {
    if (!["Male", "Female", "Other"].includes(gender)) {
      throw new Error("Gender must be Male, Female or Other");
    }
  }

  if (photoUrl) {
    if (typeof photoUrl !== "string" || !validator.isURL(photoUrl, { protocols: ["http", "https"], require_protocol: true })) {
      throw new Error("Invalid photo URL");
    }
  }

  if (about !== undefined && about !== null) {
    if (typeof about !== "string" || about.length > 2000) {
      throw new Error("About section cannot exceed 2000 characters");
    }
  }

  if (skills !== undefined && skills !== null) {
    if (!Array.isArray(skills)) {
      throw new Error("Skills must be an array of strings");
    }
    if (skills.length > 50) {
      throw new Error("Cannot have more than 50 skills");
    }
    for (const skill of skills) {
      if (typeof skill !== "string" || skill.length > 50) {
        throw new Error("Each skill must be a string up to 50 characters");
      }
    }
  }

  const urlValidator = (url, name) => {
    if (url && typeof url === "string" && url.trim() !== "") {
      if (!validator.isURL(url.trim(), { protocols: ["http", "https"], require_protocol: true })) {
        throw new Error(`Invalid ${name} URL`);
      }
    }
  };

  urlValidator(githubUrl, "GitHub");
  urlValidator(linkedInUrl, "LinkedIn");
  urlValidator(portfolioUrl, "Portfolio");

  if (lookingFor !== undefined && lookingFor !== null && lookingFor !== "") {
    const allowedLookingFor = [
      "Job opportunities",
      "Project collaborators",
      "Study partners",
      "Mentorship",
      "Freelance work",
      "Open-source contributors",
    ];
    if (!allowedLookingFor.includes(lookingFor)) {
      throw new Error("Invalid objective for lookingFor");
    }
  }

  return true;
};

module.exports = {
  isValidObjectId,
  validateSingUpData,
  validateEditProfileData,
  validatePassword,
  getSafeUser,
  getPublicUser,
  SAFE_USER_FIELDS,
  PUBLIC_USER_FIELDS,
};

