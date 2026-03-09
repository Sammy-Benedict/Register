const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const Student = require("../models/Student");

const router = express.Router();

// debug helper: mask secret in logs
const maskSecret = (s) => (s ? `***${String(s).slice(-4)}` : '<none>');

const getPaystackSecret = () =>
  process.env.PAYSTACK_SECRET || process.env.PAYSTACK_SECRET_KEY || "";

const hasConfiguredSecret = (secret) => {
  const normalized = String(secret || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("your_paystack_secret_key")) return false;
  if (normalized.includes("replace_with")) return false;
  return true;
};

router.post("/pay", async (req, res) => {
  try {
    const { studentId, amount, callbackUrl } = req.body;
    const secret = getPaystackSecret();

    // debug logging – will show if the secret is loaded
    console.log("[/api/payment/pay] request", { studentId, amount, callbackUrl, secret: maskSecret(secret) });

    if (!studentId || !amount) {
      return res.status(400).json({ status: "error", message: "studentId and amount are required" });
    }

    if (!hasConfiguredSecret(secret)) {
      return res.status(500).json({
        status: "error",
        message: "Payment gateway not configured. Set a real PAYSTACK_SECRET or PAYSTACK_SECRET_KEY."
      });
    }

    const amountPesewas = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountPesewas) || amountPesewas <= 0) {
      return res.status(400).json({ status: "error", message: "amount must be a valid number greater than 0" });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ status: "error", message: "Student not found" });
    }

    // Prepare Paystack initialize payload (GHS amounts are sent in pesewas)
    const { mobile } = req.body || {};
    const initializePayload = {
      email: student.email,
      amount: amountPesewas,
      currency: "GHS",
      callback_url: callbackUrl || process.env.PAYSTACK_CALLBACK_URL,
      metadata: {
        studentId: student._id,
        indexNumber: student.indexNumber,
        fullName: student.fullName
      }
    };

    // If mobile money details were provided, request mobile_money channel and include details
    if (mobile && (mobile.phone || mobile.provider)) {
      initializePayload.channels = ["mobile_money"];
      initializePayload.mobile_money = {
        phone: mobile.phone || undefined,
        provider: mobile.provider || undefined
      };
    } else {
      // default channels (card + mobile money supported)
      initializePayload.channels = ["card", "mobile_money"];
    }

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      initializePayload,
      {
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.json({
      status: "success",
      authorizationUrl: response.data?.data?.authorization_url || null,
      reference: response.data?.data?.reference || null,
      gatewayResponse: response.data
    });
  } catch (err) {
      console.error("[/api/payment/pay] error", err.response?.data || err.message);
      const gatewayMessage = err?.response?.data?.message;
      const gatewayStatus = err?.response?.status;
      return res.status(502).json({
        status: "error",
        message: gatewayMessage || "Payment init failed",
        gatewayStatus: gatewayStatus || null
      });
    }
});

// Verify transaction by reference (used after redirect/callback)
router.get("/verify", async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference) {
      return res.status(400).json({ status: "error", message: "reference query parameter required" });
    }

    const secret = getPaystackSecret();
    if (!hasConfiguredSecret(secret)) {
      return res.status(500).json({
        status: "error",
        message: "Payment gateway not configured. Set a real PAYSTACK_SECRET or PAYSTACK_SECRET_KEY."
      });
    }

    const verifyResp = await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` }
    });

    const data = verifyResp.data?.data;
    if (!data) {
      return res.status(502).json({ status: "error", message: "Invalid gateway response" });
    }

    // If transaction succeeded, update student record
    if (data.status === "success") {
      const studentId = data?.metadata?.studentId;
      const amountGhs = Number(data?.amount) / 100;
      if (studentId) {
        await Student.findByIdAndUpdate(studentId, { 
          paymentStatus: "Paid",
          paymentReference: reference,
          paymentAmount: Number.isFinite(amountGhs) ? amountGhs : 0
        });
      }
      return res.json({ status: "success", message: "Payment verified", data });
    }

    return res.status(400).json({ status: "error", message: "Payment not successful", data });
  } catch (err) {
    const gatewayMessage = err?.response?.data?.message;
    const gatewayStatus = err?.response?.status;
    return res.status(502).json({
      status: "error",
      message: gatewayMessage || "Verification failed",
      gatewayStatus: gatewayStatus || null
    });
  }
});

router.post("/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];
    const secret = getPaystackSecret();

    if (!signature || !secret) {
      return res.sendStatus(401);
    }

    const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const hash = crypto.createHmac("sha512", secret).update(payload).digest("hex");

    if (hash !== signature) {
      return res.sendStatus(401);
    }

    const event = JSON.parse(payload.toString("utf8"));

    if (event.event === "charge.success") {
      const studentId = event?.data?.metadata?.studentId;
      const reference = event?.data?.reference;
      const amountGhs = Number(event?.data?.amount) / 100;
      if (studentId) {
        await Student.findByIdAndUpdate(studentId, { 
          paymentStatus: "Paid",
          paymentReference: reference,
          paymentAmount: Number.isFinite(amountGhs) ? amountGhs : 0
        });
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    return res.sendStatus(400);
  }
});

module.exports = router;
