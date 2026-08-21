const jwt = require("jsonwebtoken");
const User = require("../models/user");
const { getJWTSecret } = require("../utils/security");

const userAuth = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ message: "Please Login" });
    }

    const decoded = jwt.verify(token, getJWTSecret());
    const { _id } = decoded;
    const user = await User.findById(_id);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized: User not found" });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};

module.exports = userAuth;
