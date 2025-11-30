const mongoose = require('mongoose');
const { Schema } = mongoose;

const oauthClientSchema = new Schema({
    name: { type: String, required: true },
    secret: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

oauthClientSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('OauthClient', oauthClientSchema, 'oauthClients');
