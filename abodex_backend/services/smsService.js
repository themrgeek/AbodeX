const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

exports.sendSMS = async (to, message) => {
  try {
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to,
    });
    return result;
  } catch (error) {
    console.error("Twilio error:", error);
    throw new Error("Failed to send SMS");
  }
};

exports.sendBookingConfirmation = async (phone, bookingDetails) => {
  const message = `Your booking at ${bookingDetails.propertyTitle} is confirmed. Check-in: ${bookingDetails.checkIn}, Check-out: ${bookingDetails.checkOut}. Total: $${bookingDetails.totalAmount}.`;
  return await this.sendSMS(phone, message);
};

exports.sendBookingReminder = async (phone, bookingDetails) => {
  const message = `Reminder: Your stay at ${bookingDetails.propertyTitle} starts tomorrow. Check-in time is after 3 PM.`;
  return await this.sendSMS(phone, message);
};
