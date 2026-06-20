const mongoose = require("mongoose");

const workoutSchema = new mongoose.Schema({
  type: { type: String, required: true },          // e.g. 'running', 'strength', 'cycling'
  durationMinutes: { type: Number },
  avgHeartRate: { type: Number },
  caloriesBurned: { type: Number },
}, { _id: false });

const wearableDataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },             // midnight UTC of the day
  source: {
    type: String,
    enum: ['apple_watch', 'garmin', 'fitbit', 'whoop', 'oura', 'manual', 'synthetic'],
    default: 'synthetic',
  },
  metrics: {
    steps: { type: Number },
    heartRate: {
      resting: { type: Number },
      avg: { type: Number },
      max: { type: Number },
    },
    hrv: { type: Number },                          // RMSSD ms
    spo2: { type: Number },                         // % (95–100)
    caloriesBurned: { type: Number },
    activeMinutes: { type: Number },
    sleep: {
      totalHours: { type: Number },
      deepHours: { type: Number },
      remHours: { type: Number },
      lightHours: { type: Number },
      awakeHours: { type: Number },
    },
    workouts: [workoutSchema],
  },
}, { timestamps: true });

// Primary query pattern — latest first per user
wearableDataSchema.index({ userId: 1, date: -1 });
// Prevent duplicate days
wearableDataSchema.index({ userId: 1, date: 1 }, { unique: true });

const WearableData = mongoose.model('WearableData', wearableDataSchema);

module.exports = WearableData;
