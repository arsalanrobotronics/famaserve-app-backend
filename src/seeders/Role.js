const Role = require('../models/Role')
const RoleData = require('./data/Role')

async function run() {
    try {
        await Role.collection.drop()
        await Role.insertMany(RoleData)
        console.log('Data setup completed')
    } catch (e) {
        console.log('Error:', e)
        if (e.code === 26) {
            console.log('Collection not found:', Role.collection.name)
            console.log('Data setup completed')
            await Role.insertMany(RoleData)
        } else {
            console.log('Error:', e)
        }
    }
}

module.exports = {
    roleSeeder: run,
}
