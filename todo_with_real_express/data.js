/**
 * Created by gal on 2/12/14.
 */
var crypto = require("crypto");

var MAX_AGE = 30 * 60 * 1000;
//var MAX_AGE = 10 * 1000; //should be uncommented only for tests

var data = {};
var sessionIds = {};

function verifySessionId(sessionId) {
    if (sessionId === undefined || sessionIds[sessionId] === undefined) {
        return false;
    }

    return (Date.now() <= sessionIds[sessionId].expires);
}

function toArray(items) {
    var arr = [];
    var itemId;

    for (itemId in items) {
        if (items.hasOwnProperty(itemId)) {
            arr.push({id: itemId, title: items[itemId].title, completed: items[itemId].completed})
        }
    }

    return arr;
}

module.exports = {
    maxAge: MAX_AGE,

    addUser: function (username, fullName, password){
        data[username] = {fullName: fullName, password: password, items: {}};
    },

    checkUser: function (username, password){
        if (data[username] === undefined) {
            return false;
        }

        return (password === undefined || data[username].password === password);
    },

    login: function (username, callback) {
        crypto.randomBytes(100, function(ex, buf) {
            var sessionId;

            if (ex) {
                callback(false);
                return;
            }

            sessionId = buf.toString("base64");
            sessionIds[sessionId] = {
                username: username,
                expires: Date.now() + MAX_AGE
            };
            callback(true, sessionId);
        });
    },

    getItems: function (sessionId) {
        if (!verifySessionId(sessionId)) {
            return undefined;
        }

        return toArray(data[sessionIds[sessionId].username].items);
    },

    addItem: function (sessionId, id, value) {
        if (!verifySessionId(sessionId)) {
            return "bad session id";
        }

        if (data[sessionIds[sessionId].username].items[id] !== undefined) {
            return "id already in use";
        }

        data[sessionIds[sessionId].username].items[id] = {title: value, completed: false};
        return "success";
    },

    updateItem: function (sessionId, id, value, completed) {
        if (!verifySessionId(sessionId)) {
            return "bad session id";
        }

        if (data[sessionIds[sessionId].username].items[id] === undefined) {
            return "bad id";
        }

        data[sessionIds[sessionId].username].items[id] = {title: value, completed: completed};
        return "success";
    },

    deleteItem: function (sessionId, id) {
        var items;
        var i;

        if (!verifySessionId(sessionId)) {
            return "bad session id";
        }

        items = data[sessionIds[sessionId].username].items;
        if (id !== -1) {
            if (items[id] === undefined) {
                return "bad id";
            }
            delete(items[id]);
        } else {
            for (i in items) {
                if (items.hasOwnProperty(i)) {
                    if (items[i].completed) {
                        delete(items[i]);
                    }
                }
            }
        }

        return "success";
    }
};