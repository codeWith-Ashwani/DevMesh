try {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile();
  }
} catch (e) {
  // .env file is optional if environment variables are injected by container/host
}

const getJWTSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "FATAL: JWT_SECRET environment variable is required. Please define it in your .env or environment configuration."
    );
  }
  if (process.env.NODE_ENV === 'production' && secret.length < 32) throw new Error('FATAL: JWT_SECRET must contain at least 32 characters in production');
  return secret;
};

const getDBConnectionString = () => {
  const dbUri = process.env.DB_CONNECTION_STRING;
  if (!dbUri) {
    throw new Error(
      "FATAL: DB_CONNECTION_STRING environment variable is required. Please define it in your .env or environment configuration."
    );
  }
  return dbUri;
};

const getClientURL = () => {
  const isProd = process.env.NODE_ENV === "production";
  const clientUrl = process.env.CLIENT_URL;
  if (!clientUrl) {
    if (isProd) {
      throw new Error(
        "FATAL: CLIENT_URL environment variable must be explicitly configured in production."
      );
    }
    return "http://localhost:5173";
  }
  if (isProd && (clientUrl.includes("localhost") || clientUrl.includes("127.0.0.1"))) {
    console.warn("WARNING: CLIENT_URL is pointing to localhost in production environment.");
  }
  try { const url = new URL(clientUrl); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error(); return url.origin; }
  catch { throw new Error('FATAL: CLIENT_URL must be an HTTP(S) origin without a path'); }
};

const config = {
  get NODE_ENV() {
    return process.env.NODE_ENV || "development";
  },
  get isProduction() {
    return (process.env.NODE_ENV || "development") === "production";
  },
  get isTest() {
    return (process.env.NODE_ENV || "development") === "test";
  },
  get isDevelopment() {
    return (process.env.NODE_ENV || "development") === "development";
  },
  get PORT() {
    return parseInt(process.env.PORT, 10) || 7777;
  },
  getJWTSecret,
  getDBConnectionString,
  getClientURL,
  get RATE_LIMIT_LOGIN_MAX() {
    return parseInt(process.env.RATE_LIMIT_LOGIN_MAX, 10) || 10;
  },
  get RATE_LIMIT_SIGNUP_MAX() {
    return parseInt(process.env.RATE_LIMIT_SIGNUP_MAX, 10) || 10;
  },
  get RATE_LIMIT_PASSWORD_MAX() {
    return parseInt(process.env.RATE_LIMIT_PASSWORD_MAX, 10) || 5;
  },
};

module.exports = config;
