const mongoose = require('mongoose');
const { Schema } = mongoose;

const oauthRefreshTokenSchema = new Schema({
    accessTokenId: { type: Schema.Types.ObjectId, required: true },
    token: { type: String, required: true, unique: true }, // Store the actual JWT token
    revokedAt: { type: Date, default: null },
    revoked: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    expiredAt: { type: Date, default: null },
});

oauthRefreshTokenSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('OauthRefreshToken', oauthRefreshTokenSchema, 'oauthRefreshTokens');
