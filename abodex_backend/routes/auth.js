const express = require("express");
const { body, validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Host = require("../models/Host");
const { authenticate } = require("../middleware/auth");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../services/emailService");
const upload = require("../config/s3Config");

const router = express.Router();

// Generate JWT token
const generateToken = (id, isAdmin = false) => {
  return jwt.sign(
    { id },
    isAdmin ? process.env.JWT_ADMIN_SECRET : process.env.JWT_SECRET,
    {
      expiresIn: "30d",
    }
  );
};

// Register user
router.post(
  "/register",
  [
    body("email").isEmail(),
    body("password").isLength({ min: 6 }),
    body("firstName").notEmpty(),
    body("lastName").notEmpty(),
    body("phone").notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, firstName, lastName, phone } = req.body;

      // Check if user exists
      const userExists = await User.findOne({ email });
      if (userExists) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Create user
      const user = new User({
        email,
        password,
        firstName,
        lastName,
        phone,
      });

      await user.save();

      // Generate verification token
      const verificationToken = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET + user.password,
        { expiresIn: "1h" }
      );

      user.verificationToken = verificationToken;
      await user.save();

      // Send verification email
      await sendVerificationEmail(
        user.email,
        verificationToken,
        user.firstName
      );

      // Generate auth token
      const token = generateToken(user._id);

      res.status(201).json({
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Login user
router.post(
  "/login",
  [body("email").isEmail(), body("password").notEmpty()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Check if user exists
      const user = await User.findOne({ email });
      if (!user || !(await user.correctPassword(password, user.password))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Generate token
      const token = generateToken(user._id, user.role === "admin");

      res.json({
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Verify email
router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    // Find user by token
    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).json({ message: "Invalid token" });
    }

    // Verify token
    try {
      jwt.verify(token, process.env.JWT_SECRET + user.password);
    } catch (error) {
      return res.status(400).json({ message: "Token expired or invalid" });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.json({ message: "Email verified successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Forgot password
router.post("/forgot-password", [body("email").isEmail()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET + user.password,
      { expiresIn: "1h" }
    );

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send reset email
    await sendPasswordResetEmail(user.email, resetToken, user.firstName);

    res.json({ message: "Password reset email sent" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Reset password
router.post(
  "/reset-password",
  [body("token").notEmpty(), body("password").isLength({ min: 6 })],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { token, password } = req.body;

      const user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() },
      });

      if (!user) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }

      // Verify token
      try {
        jwt.verify(token, process.env.JWT_SECRET + user.password);
      } catch (error) {
        return res.status(400).json({ message: "Token expired or invalid" });
      }

      user.password = password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      res.json({ message: "Password reset successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Get current user
router.get("/me", authenticate, async (req, res) => {
  try {
    let hostProfile = null;

    if (req.user.role === "host") {
      hostProfile = await Host.findOne({ user: req.user.id });
    }

    res.json({
      user: {
        id: req.user._id,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        phone: req.user.phone,
        role: req.user.role,
        isVerified: req.user.isVerified,
      },
      hostProfile,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Become a host
router.post(
  "/become-host",
  authenticate,
  upload.array("idImages", 2),
  [
    body("governmentIdType").isIn(["passport", "driving_license"]),
    body("governmentIdNumber").notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Check if user is already a host
      const existingHost = await Host.findOne({ user: req.user.id });
      if (existingHost) {
        return res.status(400).json({ message: "User is already a host" });
      }

      const idImageUrls = req.files.map((file) => file.location);

      // Create host profile
      const host = new Host({
        user: req.user.id,
        governmentId: {
          type: req.body.governmentIdType,
          number: req.body.governmentIdNumber,
          images: idImageUrls,
        },
      });

      await host.save();

      // Update user role
      await User.findByIdAndUpdate(req.user.id, { role: "host" });

      res
        .status(201)
        .json({ message: "Host application submitted successfully", host });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
