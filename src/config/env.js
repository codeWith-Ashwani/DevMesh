try {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile();
  }
} catch (e) {
  // .env file is optional if environment variables are injected by container
}

const getJWTSecret = () => {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (isProd) {
      throw new Error("FATAL: JWT_SECRET environment variable is not defined in production");
    }
    return "DEVMESH_DEV_SECRET_DO_NOT_USE_IN_PROD_123456789";
  }
  return secret;
};

const getDBConnectionString = () => {
  const isProd = process.env.NODE_ENV === "production";
  const dbUri = process.env.DB_CONNECTION_STRING;
  if (!dbUri) {
    if (isProd) {
      throw new Error("FATAL: DB_CONNECTION_STRING environment variable is required in production");
    }
    return "mongodb+srv://work639280_db_user:La5udQvtNc1NELTr@cluster0.83xtjwl.mongodb.net/?appName=Cluster0";
  }
  return dbUri;
};

const getClientURL = () => {
  const isProd = process.env.NODE_ENV === "production";
  const clientUrl = process.env.CLIENT_URL;
  if (!clientUrl) {
    if (isProd) {
      throw new Error("FATAL: CLIENT_URL environment variable must be explicitly configured in production");
    }
    return "http://localhost:5173";
  }
  if (isProd && (clientUrl.includes("localhost") || clientUrl.includes("127.0.0.1"))) {
    console.warn("WARNING: CLIENT_URL is pointing to localhost in production environment");
  }
  return clientUrl;
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
