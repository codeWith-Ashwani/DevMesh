const env = require("../config/env");

const getJWTSecret = () => {
  return env.getJWTSecret();
};

const getCookieOptions = (customOptions = {}) => {
  const isProduction = env.isProduction;
  const defaultMaxAge = 24 * 60 * 60 * 1000; // 1 day in milliseconds

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: defaultMaxAge,
    ...customOptions,
  };
};

const getClearCookieOptions = () => {
  const isProduction = env.isProduction;
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    expires: new Date(0),
  };
};

module.exports = {
  getJWTSecret,
  getCookieOptions,
  getClearCookieOptions,
};
