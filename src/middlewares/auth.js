const jwt = require("jsonwebtoken");
const User = require("../models/user");

const userAuth = async (req, res, next) => {
  // read the token from request cookies
  try {
    const token = req.cookies.token;
    if(!token){
      return res.status(401).send("Please Login");
    }

    const decoded = await jwt.verify(token, "DEV@Tinder$790");

    const { _id } = decoded;
    const user = await User.findById(_id);
    if (!user) {
      return res.status(401).send("Unauthorized: User not found");
    }
    req.user = user; // attach user to request object
    next();
  } catch (error) {
    return res.status(401).send("Unauthorized: Invalid token");
  }
};

module.exports = userAuth;
