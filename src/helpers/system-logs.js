const Log = require('../models/Log')
const _ = require('lodash')

async function composeSystemLogs(params) {
    try {

        var log = new Log()
        log.userId = params.userId ? params.userId : null
        log.userIp = params.userIp ? params.userIp : null
        log.roleId = params.roleId ? params.roleId : null
        log.module = params.module ? params.module : null
        log.action = params.action ? params.action : null
        log.data = params.data ? params.data : null

        await log.save()
        return true
    } catch (error) {
        console.log('Log operation failed',params,error)
        return false
    }
}

module.exports = {
    composeSystemLogs,
}
