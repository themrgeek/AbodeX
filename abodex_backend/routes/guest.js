const express = require("express");
const { body, validationResult } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const Property = require("../models/Property");
const Booking = require("../models/Booking");
const Review = require("../models/Review");
const {
  createPaymentIntent,
  confirmPaymentIntent,
} = require("../services/paymentService");
const { sendBookingConfirmation } = require("../services/smsService");

const router = express.Router();

// Search properties with filters
router.get("/properties", async (req, res) => {
  try {
    const {
      location,
      checkIn,
      checkOut,
      guests,
      minPrice,
      maxPrice,
      amenities,
      propertyType,
      page = 1,
      limit = 10,
    } = req.query;

    let filter = { isActive: true };

    // Location filter (city or coordinates)
    if (location) {
      if (typeof location === "string") {
        filter["address.city"] = new RegExp(location, "i");
      } else if (location.lat && location.lng) {
        filter["address.coordinates"] = {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(location.lng), parseFloat(location.lat)],
            },
            $maxDistance: 10000, // 10km radius
          },
        };
      }
    }

    // Price filter
    if (minPrice || maxPrice) {
      filter.pricePerNight = {};
      if (minPrice) filter.pricePerNight.$gte = parseInt(minPrice);
      if (maxPrice) filter.pricePerNight.$lte = parseInt(maxPrice);
    }

    // Property type filter
    if (propertyType) {
      filter.type = propertyType;
    }

    // Amenities filter
    if (amenities) {
      const amenityList = amenities.split(",");
      filter.amenities = { $all: amenityList };
    }

    // Availability filter
    if (checkIn && checkOut) {
      filter["availability"] = {
        $elemMatch: {
          startDate: { $lte: new Date(checkIn) },
          endDate: { $gte: new Date(checkOut) },
          isAvailable: true,
        },
      };
    }

    // Guests filter
    if (guests) {
      filter.maxGuests = { $gte: parseInt(guests) };
    }

    const properties = await Property.find(filter)
      .populate("host", "user hostTag")
      .populate("host.user", "firstName lastName")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

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

// Get property details
router.get("/properties/:id", async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate("host", "user hostTag totalBookings")
      .populate("host.user", "firstName lastName phone")
      .populate("reviews");

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    res.json(property);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Create booking
router.post(
  "/bookings",
  authenticate,
  [
    body("propertyId").isMongoId(),
    body("checkIn").isISO8601(),
    body("checkOut").isISO8601(),
    body("guestsCount").isInt({ min: 1 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { propertyId, checkIn, checkOut, guestsCount, specialRequests } =
        req.body;

      // Check property availability
      const property = await Property.findById(propertyId);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }

      // Calculate total amount
      const nights = Math.ceil(
        (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)
      );
      let totalAmount = nights * property.pricePerNight;

      // Apply discounts if available
      let discountAmount = 0;
      const applicableDiscounts = property.discounts.filter(
        (d) =>
          new Date(d.validFrom) <= new Date(checkIn) &&
          new Date(d.validUntil) >= new Date(checkOut) &&
          (!d.minNights || nights >= d.minNights)
      );

      if (applicableDiscounts.length > 0) {
        const bestDiscount = applicableDiscounts.reduce((prev, current) =>
          (current.discountType === "percentage"
            ? (totalAmount * current.value) / 100
            : current.value) >
          (prev.discountType === "percentage"
            ? (totalAmount * prev.value) / 100
            : prev.value)
            ? current
            : prev
        );

        discountAmount =
          bestDiscount.discountType === "percentage"
            ? (totalAmount * bestDiscount.value) / 100
            : bestDiscount.value;

        totalAmount -= discountAmount;
      }

      // Create payment intent
      const paymentIntent = await createPaymentIntent(totalAmount, "usd", {
        userId: req.user.id,
        propertyId,
        checkIn,
        checkOut,
      });

      // Create booking
      const booking = new Booking({
        guest: req.user.id,
        property: propertyId,
        checkIn,
        checkOut,
        guestsCount,
        totalAmount,
        discountAmount,
        specialRequests,
        paymentIntentId: paymentIntent.id,
      });

      await booking.save();

      res.json({
        booking,
        clientSecret: paymentIntent.client_secret,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Confirm booking payment
router.post("/bookings/:id/confirm", authenticate, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("property");

    if (!booking || booking.guest.toString() !== req.user.id) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const paymentIntent = await confirmPaymentIntent(booking.paymentIntentId);

    if (paymentIntent.status === "succeeded") {
      booking.status = "confirmed";
      booking.paymentStatus = "paid";
      booking.transactionId = paymentIntent.id;

      await booking.save();

      // Update property availability
      await Property.findByIdAndUpdate(booking.property._id, {
        $push: {
          availability: {
            startDate: booking.checkIn,
            endDate: booking.checkOut,
            isAvailable: false,
          },
        },
      });

      // Send confirmation SMS
      try {
        await sendBookingConfirmation(req.user.phone, {
          propertyTitle: booking.property.title,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          totalAmount: booking.totalAmount,
        });
      } catch (smsError) {
        console.error("SMS sending failed:", smsError);
      }

      res.json({ message: "Booking confirmed successfully", booking });
    } else {
      res.status(400).json({ message: "Payment failed" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Add review
router.post(
  "/reviews",
  authenticate,
  [
    body("bookingId").isMongoId(),
    body("propertyId").isMongoId(),
    body("rating").isInt({ min: 1, max: 5 }),
    body("comment").isLength({ min: 10 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { bookingId, propertyId, rating, comment } = req.body;

      // Check if booking exists and belongs to user
      const booking = await Booking.findOne({
        _id: bookingId,
        guest: req.user.id,
        property: propertyId,
        status: "completed",
      });

      if (!booking) {
        return res.status(404).json({ message: "Valid booking not found" });
      }

      // Check if review already exists
      const existingReview = await Review.findOne({ booking: bookingId });
      if (existingReview) {
        return res
          .status(400)
          .json({ message: "Review already exists for this booking" });
      }

      const review = new Review({
        guest: req.user.id,
        property: propertyId,
        booking: bookingId,
        rating,
        comment,
      });

      await review.save();
      res.status(201).json(review);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
