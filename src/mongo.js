const mongoose = require('mongoose');

/**
 * Connects to MongoDB using the MONGODB_URI environment variable.
 * Locally: put it in a .env file (see .env.example).
 * On Render: set it under your Web Service's "Environment" tab.
 */
async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      '\n  MONGODB_URI is not set.\n' +
      '  Create a .env file (copy .env.example) with your MongoDB Atlas connection string,\n' +
      '  or set MONGODB_URI as an environment variable on your hosting provider.\n'
    );
    process.exit(1);
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('  Connected to MongoDB');
}

module.exports = { connectMongo };
