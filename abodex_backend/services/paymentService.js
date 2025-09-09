const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

exports.createPaymentIntent = async (
  amount,
  currency = "usd",
  metadata = {}
) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      metadata,
    });
    return paymentIntent;
  } catch (error) {
    console.error("Stripe error:", error);
    throw new Error("Payment processing failed");
  }
};

exports.confirmPaymentIntent = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error("Stripe error:", error);
    throw new Error("Payment confirmation failed");
  }
};

exports.refundPayment = async (paymentIntentId, amount) => {
  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: Math.round(amount * 100),
    });
    return refund;
  } catch (error) {
    console.error("Stripe error:", error);
    throw new Error("Refund processing failed");
  }
};
