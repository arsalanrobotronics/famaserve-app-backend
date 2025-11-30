const Customer = require('../models/Customers')
const CustomerData = require('./data/Customer')
const _ = require('lodash')
const bcrypt = require('bcryptjs')
const salt = parseInt(process.env.SALT)

async function run() {
    try {
        _.each(CustomerData, function(item, index) {
            item.password = bcrypt.hashSync(item.password, salt)
        })
        await Customer.collection.drop()
        await Customer.insertMany(CustomerData)
        console.log('Customer data initialized')

    } catch (e) {
        if (e.code === 26) {
            console.log('Namespace not located')
            await Customer.insertMany(CustomerData)

        } else {
            console.log('Error:', e)

        }
    }
}

module.exports = {
    customerSeeder: run,
}
