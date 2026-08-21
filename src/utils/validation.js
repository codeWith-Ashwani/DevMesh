const validator = require("validator");

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

  if (!firstName || firstName.length < 3 || firstName.length > 30) {
    throw new Error("First name must be between 3 and 30 characters");
  } else if (lastName && (lastName.length < 3 || lastName.length > 30)) {
    throw new Error("Last name must be between 3 and 30 characters");
  } else if (!validator.isEmail(email)) {
    throw new Error("Invalid email address");
  } else {
    validatePassword(password);
  }
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

  const isEditAllowed = Object.keys(req.body).every((field) =>
    allowedEditFields.includes(field)
  );
  return isEditAllowed;
};

module.exports = {
  validateSingUpData,
  validateEditProfileData,
  validatePassword,
  getSafeUser,
  SAFE_USER_FIELDS,
};
