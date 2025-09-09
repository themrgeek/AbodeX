const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

// Import routes
const authRoutes = require("./routes/auth");
const guestRoutes = require("./routes/guest");
const hostRoutes = require("./routes/host");
const adminRoutes = require("./routes/admin");

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/guest", guestRoutes);
app.use("/api/host", hostRoutes);
app.use("/api/admin", adminRoutes);

// Health check endpoint
app.get("/health", (_req, res) => {
  res.status(200).json({ message: "Server is running!" });
});

// Error handling middleware
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Something went wrong!" });
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Database connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
