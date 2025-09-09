const mongoose = require("mongoose");

const propertySchema = new mongoose.Schema({
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Host",
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["apartment", "house", "room", "villa", "cottage"],
    required: true,
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String,
    coordinates: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        index: "2dsphere",
      },
    },
  },
  amenities: [String],
  pricePerNight: {
    type: Number,
    required: true,
  },
  maxGuests: {
    type: Number,
    required: true,
  },
  bedrooms: {
    type: Number,
    required: true,
  },
  bathrooms: {
    type: Number,
    required: true,
  },
  images: [String], // S3 URLs
  availability: [
    {
      startDate: Date,
      endDate: Date,
      isAvailable: {
        type: Boolean,
        default: true,
      },
    },
  ],
  discounts: [
    {
      name: String,
      description: String,
      discountType: {
        type: String,
        enum: ["percentage", "fixed"],
      },
      value: Number,
      minNights: Number,
      validFrom: Date,
      validUntil: Date,
    },
  ],
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

propertySchema.index({ "address.coordinates": "2dsphere" });

module.exports = mongoose.model("Property", propertySchema);
