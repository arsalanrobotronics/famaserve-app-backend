const { sendResponse } = require('../utils/utils');

/**
 * Middleware to check if user has an active subscription
 * Should be used after authentication middleware
 */
const checkSubscription = (request, response, next) => {
  try {
    const user = request.user;
    
    if (!user) {
      return sendResponse(
        response,
        'SubscriptionCheck',
        401,
        0,
        'Authentication required'
      );
    }

    // Check if user has subscription status
    const subscriptionStatus = user.subscriptionStatus;
    const subscriptionEndDate = user.subscriptionEndDate;
    
    // Allow access for active and trialing subscriptions
    if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
      // Double-check expiration date
      if (subscriptionEndDate) {
        const now = new Date();
        const endDate = new Date(subscriptionEndDate);
        
        if (now > endDate) {
          return sendResponse(
            response,
            'SubscriptionCheck',
            403,
            0,
            'Subscription has expired. Please renew your subscription to continue.',
            {
              subscriptionExpired: true,
              expiredAt: subscriptionEndDate,
              redirectTo: '/subscription'
            }
          );
        }
      }
      
      return next(); // Allow access
    }
    
    // Block access for inactive, past_due, canceled subscriptions
    return sendResponse(
      response,
      'SubscriptionCheck',
      403,
      0,
      'Active subscription required to access this feature.',
      {
        subscriptionRequired: true,
        currentStatus: subscriptionStatus,
        redirectTo: '/subscription'
      }
    );
    
  } catch (error) {
    console.error('Subscription check error:', error);
    return sendResponse(
      response,
      'SubscriptionCheck',
      500,
      0,
      'Something went wrong while checking subscription status.'
    );
  }
};

module.exports = checkSubscription;
