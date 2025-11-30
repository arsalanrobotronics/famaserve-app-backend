const mongoose = require('mongoose')
const Schema = mongoose.Schema

let logSchema = new Schema({
    userId: { type: Schema.Types.ObjectId },
    roleId: { type: Schema.Types.ObjectId },
    userIp: { type: String },
    module: { type: String },
    action: { type: String },
    data: { type: Array },
    createdAt: { type: Date, default: Date.now },
})

module.exports = mongoose.models.Log || mongoose.model('Log', logSchema, 'logs')
