const mongoose = require('mongoose');
const { Schema } = mongoose;

const oauthTokenSchema = new Schema({
    name: { type: String, required: true },
    scopes: { type: [String] },
    userId: { type: Schema.Types.ObjectId, required: true },
    clientId: { type: Schema.Types.ObjectId, required: true },
    revoked: { type: Boolean, default: false },
    revokedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: Date.now },
});

oauthTokenSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('OauthToken', oauthTokenSchema, 'oauthTokens');
