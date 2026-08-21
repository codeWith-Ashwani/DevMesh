const getJWTSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FATAL: JWT_SECRET environment variable is not defined in production environment."
      );
    }
    // Fallback for local development if JWT_SECRET is not explicitly set in .env
    return "dev_default_jwt_secret_devmesh_secure_key";
  }
  return secret;
};

const getCookieOptions = (customOptions = {}) => {
  const isProduction = process.env.NODE_ENV === "production";
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
  const isProduction = process.env.NODE_ENV === "production";
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
