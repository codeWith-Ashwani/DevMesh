const express = require("express");
const connectDB = require("./config/database");
const app = express();
const cookieParser = require("cookie-parser");
const cors = require("cors");

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));
app.use(express.json()); // to parse JSON request body
app.use(cookieParser()); // to parse cookies from request headers

const authRouter = require("./routes/authentication");
const profileRouter = require("./routes/profile");
const requestRouter = require("./routes/requests");
const usersRouter = require("./routes/users");

// app.use("/hello/2", (req, res) => {
//   res.send("Hello"); // order of the code matter for proper routing
// });

// app.use("/hello", (req, res) => {
//   res.send("Hello World!");
// });

// app.use("/test", (req, res) => {
//   res.send("Ashwani!");
// });

// app.use("/", (req, res) => {
//   // "/" this takes all the routes
//   res.send("Hello from  Ashwani!");
// });

// this will match all the HTTP methods API calls to /user if .use is used
// app.use("/user", (req, res) => {
//   res.send("u Fucked up!");
// });

// //this will only handle GET call to /user
// app.get("/user", (req, res) => {
//   res.send({ name: "Ashwani", age: 26, city: "Bangalore" });
// });

// app.post("/user", (req, res) => {
//   // saving data to database
//   res.send("Data has been saved successfully to the database");
// });

// app.delete("/user", (req, res) => {
//   // delete user from database
//   res.send("User has been deleted successfully from the database");
// });

// app.patch("/user", (req, res) => {
//   // update user in the database
//   res.send("User has been updated successfully in the database");
// });

// app.put("/user", (req, res) => {
//   // update user in the database
//   res.send("User has been updated successfully in the database using put");
// });

// /acd (/ab?cd) , /abbbbcd(/ab+cd) , /abANYTHINGcd (/ab*cd) ,/ad (/a(bc)d)
// app.get("/abcd", (req, res) => {
//   res.send("u Fucked up!");
// });

// app.get("/user", (req, res) => {
//   console.log(req.query);
//   res.send({ name: "Ashwani", age: 26, city: "Bangalore" });
// }); //http://localhost:7777/user?userid=101&password=testing it will give query parameters

// app.use(
//   // multiple routeHandler functions we can use array also
//   "/user",
//   //,rH,rH2,[rH3,rH4],rH5,...
//   (req, res, next) => {
//     console.log("This is the first callback function");
//     // res.send("this is the first callback function");
//     next();
//   },
//   (req, res) => {
//     console.log("This is the second callback function");
//     res.send("this is the second callback function");
//   }
// );

// Middleware for admin authorization

// app.use("/admin", (req, res, next) => {
//   const token = "xxx";
//   const isAdminAuthorized = token === "xxx";
//   if (!isAdminAuthorized) {
//     res.status(401).send("Access Denied for Admins");
//   } else {
//     next();
//   }
// });

// app.get("/admin/getAllData", (req, res) => {
//   res.send("send all data");
// });

// app.get("/admin/deleteAllData", (req, res) => {
//   res.send("deltete all data");
// });

// Error-handling middleware

// app.get("/userData", (req, res) => {
//   try {
//     throw new Error("Simulated server error");
//   } catch (err) {
//     res.status(500).send("Caught an error: " + err.message);
//   }
// });

// app.use("/", (err, req, res, next) => {
//   if (err) {
//     res.status(500).send("Something broke!");
//   }else {
//     next();
//   }
// });

// // get a user by email API
// app.get("/user", async (req, res) => {
//   const userEmail = req.body.email;

//   try {
//     const users = await User.find({ email: userEmail });
//     if (users.length === 0) {
//       return res.status(404).send("User not found");
//     } else {
//       res.send(users);
//     }
//   } catch (error) {
//     res.status(500).send("Error fetching user");
//   }
// });

// // Feed API to get all users from the database
// app.get("/feed", async (req, res) => {
//   try {
//     const users = await User.find({});
//     res.send(users);
//   } catch (error) {
//     res.status(500).send("Error fetching users");
//   }
// });

// // detele user API by ID
// app.delete("/user", async (req, res) => {
//   const userId = req.body.userId;
//   try {
//     const user = await User.findByIdAndDelete(userId);
//     res.send("User deleted successfully");
//   } catch (error) {
//     res.status(500).send("Error deleting user");
//   }
// });

// // update user API by ID
// app.patch("/user/:userId", async (req, res) => {
//   const userId = req.params?.userId;
//   const data = req.body;

//   // API level validation for allowed updates
//   try {
//     const ALLOWED_UPDATES = [
//       "firstName",
//       "lastName",
//       "password",
//       "age",
//       "gender",
//       "photoUrl",
//       "about",
//       "skills",
//     ];
//     const requestedUpdates = Object.keys(data);
//     const isValidOperation = requestedUpdates.every((update) =>
//       ALLOWED_UPDATES.includes(update)
//     );

//     if (!isValidOperation) {
//       throw new Error("Invalid updates!");
//     }
//     if (data?.skills.length > 5) {
//       throw new Error("Cannot have more than 5 skills");
//     }
//   } catch (error) {
//     return res.status(400).send(error.message);
//   }

//   try {
//     const user = await User.findByIdAndUpdate(userId, data, {
//       returnDocument: "after",
//       runValidators: true, // to run the validators defined in the schema during update
//     });
//     console.log(user);
//     res.send("User updated successfully");
//   } catch (error) {
//     res.status(500).send("Error updating user");
//   }
// });

// connect to the database and start the server

app.use("/", authRouter);
app.use("/", profileRouter);

app.use("/", requestRouter);
app.use("/", usersRouter);

connectDB()
  .then(() => {
    console.log("Database connected successfully");
    app.listen(7777, () => {
      console.log("Server is running on port 7777");
    });
  })
  .catch((err) => {
    console.error("database cannot be connected");
  });
