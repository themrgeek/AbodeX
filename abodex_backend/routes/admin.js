const express = require("express");
const { authenticateAdmin } = require("../middleware/auth");
const User = require("../models/User");
const Host = require("../models/Host");
const Property = require("../models/Property");
const Booking = require("../models/Booking");
const Review = require("../models/Review");

const router = express.Router();

// Get dashboard stats
router.get("/dashboard", authenticateAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalHosts = await Host.countDocuments();
    const totalProperties = await Property.countDocuments();
    const totalBookings = await Booking.countDocuments();
    const totalRevenue = await Booking.aggregate([
      { $match: { paymentStatus: "paid" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);

    const recentBookings = await Booking.find()
      .populate("guest", "firstName lastName")
      .populate("property")
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      totalUsers,
      totalHosts,
      totalProperties,
      totalBookings,
      totalRevenue: totalRevenue[0]?.total || 0,
      recentBookings,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all users
router.get("/users", authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, role } = req.query;
    const filter = role ? { role } : {};

    const users = await User.find(filter)
      .select("-password")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(filter);

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all hosts with stats
router.get("/hosts", authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const hosts = await Host.find()
      .populate("user", "firstName lastName email phone")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ earnings: -1 });

    // Calculate host rankings
    const allHosts = await Host.find().populate("user");
    const sortedHosts = allHosts.sort((a, b) => b.earnings - a.earnings);

    // Assign tags based on percentiles
    sortedHosts.forEach((host, index) => {
      const percentile = (index + 1) / sortedHosts.length;
      if (percentile <= 0.01) {
        host.hostTag = "gold";
      } else if (percentile <= 0.1) {
        host.hostTag = "silver";
      } else if (percentile <= 0.3) {
        host.hostTag = "bronze";
      } else {
        host.hostTag = null;
      }
    });

    // Save updated tags
    await Promise.all(sortedHosts.map((host) => host.save()));

    const total = await Host.countDocuments();

    res.json({
      hosts,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Verify host
router.patch("/hosts/:id/verify", authenticateAdmin, async (req, res) => {
  try {
    const host = await Host.findByIdAndUpdate(
      req.params.id,
      {
        isVerified: true,
        verificationDate: new Date(),
      },
      { new: true }
    ).populate("user");

    if (!host) {
      return res.status(404).json({ message: "Host not found" });
    }

    res.json(host);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all properties
router.get("/properties", authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const filter = status ? { isActive: status === "active" } : {};

    const properties = await Property.find(filter)
      .populate("host")
      .populate("host.user", "firstName lastName")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Property.countDocuments(filter);

    res.json({
      properties,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Toggle property status
router.patch("/properties/:id/status", authenticateAdmin, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    property.isActive = !property.isActive;
    await property.save();

    res.json(property);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all bookings
router.get("/bookings", authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const filter = status ? { status } : {};

    const bookings = await Booking.find(filter)
      .populate("guest", "firstName lastName email")
      .populate("property")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Booking.countDocuments(filter);

    res.json({
      bookings,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
