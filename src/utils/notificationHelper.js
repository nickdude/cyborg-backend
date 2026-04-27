const Notification = require("../models/Notification");
const User = require("../models/User");

async function notify(userId, type, metadata = {}) {
  try {
    await Notification.create({ userId, type, metadata });
  } catch (err) {
    console.error(`[Notify] Failed to send ${type} to ${userId}: ${err.message}`);
  }
}

async function notifyDoctor(patientId, type, metadata = {}) {
  try {
    const patient = await User.findById(patientId)
      .select("linkedDoctor firstName lastName")
      .lean();
    if (!patient?.linkedDoctor) return;

    const patientName = [patient.firstName, patient.lastName].filter(Boolean).join(" ") || "A patient";
    await Notification.create({
      userId: patient.linkedDoctor,
      type,
      metadata: { ...metadata, patientId, patientName },
    });
  } catch (err) {
    console.error(`[Notify] Failed to send ${type} to doctor of ${patientId}: ${err.message}`);
  }
}

module.exports = { notify, notifyDoctor };
