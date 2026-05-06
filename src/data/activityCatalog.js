/**
 * Activity Catalog
 *
 * Static list of common activities with MET (Metabolic Equivalent of Task)
 * values per hour. Used by the frontend catalog picker and optionally for
 * calorie estimation: calories = MET * weightKg * durationHours.
 */

const ACTIVITY_CATALOG = [
  // ── Cardio ──────────────────────────────────────────────────────
  { id: "running", name: "Running", category: "cardio", metPerHour: 9.8 },
  { id: "jogging", name: "Jogging", category: "cardio", metPerHour: 7.0 },
  { id: "walking", name: "Walking", category: "cardio", metPerHour: 3.5 },
  { id: "brisk_walking", name: "Brisk Walking", category: "cardio", metPerHour: 4.3 },
  { id: "cycling", name: "Cycling", category: "cardio", metPerHour: 7.5 },
  { id: "stationary_bike", name: "Stationary Bike", category: "cardio", metPerHour: 6.8 },
  { id: "elliptical", name: "Elliptical", category: "cardio", metPerHour: 5.0 },
  { id: "stair_climbing", name: "Stair Climbing", category: "cardio", metPerHour: 9.0 },
  { id: "jump_rope", name: "Jump Rope", category: "cardio", metPerHour: 12.3 },
  { id: "rowing", name: "Rowing Machine", category: "cardio", metPerHour: 7.0 },
  { id: "hiit", name: "HIIT", category: "cardio", metPerHour: 8.0 },
  { id: "dancing", name: "Dancing", category: "cardio", metPerHour: 5.5 },
  { id: "aerobics", name: "Aerobics", category: "cardio", metPerHour: 6.5 },
  { id: "zumba", name: "Zumba", category: "cardio", metPerHour: 6.5 },

  // ── Strength ────────────────────────────────────────────────────
  { id: "weight_training", name: "Weight Training", category: "strength", metPerHour: 6.0 },
  { id: "bodyweight_exercises", name: "Bodyweight Exercises", category: "strength", metPerHour: 5.0 },
  { id: "resistance_bands", name: "Resistance Bands", category: "strength", metPerHour: 4.5 },
  { id: "kettlebell", name: "Kettlebell", category: "strength", metPerHour: 6.0 },
  { id: "crossfit", name: "CrossFit", category: "strength", metPerHour: 8.0 },
  { id: "powerlifting", name: "Powerlifting", category: "strength", metPerHour: 6.0 },
  { id: "calisthenics", name: "Calisthenics", category: "strength", metPerHour: 5.5 },

  // ── Flexibility ─────────────────────────────────────────────────
  { id: "stretching", name: "Stretching", category: "flexibility", metPerHour: 2.5 },
  { id: "pilates", name: "Pilates", category: "flexibility", metPerHour: 3.8 },
  { id: "foam_rolling", name: "Foam Rolling", category: "flexibility", metPerHour: 2.0 },

  // ── Sports ──────────────────────────────────────────────────────
  { id: "badminton", name: "Badminton", category: "sports", metPerHour: 5.5 },
  { id: "tennis", name: "Tennis", category: "sports", metPerHour: 7.3 },
  { id: "table_tennis", name: "Table Tennis", category: "sports", metPerHour: 4.0 },
  { id: "basketball", name: "Basketball", category: "sports", metPerHour: 6.5 },
  { id: "football", name: "Football (Soccer)", category: "sports", metPerHour: 7.0 },
  { id: "cricket", name: "Cricket", category: "sports", metPerHour: 5.0 },
  { id: "kabaddi", name: "Kabaddi", category: "sports", metPerHour: 7.0 },
  { id: "kho_kho", name: "Kho Kho", category: "sports", metPerHour: 7.0 },
  { id: "volleyball", name: "Volleyball", category: "sports", metPerHour: 4.0 },
  { id: "hockey", name: "Hockey", category: "sports", metPerHour: 8.0 },
  { id: "boxing", name: "Boxing", category: "sports", metPerHour: 7.8 },
  { id: "martial_arts", name: "Martial Arts", category: "sports", metPerHour: 6.5 },
  { id: "squash", name: "Squash", category: "sports", metPerHour: 7.3 },
  { id: "golf", name: "Golf (walking)", category: "sports", metPerHour: 4.3 },
  { id: "wrestling", name: "Wrestling", category: "sports", metPerHour: 6.0 },
  { id: "archery", name: "Archery", category: "sports", metPerHour: 3.5 },
  { id: "handball", name: "Handball", category: "sports", metPerHour: 8.0 },
  { id: "fencing", name: "Fencing", category: "sports", metPerHour: 6.0 },

  // ── Water ───────────────────────────────────────────────────────
  { id: "swimming", name: "Swimming", category: "water", metPerHour: 6.0 },
  { id: "water_polo", name: "Water Polo", category: "water", metPerHour: 10.0 },
  { id: "kayaking", name: "Kayaking", category: "water", metPerHour: 5.0 },
  { id: "surfing", name: "Surfing", category: "water", metPerHour: 3.0 },

  // ── Mind & Body ─────────────────────────────────────────────────
  { id: "yoga", name: "Yoga", category: "mind_body", metPerHour: 3.0 },
  { id: "power_yoga", name: "Power Yoga", category: "mind_body", metPerHour: 4.5 },
  { id: "tai_chi", name: "Tai Chi", category: "mind_body", metPerHour: 3.0 },
  { id: "meditation", name: "Meditation", category: "mind_body", metPerHour: 1.0 },
  { id: "breathwork", name: "Breathwork (Pranayama)", category: "mind_body", metPerHour: 1.5 },

  // ── Outdoor ─────────────────────────────────────────────────────
  { id: "hiking", name: "Hiking", category: "outdoor", metPerHour: 6.0 },
  { id: "rock_climbing", name: "Rock Climbing", category: "outdoor", metPerHour: 8.0 },
  { id: "trail_running", name: "Trail Running", category: "outdoor", metPerHour: 10.0 },
  { id: "skateboarding", name: "Skateboarding", category: "outdoor", metPerHour: 5.0 },
  { id: "skiing", name: "Skiing", category: "outdoor", metPerHour: 7.0 },
  { id: "horse_riding", name: "Horse Riding", category: "outdoor", metPerHour: 4.0 },
];

module.exports = ACTIVITY_CATALOG;
