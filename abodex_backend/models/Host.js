const mongoose = require("mongoose");

const hostSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  governmentId: {
    type: {
      type: String,
      enum: ["passport", "driving_license"],
      required: true,
    },
    number: {
      type: String,
      required: true,
    },
    images: [String], // S3 URLs
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  verificationDate: Date,
  hostSince: {
    type: Date,
    default: Date.now,
  },
  earnings: {
    type: Number,
    default: 0,
  },
  totalBookings: {
    type: Number,
    default: 0,
  },
  hostTag: {
    type: String,
    enum: ["bronze", "silver", "gold", null],
    default: null,
  },
  bankDetails: {
    accountNumber: String,
    routingNumber: String,
    accountHolderName: String,
  },
});

module.exports = mongoose.model("Host", hostSchema);
