const RoleType = require('../models/RoleType');
let RoleTypeData = require('./data/RoleType'); // Use let instead of var
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

async function run() {
    try {
        console.log('Data seeder initiated');
        await RoleType.collection.drop();
        RoleTypeData =await RoleTypeData.map(data => ({
            ...data,
            _id: new ObjectId(data._id), // Convert _id to ObjectId
        }));
        await RoleType.insertMany(RoleTypeData);
        console.log('Data setup completed');
    } catch (e) {
        console.log('Exception:', e);
        if (e.code === 26) {
            console.log('Collection not found:', RoleType.collection.name);
            console.log('Data setup completed');
            RoleTypeData = await RoleTypeData.map(data => ({
                ...data,
                _id: new ObjectId(data._id), // Convert _id to ObjectId
            }));
            await RoleType.insertMany(RoleTypeData);
        } else {
            console.log('Error:', e);
        }
    }
}

module.exports = {
    roleTypeSeeder: run,
};
