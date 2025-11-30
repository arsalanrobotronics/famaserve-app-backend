const _ = require('lodash')

module.exports = (...scopes) => {
    return (request, response, next) => {
        if (
            _.intersection(scopes, request.authInfo.scopes).length !=
            scopes.length
        ) {
            return response.status(403).send('Forbidden')
        }
        return next()
    }
}
