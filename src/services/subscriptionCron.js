const cron = require('node-cron');
const CustomerModel = require('../models/Customers');

/**
 * Cron job to automatically update expired subscriptions
 * Runs daily at midnight (00:00)
 */
const startSubscriptionCron = () => {
  console.log('Starting subscription expiry cron job...');
  
  // Run daily at midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('Running subscription expiry check...');
      
      const now = new Date();
      
      // Find users with active/trialing subscriptions that have expired
      const expiredUsers = await CustomerModel.find({
        subscriptionStatus: { $in: ['active', 'trialing'] },
        subscriptionEndDate: { $lt: now }
      });
      
      if (expiredUsers.length > 0) {
        console.log(`Found ${expiredUsers.length} expired subscriptions, updating status...`);
        
        // Update all expired subscriptions to 'past_due'
        const updateResult = await CustomerModel.updateMany(
          {
            _id: { $in: expiredUsers.map(user => user._id) }
          },
          {
            subscriptionStatus: 'past_due',
            updatedAt: new Date()
          }
        );
        
        console.log(`Successfully updated ${updateResult.modifiedCount} expired subscriptions`);
        
        // Log details for monitoring
        expiredUsers.forEach(user => {
          console.log(`Updated user ${user._id} (${user.email}) - expired on ${user.subscriptionEndDate}`);
        });
      } else {
        console.log('No expired subscriptions found');
      }
      
    } catch (error) {
      console.error('Error in subscription expiry cron job:', error);
    }
  });
  
  // Also run a check every 6 hours for more frequent updates
  cron.schedule('0 */6 * * *', async () => {
    try {
      console.log('Running 6-hourly subscription expiry check...');
      
      const now = new Date();
      
      // Find recently expired subscriptions (within last 6 hours)
      const sixHoursAgo = new Date(now.getTime() - (6 * 60 * 60 * 1000));
      
      const recentlyExpired = await CustomerModel.find({
        subscriptionStatus: { $in: ['active', 'trialing'] },
        subscriptionEndDate: { 
          $lt: now,
          $gte: sixHoursAgo
        }
      });
      
      if (recentlyExpired.length > 0) {
        console.log(`Found ${recentlyExpired.length} recently expired subscriptions`);
        
        await CustomerModel.updateMany(
          {
            _id: { $in: recentlyExpired.map(user => user._id) }
          },
          {
            subscriptionStatus: 'past_due',
            updatedAt: new Date()
          }
        );
        
        console.log(`Updated ${recentlyExpired.length} recently expired subscriptions`);
      }
      
    } catch (error) {
      console.error('Error in 6-hourly subscription check:', error);
    }
  });
  
  console.log('Subscription cron jobs started successfully');
};

/**
 * Manual function to check and update expired subscriptions
 * Can be called on server startup or manually
 */
const checkExpiredSubscriptions = async () => {
  try {
    console.log('Manual subscription expiry check...');
    
    const now = new Date();
    
    const expiredUsers = await CustomerModel.find({
      subscriptionStatus: { $in: ['active', 'trialing'] },
      subscriptionEndDate: { $lt: now }
    });
    
    if (expiredUsers.length > 0) {
      console.log(`Found ${expiredUsers.length} expired subscriptions`);
      
      const updateResult = await CustomerModel.updateMany(
        {
          _id: { $in: expiredUsers.map(user => user._id) }
        },
        {
          subscriptionStatus: 'past_due',
          updatedAt: new Date()
        }
      );
      
      console.log(`Updated ${updateResult.modifiedCount} expired subscriptions`);
      return updateResult.modifiedCount;
    }
    
    console.log('No expired subscriptions found');
    return 0;
    
  } catch (error) {
    console.error('Error in manual subscription check:', error);
    throw error;
  }
};

module.exports = {
  startSubscriptionCron,
  checkExpiredSubscriptions
};
