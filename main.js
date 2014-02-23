/**
 * Created by gal on 2/22/14.
 */

var server = require("./todoServer");

server.start(process.env.PORT || 8080);