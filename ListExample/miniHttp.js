/**
 * Created by gal on 12/28/13.
 */

var NET = require("net");
var EMITTER = require("events");
var UTIL = require("util");
var STREAM = require("stream");

//status codes and their description
var STATUS_CODES = {
    200 : "OK",
    400 : "Bad Request",
    404 : "Not Found",
    405 : "Method Not Allowed",
    500 : "Internal Server Error"
};

//default timeout for an idle socket
var TIMEOUT = 2000;

//switch to true to enable full logging
var VERBOSE_MODE  = false;

//writes str to the console if isImportant or if VERBOSE_MODE is on
function miniLog(str, isImportant) {
    if ((VERBOSE_MODE) || (isImportant)) {
        console.log(str);
    }
}

//************************************************************************************************
// IncomingMessage
//************************************************************************************************

// the IncomingMessage constructor.
function IncomingMessage(socket) {
    var that = this;
    STREAM.Readable.call(this); //this object extends Readable stream
    this.httpVersion = "";
    this.httpVersionMajor = "";
    this.httpVersionMinor = "";
    this.headers = {};
    this.method = "";
    this.url = "";
    this.socket = socket;
    function handleSocketClose () {
        that.emit("close");
    }
    this.socket.on("error", handleSocketClose).on("end", handleSocketClose);
}

//this object extends Readable stream
UTIL.inherits(IncomingMessage, STREAM.Readable);

//sets timeout and optionally a callback for the socket
IncomingMessage.prototype.setTimeout = function (msecs, callback) {
    this.socket.setTimeout.apply(this.socket, arguments);
};

//sets the body of the request
IncomingMessage.prototype.setBody = function (body) {
    this.push(body);
    this.push(null);
};

//needed in odrder to extend Readable stream.
// we don't have to implement it because we write the body in one chunk in setBody
IncomingMessage.prototype._read = function () {};

//sets a header for the request. key is converted to lower case.
IncomingMessage.prototype.set = function (key, value) {
    this.headers[key.toLowerCase().trim()] = value.trim();
};

//gets an header (not case sensitive)
IncomingMessage.prototype.get = function (key) {
    return this.headers[key.toLowerCase()];
};

//************************************************************************************************
// ServerResponse
//************************************************************************************************

//the constructor for the response object. socket name is a string that is used for logging.
function ServerResponse(socket, socketName) {
    var that = this;

    STREAM.Writable.call(this); //this object extends Writable stream
    this.socket = socket;
    this.socketName = socketName;
    this.sendDate = true;
    this.headersSent = false;
    this.httpVersion = "1.1";
    this.wasConnectionEnded = false;
    this.wasResponseEnded = false;
    this.statusCode = 200;
    this.headers = {};
    this.method = "";
    function handleSocketClose () {
        if (!that.wasResponseEnded) {
            that.wasResponseEnded = true;
            that.wasConnectionEnded = true;
            miniLog("serverResponse of session " + that.socketName + " is emitting close");
            that.emit("close");
        }
    }
    this.socket.on("error", handleSocketClose).on("end", handleSocketClose);
    this.socket.on("drain", function () {
        that.emit("drain");
    });
}

//this object extends Writable stream
UTIL.inherits(ServerResponse, STREAM.Writable);

//needed for implementation of a write stream
ServerResponse.prototype._write = function (chunk, encoding, callback) {
    return this.socket.write.apply(this.socket, arguments);
};

//sets a header - name: value
ServerResponse.prototype.setHeader = function (name, value) {
    this.headers[name] = value;
    return this;
};

//removed the header - name: *
ServerResponse.prototype.removeHeader = function (name) {
    var key;

    name = name.toLowerCase();

    for (key in this.headers) {
        if (this.headers.hasOwnProperty(key)) {
            if (key.toLowerCase() === name) {
                delete(this.headers[key]);
            }
        }
    }

    return this;
};

//returns the wanted header
ServerResponse.prototype.getHeader = function (name) {
    var key;

    name = name.toLowerCase();

    for (key in this.headers) {
        if (this.headers.hasOwnProperty(key)) {
            if (key.toLowerCase() === name) {
                return this.headers[key];
            }
        }
    }

    return undefined;
};

//sends the head part of the response. can be called only once.
ServerResponse.prototype.writeHead = function (statusCode, reasonPhrase, headers) {
    var key;
    var date = new Date;
    var i;

    if (this.headersSent) {
        throw new Error("writeHead was called more than once for " + this.socketName);
    }
    this.headersSent = true;

    if (arguments.length == 2 && typeof reasonPhrase !== "string") {
        headers = reasonPhrase;
        reasonPhrase = undefined;
    }

    this.statusCode = statusCode;

    if (headers === undefined) {
        headers = {};
    }

    if (this.sendDate) {
        headers["Date"] =  date.toUTCString();
    }

    miniLog("writing head: version is " + this.httpVersion + " status is " + this.statusCode);

    if (reasonPhrase === undefined) {
        reasonPhrase = STATUS_CODES[this.statusCode];
    }

    this._write("HTTP/" + this.httpVersion + " " + this.statusCode + " " + reasonPhrase + "\r\n");

    for (key in headers) {
        if (headers.hasOwnProperty(key)) {
            if (typeof headers[key] === "string" || typeof headers[key] == "number") {
                miniLog(key + ": " + headers[key]);
                this._write(key + ": " + headers[key] + "\r\n");
            } else {
                //an array of strings
                for (i in headers[key]) {
                    if (headers[key].hasOwnProperty(i)) {
                        miniLog(key + ": " + headers[key][i]);
                        this._write(key + ": "+ headers[key][i] + "\r\n");
                    }
                }
            }
        }
    }

    this._write("\r\n");

    return this;
};

//sets a timeout for the socket
ServerResponse.prototype.setTimeout = function (msecs, callback) {
    var that = this;

    this.socket.setTimeout(msecs, function () {
        that.emit("timeout", that.socket);
    });
    if (callback !== undefined) {
        this.on("timeout", callback);
    }

    return this;
};

//writes chunk to the response body. if header hasn't been sent yet, it is sent first
ServerResponse.prototype.write = function (chunk, encoding) {
    if (!this.headersSent) {
        this.writeHead(this.statusCode, this.headers);
    }

    return this._write(chunk, encoding);
};

//ends the response. must be called in order to end the response.
ServerResponse.prototype.end = function (data, encoding, shouldClose) {
    if (typeof data === "string" && data !== "") {
        if (typeof arguments[1] === "string") {
            this.write(data, encoding);
        } else {
            this.write(data);
        }
    }

    if (typeof arguments[arguments.length - 1] === "boolean") {
        shouldClose = arguments[arguments.length - 1];
    }
    if (shouldClose) {
        this.socket.end();
        this.wasConnectionEnded = true;
    }

    this.wasResponseEnded = true;
    miniLog("response ended");
    this.emit("finish");
};


//************************************************************************************************


//returns the length of the first http request in data. return 0 if there is no full request in data.
//returns -1 if the request in data has errors. in this case an error response is sent in res
//the request length and the index of the request body are saved in the optional reqLenObj
function getHttpReqLen(data, res, reqLenObj) {
    var contentLen = 0;
    var headersPart;
    var otherPart;
    var contentLenIndex;
    var headersEndIndex;
    var headersCRLFEndIndex;
    var headersLFEndIndex;
    var otherPartIndex;
    var errMsg;

    headersLFEndIndex = data.indexOf("\n\n"); //we allow both \r\n and \n
    headersCRLFEndIndex = data.indexOf("\n\r\n");
    if ((headersLFEndIndex === -1) && (headersCRLFEndIndex === -1)) {
        return 0;
    }
    if ((headersCRLFEndIndex !== -1) &&
        ((headersCRLFEndIndex < headersLFEndIndex) || (headersLFEndIndex === -1))) {
        headersEndIndex = headersCRLFEndIndex;
        otherPartIndex = headersEndIndex + "\n\r\n".length;
    } else {
        headersEndIndex = headersLFEndIndex;
        otherPartIndex = headersEndIndex + "\n\n".length;
    }

    headersPart = data.substring(0, headersEndIndex).toLowerCase();
    otherPart = data.substring(otherPartIndex);

    contentLenIndex = headersPart.lastIndexOf("content-length:");
    if (contentLenIndex !== -1) {
        contentLen = parseInt(headersPart.substring(contentLenIndex + "content-length:".length));
        if (isNaN(contentLen) || (contentLen < 0)) {
            errMsg = "invalid Content-Length";
            res.writeHead(500, {"Content-Length": errMsg.length, "Connection": "close"}).end(errMsg, true);
            return -1;
        }
        if (otherPart.length < contentLen) {
            return 0;
        }
    }

    if (reqLenObj !== undefined) {
        reqLenObj["len"] = otherPartIndex + contentLen;
        reqLenObj["bodyIndex"] = otherPartIndex;
    }
    return otherPartIndex + contentLen;
}

//parses the (single) request in data and returns a Request object.
//if the packet has errors null is returned and an error response is sent in res
function parseReq(data, res, bodyIndex) {
    var colonIndex;
    var i;
    var splittedFirstLine;
    var splittedData;
    var errMsg;
    var req = new IncomingMessage(res.socket);

    splittedData = data.split("\n"); //we split with \n and not with \r\n in order to allow both
    splittedFirstLine = splittedData[0].replace(/\s+/g, " ").trim().split(" ");

    req.httpVersionMajor = "1";
    if (splittedFirstLine[2] === "HTTP/1.0") {
        req.httpVersion = "1.0";
        req.httpVersionMinor = "0";
    } else if (splittedFirstLine[2] === "HTTP/1.1") {
        req.httpVersion = "1.1";
        req.httpVersionMinor = "1";
    } else {
        errMsg = "illegal protocol. must be HTTP/1.0 or HTTP/1.1";
        res.writeHead(500, {"Content-Length": errMsg.length, "Connection": "close"}).end(errMsg, true);
        return null;
    }
    res.httpVersion = req.httpVersion;

    if (splittedFirstLine[0] !== "GET" && splittedFirstLine[0] !== "POST" &&
        splittedFirstLine[0] !== "DELETE" && splittedFirstLine[0] !== "PUT") {
        errMsg = "method is not supported";
        res.writeHead(405, {"Content-Length": errMsg, "Allow": "GET,POST,PUT,DELETE", "Connection": "close"})
            .end(errMsg, true);
        return null;
    }
    req.method = splittedFirstLine[0];

    req.url = splittedFirstLine[1];
    if (req.url.indexOf('..') !== -1) {
        errMsg = "bad URL: contains ..";
        res.writeHead(404, {"Content-Length": errMsg.length, "Connection": "close"}).end(errMsg, true);
        return null;
    }

    for (i = 1; (i < splittedData.length) && (splittedData[i].trim() != ""); i++) {
        colonIndex = splittedData[i].indexOf(":");
        if (colonIndex < 1) {
            errMsg = "illegal header";
            res.writeHead(500, {"Content-Length": errMsg.length, "Connection": "close"}).end(errMsg, true);
            return null;
        }
        req.set(splittedData[i].substring(0, colonIndex), splittedData[i].substring(colonIndex + 1));
    }

    req.setBody(data.substring(bodyIndex));

    miniLog("found request for " + req.url);

    return req;
}

//parses the data from a socket and pushes the request objects to the readyRequests queue.
//is an error was found false is returned. otherwise true is returned.
function parseData(connection) {
    var data;
    var reqLen;
    var req;
    var finishedReading = false;
    var res = connection.resForErrors;
    var reqLenObj = {};

    while (!finishedReading) {
        reqLen = getHttpReqLen(connection.unparsedData, res, reqLenObj);

        if (reqLen === -1) {
            return false;
        }

        if (reqLen === 0) {
            finishedReading = true;
        } else {
            data = connection.unparsedData.substring(0, reqLen);
            connection.unparsedData = connection.unparsedData.substring(reqLen);
            req = parseReq(data, res, reqLenObj["bodyIndex"]);
            if (req === null) {
                return false;
            }
            connection.readyRequests.push(req);
        }
    }
    return true;
}

//handles new data that was received in connection. calls the suitable handlers.
function handleData(connection, newData, server) {
    var req;
    var res;
    var socket = connection.socket;
    var socketName = connection.socketName;

    connection.unparsedData += newData;

    if (connection.isHandling) {
        return;
    }

    try {
        if (!parseData(connection)) {
            return;
        }

        if (connection.readyRequests.length > 0) {
            req = connection.readyRequests.shift();
            res = new ServerResponse(socket, socketName);

            connection.isHandling = true;

            res.on("finish", function () {
                if (res.wasConnectionEnded) {
                    return;
                }
                connection.isHandling = false;
                handleData(connection, "", server);
            });

            miniLog("emitting request");
            server.emit("request", req, res);
        }
    } catch (e) {
        miniLog("error while processing data from socket " + socketName +
            "error message: " + e.message, true);
        //throw e; //uncomment only for debugging
        socket.end();
    }
}

//the http server constructor
function Server() {
    var netServer; //a server object of the net module
    var server = this;
    var isRunning = false;
    var isClosing = false;

    EMITTER.EventEmitter.call(this); //this object extends EventEmitter

    server.timeout = TIMEOUT;

    //start listening to a port. the params are the save as in net server .listen().
    server.listen = function (port, arg2, arg3, arg4) {
        var socketsCounter = 0;

        if (isRunning) {
            throw new Error("server is already running, can't commit listen");
        }
        isRunning = true;

        netServer = NET.createServer(function (socket) {
            var socketName =
                socket.remoteAddress + ":" + socket.remotePort + "(#" + socketsCounter + ")";
            var connection = {
                readyRequests: [],
                unparsedData: "",
                resForErrors: new ServerResponse(socket, socketName),
                isHandling: false,
                socket: socket,
                socketName: socketName
            };

            socketsCounter++;
            socket.setMaxListeners(0);
            socket.setEncoding("utf8");
            socket.on("data", function (data) {
                miniLog("data event received in " + socketName);
                handleData(connection, data, server);
            });
            socket.on("end", function () {
                miniLog("session ended: " + socketName);
                socket.end();
            });
            socket.on("error", function(err) {
                miniLog("socket error occurred in " + socketName + " error: " + err.message, true);
                socket.end();
                server.emit("clientError", err, socket);
            });
            socket.setTimeout(server.timeout, function () {
                if (server.listeners("timeout").length != 0) {
                    server.emit("timeout", socket);
                } else {
                    miniLog("timeout - closing socket: " + socketName);
                    socket.end();
                }
            });
            server.emit("connection", socket);
            miniLog("session created: " + socketName);
        });

        miniLog("net server created", true);

        netServer.listen.apply(netServer, arguments);

        return server;
    };

    //stop listening for new connections
    server.close = function (callback) {
        if ((isRunning) && (!isClosing)) {
            miniLog("closing the http server", true);
            isClosing = true;
            if (callback !== undefined) {
                server.on("close", callback);
            }
            netServer.close(function () {
                isRunning = false;
                isClosing = false;
                server.emit("close");
            });
            return true;
        }
        return false;
    };

    //sets a new timeout for new connections.
    // registers the optional callback for the timeout event.
    server.setTimeout = function (msecs, callback) {
        server.timeout = msecs;
        server.on("timeout", callback);
    }
}

//extends EventEmitter
UTIL.inherits(Server, EMITTER.EventEmitter);

//creates a new server. registers the optional handler function to the request event.
function createServer(handler) {
    var server = new Server();

    if (handler !== undefined) {
        server.on("request", handler);
    }

    return server;
}

exports.createServer = createServer;
exports.STATUS_CODES = STATUS_CODES;