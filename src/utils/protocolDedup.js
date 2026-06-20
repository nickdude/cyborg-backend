/**
 * Deduplicates protocol items across goals.
 * Same productName -> merge into one entry with all driving goals listed.
 *
 * @param {Array} goals - Goals with protocolItems[]
 * @returns {Array} Deduplicated protocol items with drivingGoals[]
 */
function deduplicateProtocol(goals) {
  const map = new Map(); // key: normalized productName

  for (const goal of goals) {
    if (!goal) continue;
    for (const item of goal.protocolItems || []) {
      const key = normalizeProductName(item.productName);
      if (!key) continue;

      if (map.has(key)) {
        const existing = map.get(key);
        existing.drivingGoals.push({
          goalId: goal.goalId || goal._id,
          title: goal.title,
          priority: goal.priority,
        });
        // Merge triggerBiomarkers (unique)
        for (const bm of item.triggerBiomarkers || []) {
          if (!existing.triggerBiomarkers.includes(bm)) {
            existing.triggerBiomarkers.push(bm);
          }
        }
      } else {
        map.set(key, {
          productName: item.productName,
          dosing: item.dosing,
          timing: item.timing || "with_food",
          triggerBiomarkers: [...(item.triggerBiomarkers || [])],
          drivingGoals: [
            {
              goalId: goal.goalId || goal._id,
              title: goal.title,
              priority: goal.priority,
            },
          ],
        });
      }
    }
  }

  // Sort: items supporting more goals first, then by highest priority goal
  const priorityOrder = { High: 0, Medium: 1, Low: 2 };

  return Array.from(map.values()).sort((a, b) => {
    if (b.drivingGoals.length !== a.drivingGoals.length) {
      return b.drivingGoals.length - a.drivingGoals.length;
    }
    const aPri = Math.min(
      ...a.drivingGoals.map((g) => priorityOrder[g.priority] ?? 2)
    );
    const bPri = Math.min(
      ...b.drivingGoals.map((g) => priorityOrder[g.priority] ?? 2)
    );
    return aPri - bPri;
  });
}

function normalizeProductName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

module.exports = { deduplicateProtocol };
