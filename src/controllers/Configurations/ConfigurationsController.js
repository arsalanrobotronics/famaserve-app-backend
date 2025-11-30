
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;
const sanitize = require("mongo-sanitize");
const {
  sendResponse,
} = require("../../helpers/utils");

let moduleName = "Configurations";
let lang = "english";
let channel = "web";

module.exports = {
  getAllConfigurations,
};

async function getAllConfigurations(request, response) {

}
