const jwt = require("jsonwebtoken");
const User = require("../models/user");
const { getJWTSecret } = require("../utils/security");
const mongoose = require('mongoose');
const { isValidObjectId } = require('../utils/validation');
const { isDatabaseUnavailable, unavailable } = require('../utils/availability');

const userAuth = async (req, res, next) => {
  let decoded;
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ message: "Please Login" });
    }

    decoded = jwt.verify(token, getJWTSecret(), { algorithms: ['HS256'] });
    if (!isValidObjectId(decoded._id)) throw new Error('Invalid subject');
  } catch {
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
  try {
    if (mongoose.connection.readyState !== 1) throw unavailable();
    const user = await User.findById(decoded._id);
    if (!user || (decoded.version || 0) !== (user.authVersion || 0)) {
      return res.status(401).json({ message: "Unauthorized: User not found" });
    }
    req.user = user;
    next();
  } catch (error) {
    return next(isDatabaseUnavailable(error) ? unavailable() : error);
  }
};

module.exports = userAuth;
