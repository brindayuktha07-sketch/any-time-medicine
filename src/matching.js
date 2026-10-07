const Doctor = require('./models/Doctor');
const Consultation = require('./models/Consultation');

const STOPWORDS = new Set([
  'the', 'and', 'a', 'an', 'is', 'are', 'i', 'have', 'has', 'had', 'with', 'of', 'to',
  'my', 'me', 'feeling', 'since', 'for', 'in', 'on', 'it', 'was', 'be', 'been',
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
}

/**
 * Ranks currently-available doctors for an incoming consultation request.
 * Score = keyword overlap between the new symptoms and each doctor's past case
 * symptoms/specialty (experience treating similar cases) + a bonus for lower
 * current active-case load (so requests don't pile on one doctor) + a small
 * bonus for years of experience.
 */
async function rankDoctorsForRequest({ symptoms, allergies }) {
  const queryTokens = new Set([...tokenize(symptoms), ...tokenize(allergies)]);

  const available = await Doctor.find({ online: true });
  if (available.length === 0) return [];

  const scored = await Promise.all(
    available.map(async (doc) => {
      const specialtyTokens = tokenize(doc.specialty);
      let overlapScore = 0;
      for (const t of specialtyTokens) if (queryTokens.has(t)) overlapScore += 3;

      const pastCases = await Consultation.find({ doctorId: doc.id, status: 'completed' });
      for (const c of pastCases) {
        const caseTokens = new Set(tokenize(c.symptoms));
        for (const t of caseTokens) if (queryTokens.has(t)) overlapScore += 1;
      }

      const activeCases = await Consultation.countDocuments({
        doctorId: doc.id,
        status: { $in: ['pending', 'accepted', 'in-call'] },
      });
      const loadPenalty = activeCases * 2;
      const experienceBonus = Math.min(Number(doc.experience) || 0, 10) * 0.5;

      const score = overlapScore - loadPenalty + experienceBonus;
      return { doctor: doc, score, activeCases };
    })
  );

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

module.exports = { rankDoctorsForRequest };
