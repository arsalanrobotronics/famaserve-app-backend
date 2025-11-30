const defaultModel = require('../models/SystemUsers')
var defaultData = require('./data/User')
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

async function run() {
    try {
        await defaultModel.collection.drop()
        await defaultModel.insertMany(defaultData)
        console.log('Setup completed')
    } catch (e) {
        console.log('Error:', e)
        if (e.code === 26) {
            console.log('Collection not found:', defaultModel.collection.name)
            console.log('Setup completed')
            await defaultModel.insertMany(defaultData)
        } else {
            console.log('Error:', e)
        }
    }
}

module.exports = {
    run,
}
