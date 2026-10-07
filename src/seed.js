const Medicine = require('./models/Medicine');
const { newId } = require('./utils');

const DEMO_MEDICINES = [
  { name: 'Paracetamol 500mg', price: 2, quantity: 120, expiryDate: '2027-03-01' },
  { name: 'Amoxicillin 250mg', price: 8, quantity: 80, expiryDate: '2026-11-15' },
  { name: 'Cetirizine 10mg', price: 3, quantity: 200, expiryDate: '2027-06-20' },
  { name: 'ORS Sachet', price: 15, quantity: 300, expiryDate: '2028-01-01' },
  { name: 'Ibuprofen 400mg', price: 4, quantity: 60, expiryDate: '2026-12-31' },
];

// Loads a handful of demo medicines into a fresh database so the app isn't
// completely empty the first time it connects to a new MongoDB database.
async function seedIfEmpty() {
  const count = await Medicine.countDocuments();
  if (count > 0) return;
  await Medicine.insertMany(DEMO_MEDICINES.map((m) => ({ id: newId('med'), ...m })));
  console.log('  Seeded demo medicines into the database.');
}

module.exports = { seedIfEmpty };
