const User = require('../models/SystemUsers')
const UserData = require('./data/User')
const _ = require('lodash')
const bcrypt = require('bcryptjs')
const salt = parseInt(process.env.SALT)
async function run() {
    try {
        _.each(UserData, function(item, index) {
            item.password = bcrypt.hashSync(item.password, salt)
        })
        await User.collection.drop()
        await User.insertMany(UserData)
        console.log('Data initialized')

    } catch (e) {
        if (e.code === 26) {
            console.log('Namespace not located')
            await User.insertMany(UserData)

        } else {
            console.log('Error:', e)

        }
    }
}

module.exports = {
    userSeeder: run,
}
