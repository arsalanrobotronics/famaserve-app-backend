const passport = require('passport')
const jwt = require('jsonwebtoken')
const moment = require('moment')
const BearerStrategy = require('passport-http-bearer')

const User = require('../models/Customers')
const OauthToken = require('../models/OauthToken')

passport.use(
    new BearerStrategy(async (token, done) => {

        if (!token) {
            console.log("Auth token not found")

            return done(null, false)
        } else {
            try {
                console.log("Auth token received")


                console.log("Token data:", token)
                let payload = await jwt.verify(token, process.env.CLIENT_SECRET)

                let accessToken = await OauthToken.findById(
                    payload.accessTokenId
                )
                console.log("Access validation:", accessToken)

                console.log("Access token validated")
                if (!accessToken || !!accessToken.revoked || moment().isAfter(accessToken.expiresAt)) {

                    console.log("Access token revoked or expired")

                    return done(null, false)
                }

                let user = await User.findById(payload.userId)

                // Check if user's subscription has expired
                if (user && user.subscriptionEndDate) {
                    const now = new Date();
                    const endDate = new Date(user.subscriptionEndDate);
                    
                    // If subscription is expired and status is still active, update it
                    if (now > endDate && (user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing')) {
                        console.log(`Subscription expired for user ${user._id}, updating status to past_due`);
                        await User.findByIdAndUpdate(user._id, { 
                            subscriptionStatus: 'past_due',
                            updatedAt: new Date()
                        });
                        
                        // Update the user object for this request
                        user.subscriptionStatus = 'past_due';
                    }
                }

                return done(null, user, payload)
            } catch (error) {
                console.log("Authentication error occurred")
                console.log(error)
                return done(null, false)
            }
        }
    })
)
module.exports = passport.authenticate('bearer', {
    session: false,
})
