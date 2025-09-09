const express = require("express");
const { body, validationResult } = require("express-validator");
const { authenticateHost } = require("../middleware/auth");
const upload = require("../config/s3Config");
const Property = require("../models/Property");
const Host = require("../models/Host");
const Booking = require("../models/Booking");
const Review = require("../models/Review");

const router = express.Router();

// Get host dashboard
router.get("/dashboard", authenticateHost, async (req, res) => {
  try {
    const host = await Host.findOne({ user: req.user.id });

    const properties = await Property.find({ host: host._id });
    const bookings = await Booking.find({
      property: { $in: properties.map((p) => p._id) },
      status: "confirmed",
    })
      .populate("property")
      .populate("guest", "firstName lastName");

    const reviews = await Review.find({
      property: { $in: properties.map((p) => p._id) },
    }).populate("guest", "firstName lastName");

    const totalEarnings = bookings.reduce(
      (sum, booking) => sum + booking.totalAmount,
      0
    );
    const upcomingBookings = bookings.filter(
      (b) => new Date(b.checkIn) > new Date()
    );

    res.json({
      host,
      properties: properties.length,
      bookings: bookings.length,
      upcomingBookings: upcomingBookings.length,
      totalEarnings,
      reviews: reviews.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Create property
router.post(
  "/properties",
  authenticateHost,
  upload.array("images", 10),
  [
    body("title").notEmpty(),
    body("description").notEmpty(),
    body("type").isIn(["apartment", "house", "room", "villa", "cottage"]),
    body("pricePerNight").isNumeric(),
    body("maxGuests").isInt({ min: 1 }),
    body("bedrooms").isInt({ min: 0 }),
    body("bathrooms").isInt({ min: 0 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const host = await Host.findOne({ user: req.user.id });
      if (!host) {
        return res.status(404).json({ message: "Host profile not found" });
      }

      const imageUrls = req.files.map((file) => file.location);

      const property = new Property({
        host: host._id,
        ...req.body,
        images: imageUrls,
        address: {
          ...req.body.address,
          coordinates: req.body.coordinates
            ? [
                parseFloat(req.body.coordinates.lng),
                parseFloat(req.body.coordinates.lat),
              ]
            : undefined,
        },
        amenities: JSON.parse(req.body.amenities || "[]"),
        availability: JSON.parse(req.body.availability || "[]"),
      });

      await property.save();
      res.status(201).json(property);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Update property
router.put(
  "/properties/:id",
  authenticateHost,
  upload.array("images", 10),
  async (req, res) => {
    try {
      const host = await Host.findOne({ user: req.user.id });
      const property = await Property.findOne({
        _id: req.params.id,
        host: host._id,
      });

      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }

      // Handle new images if uploaded
      if (req.files && req.files.length > 0) {
        const newImageUrls = req.files.map((file) => file.location);
        req.body.images = [...property.images, ...newImageUrls];
      }

      // Parse JSON fields if they exist
      if (req.body.amenities) {
        req.body.amenities = JSON.parse(req.body.amenities);
      }
      if (req.body.availability) {
        req.body.availability = JSON.parse(req.body.availability);
      }
      if (req.body.discounts) {
        req.body.discounts = JSON.parse(req.body.discounts);
      }

      const updatedProperty = await Property.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

      res.json(updatedProperty);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Get host properties
router.get("/properties", authenticateHost, async (req, res) => {
  try {
    const host = await Host.findOne({ user: req.user.id });
    const properties = await Property.find({ host: host._id });
    res.json(properties);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get property bookings
router.get("/bookings", authenticateHost, async (req, res) => {
  try {
    const host = await Host.findOne({ user: req.user.id });
    const properties = await Property.find({ host: host._id });
    const bookings = await Booking.find({
      property: { $in: properties.map((p) => p._id) },
    })
      .populate("property")
      .populate("guest", "firstName lastName email phone");

    res.json(bookings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update booking status
router.patch(
  "/bookings/:id",
  authenticateHost,
  [body("status").isIn(["confirmed", "cancelled", "completed"])],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const host = await Host.findOne({ user: req.user.id });
      const properties = await Property.find({ host: host._id });

      const booking = await Booking.findOne({
        _id: req.params.id,
        property: { $in: properties.map((p) => p._id) },
      });

      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      booking.status = req.body.status;
      await booking.save();

      res.json(booking);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Reply to review
router.post(
  "/reviews/:id/reply",
  authenticateHost,
  [body("reply").notEmpty()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const host = await Host.findOne({ user: req.user.id });
      const properties = await Property.find({ host: host._id });

      const review = await Review.findOne({
        _id: req.params.id,
        property: { $in: properties.map((p) => p._id) },
      });

      if (!review) {
        return res.status(404).json({ message: "Review not found" });
      }

      review.hostReply = req.body.reply;
      await review.save();

      res.json(review);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
