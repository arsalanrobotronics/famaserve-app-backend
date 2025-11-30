const express = require("express");
const app = express();
const http = require("http");
const socketIo = require("socket.io");
let path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static("public"));

app.use(helmet());

app.use(mongoSanitize());

app.use(xss());
let authRoutes = require("./routes/auth/index");
let customerRoutes = require("./routes/customer/index");
let configurationsRoutes = require("./routes/configurations/index");
let notificationRoutes = require("./routes/notifications/index");

app.use(
  cors({
    origin: "*",
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

require("dotenv").config({ path: path.resolve(__dirname, "./../.env") });
require("./config/database")();
const { initializeSocketIO } = require("./controllers/Chat/SocketController");
initializeSocketIO(io);

// Initialize subscription cron jobs
const { startSubscriptionCron, checkExpiredSubscriptions } = require("./services/subscriptionCron");
startSubscriptionCron();

// Run initial check for expired subscriptions on startup
checkExpiredSubscriptions().then(updatedCount => {
  if (updatedCount > 0) {
    console.log(`Server startup: Updated ${updatedCount} expired subscriptions`);
  }
}).catch(error => {
  console.error('Error during startup subscription check:', error);
});

app.use("/auth/", authRoutes);
app.use("/customers/", customerRoutes);

// Add users routes (alias for customers for subscription endpoints)
app.use("/users/", customerRoutes);

app.use("/configurations/", configurationsRoutes);
app.use("/notifications/", notificationRoutes);

var port = process.env.PORT || 3001;

server.listen(port, "0.0.0.0", () => {
  console.log(`Application initiated on: ${port}`);
  console.log(`Real-time service active`);
});


module.exports = app;
