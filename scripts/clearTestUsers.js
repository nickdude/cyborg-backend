/**
 * Utility script to clear test users from database
 * Usage: node scripts/clearTestUsers.js [email]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

async function clearTestUsers() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/cyborg');
    console.log('Connected to MongoDB');

    const email = process.argv[2];

    if (email) {
      // Delete specific email
      const result = await User.deleteOne({ email });
      console.log(`✅ Deleted user with email: ${email}`);
      console.log(`   Documents deleted: ${result.deletedCount}`);
    } else {
      // Show all users
      const users = await User.find({}).select('email phone emailVerified phoneVerified createdAt');
      console.log('\n=== ALL USERS ===');
      users.forEach(user => {
        console.log(`- ${user.email || user.phone} (${user.emailVerified || user.phoneVerified ? 'verified' : 'unverified'}) - Created: ${user.createdAt}`);
      });
      console.log('\nTo delete a specific user, run:');
      console.log('node scripts/clearTestUsers.js <email>');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

clearTestUsers();
