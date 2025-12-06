const validator = require("validator");

const validateSingUpData = (req) => {
  const { firstName, lastName, email, password } = req.body;

  if (!firstName || firstName.length < 3 || firstName.length > 30) {
    throw new Error("First name must be between 3 and 30 characters");
  } else if (lastName && (lastName.length < 3 || lastName.length > 30)) {
    throw new Error("Last name must be between 3 and 30 characters");
  } else if (!validator.isEmail(email)) {
    throw new Error("Invalid email address");
  } else if (
    !validator.isStrongPassword(password, {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    })
  ) {
    throw new Error(
      "Password must be at least 8 characters long and include uppercase, lowercase letters, and numbers"
    );
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
    "gender"
  ];

  const isEditAllowed = Object.keys(req.body).every((field) =>
    allowedEditFields.includes(field)
  );
  return isEditAllowed;
};

module.exports = {
  validateSingUpData,
  validateEditProfileData,
};
