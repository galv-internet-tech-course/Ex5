/**
 * Created by gal on 12/14/13.
 */

var FS = require("fs");
var MINI_HTTP = require("./miniHttp");

//the supported file types
var FILE_TYPES = {
    "js"   : "application/javascript",
    "txt"  : "text/plain",
    "html" : "text/html",
    "css"  : "text/css",
    "jpg"  : "image/jpeg",
    "gif"  : "image/gif"
};

//a dictionary that finds a character according to its percent encoding
var PERCENT_CODES = {
    "%21": "!",
    "%22": "\"",
    "%23": "#",
    "%24": "$",
    "%26": "&",
    "%27": ",",
    "%28": "(",
    "%29": ")",
    "%2A": "*",
    "%2B": "+",
    "%2C": ",",
    "%2D": "-",
    "%2E": ".",
    "%2F": "/",
    "%3A": ":",
    "%3B": ";",
    "%3C": "<",
    "%3D": "=",
    "%3E": ">",
    "%3F": "?",
    "%40": "@",
    "%5B": "[",
    "%5C": "\\",
    "%5D": "]",
    "%5E": "^",
    "%60": "`",
    "%7B": "{",
    "%7C": "|",
    "%7D": "}"
};

//switch to true to enable full logging
var VERBOSE_MODE = false;

//writes str to the console if isImportant or if VERBOSE_MODE is on
function miniLog(str, isImportant) {
    if ((VERBOSE_MODE) || (isImportant)) {
        console.log(str);
    }
}

//************************************************************************************************
// Request
//************************************************************************************************

//a constructor of a Request object that represents a single user request
function Request() {
    this.headers = {}; //the http header
    this.httpVersion = "1.1"; //the http version
    this.originalUrl = ""; //the full requested url
    this.url = ""; //the requested url without the rootResource
    this.path = ""; //the requested url without the rootResource and without the query string (if any)
    this.params = {};
    this.query = {};
    this.body = {};
    this.cookies = {};
    this.protocol = "http";
    this.method = "";
    this.host = "";
    this.bodyStr = "";
}

//sets a header (trimmed in lower case)
Request.prototype.set = function (key, value) {
    this.headers[key.toLowerCase().trim()] = value.trim();
};

//gets an header (not case sensitive)
Request.prototype.get = function (key) {
    return this.headers[key.toLowerCase()];
};

//returns the parameter name. searches for it in this order: this.params, this.body, this.query
Request.prototype.param = function (name) {
    if (this.params.hasOwnProperty(name)) {
        return this.params[name];
    }
    if (this.body.hasOwnProperty(name)) {
        return this.body[name];
    }
    return this.query[name];
};

//returns true if the type is content-type (or part of it).
//see full documentation in the formal express documentation
Request.prototype.is = function (type) {
    var splittedContentType;
    var splittedType;
    var contentType = this.get("content-type");

    if (contentType === undefined) {
        return false;
    }

    if (contentType === type) {
        return true;
    }

    splittedContentType = contentType.split("/");
    splittedType = type.split("/");

    if (splittedType.length === 1) {
        return (splittedContentType.length === 2 && splittedContentType[1] === type);
    }

    return (
        splittedContentType.length === 2 &&
        splittedContentType[0] === splittedType[0] &&
        splittedType[1] === "*");
};

//************************************************************************************************
// Response
//************************************************************************************************

//a constructor of a Response object that represents a single http response over socket
function Response(httpRes) {
    var that = this;

    this.statusCode = 200; //the status code
    this.headers = {"Content-Length": 0}; //the http headers
    this.httpVersion = ""; //the http version
    this.httpBody = ""; //the body of the response
    this.fileStream = undefined; //a stream for the resource
    this.wasConnectionEnded = false;
    this.isStreamActive = false;
    this.socketName = httpRes.socketName;
    this.socket = httpRes.socket;
    this.httpRes = httpRes;

    httpRes.on("close", function() {
        that.destroyStream()
    });
}

//set the status code of the response
Response.prototype.status = function (statusToSet) {
    this.statusCode = statusToSet;
    return this;
};

//set a header. may receive an object instead of (field, value)
Response.prototype.set = function (field, value) {
    var obj;
    var key;

    if (arguments.length === 2) {
        this.headers[field] = value;
    } else {
        obj = arguments[0];
        for (key in obj) {
            if (obj.hasOwnProperty(key)) {
                this.headers[key] = obj[key];
            }
        }
    }

    return this;
};

//returns a header. not case sensitive
Response.prototype.get = function (field) {
    var key;

    field = field.toLowerCase().trim();
    for (key in this.headers) {
        if (this.headers.hasOwnProperty(key)) {
            if (key.toLowerCase().trim() === field) {
                return this.headers[key];
            }
        }
    }

    return undefined;
};

//returns a string for a set-cookie attribute attName according to options
function getAttributeStr(options, attName) {
    if (attName === "path") {
        return "; Path=" + options[attName];
    }
    if (attName === "domain") {
        return "; domain=" + options[attName];
    }
    if (attName === "secure") {
        if (options[attName] === true) {
            return "; Secure";
        } else {
            return "";
        }
    }
    if (attName === "httpOnly") {
        if (options[attName] === true) {
            return "; HttpOnly";
        } else {
            return "";
        }
    }
    if (attName === "expires") {
        return "; Expires=" + options[attName].toUTCString();
    }
    if (attName === "maxAge") {
        return "; Expires=" + new Date(Date.now() +  options[attName] * 1000).toUTCString();
    }

    return "";
}

//sets a new cookie "name=value; attributes..."
Response.prototype.cookie = function (name, value, options) {
    var attName;
    var setCookieStr = name + "=";

    if (typeof value === "object") {
        value = JSON.stringify(value);
    }

    setCookieStr += value;

    if (options === undefined) {
        options = {};
    }
    if (options["path"] === undefined) {
        options["path"] = "/";
    }

    for (attName in options) {
        if (options.hasOwnProperty(attName)) {
            setCookieStr += getAttributeStr(options, attName);
        }
    }

    if (this.headers["Set-Cookie"] === undefined) {
        this.headers["Set-Cookie"] = [];
    }
    this.headers["Set-Cookie"].push(setCookieStr);

    return this;
};

//sends a JSON body
Response.prototype.json = function (arg1, arg2) {
    return this.send.apply(this, arguments);
};

//send a file. closes the socket after it is sent if shouldEnd.
Response.prototype.sendExistingFile = function (path, size, shouldEnd) {
    var fileType;
    var pipeOptions = {end: false};
    var res = this;

    if (res.wasConnectionEnded) {
        return;
    }

    fileType = path.split(".").pop();
    if (!FILE_TYPES.hasOwnProperty(fileType)) {
        res.send(500, "File type not supported by this server", shouldEnd);
        return;
    }

    res.fileStream = FS.createReadStream(path).on("error", function(err){
        miniLog("Stream error for file " + path + " for " + res.socketName + ": " +
            err.message, true);
        res.fileStream.destroy();
        res.httpRes.end(true);
    }).on("close", function () {
        miniLog("in the close callback of stream for " + res.socketName);
        res.isStreamActive = false;
        res.httpRes.end(shouldEnd);
    }).on("open", function () {
        miniLog("in the open callback of stream for " + res.socketName);
        if (res.wasConnectionEnded) {
            miniLog("destroying stream because of a socket termination");
            res.fileStream.destroy();
        } else {
            res.isStreamActive = true;
        }
    });

    res.status(200).set("Content-Type", FILE_TYPES[fileType]).set('Content-Length', size);
    res.sendHeaders(shouldEnd);
    res.fileStream.pipe(res.httpRes, pipeOptions);
};

//sends the head part of the response
Response.prototype.sendHeaders = function(shouldEnd) {
    if (this.wasConnectionEnded) {
        return;
    }

    if (shouldEnd) {
        this.set("Connection", "close");
    }

    this.httpRes.httpVersion = this.httpVersion;
    this.httpRes.writeHead(this.statusCode, this.headers);
};

//set the body in case a string should be sent as the body and not a stream of some resource
Response.prototype.setBody = function (bodyToSet) {
    var contentType;

    if (typeof bodyToSet === "string") {
        contentType = "text/html";
        this.httpBody = bodyToSet;
    } else {
        contentType = "application/json";
        this.httpBody = JSON.stringify(bodyToSet);
    }

    this.set("Content-Length", this.httpBody.length);
    this.set("Content-Type", contentType);
    return this;
};

//send the current response (without a stream). send([status], [body], [shouldEnd])
//for full documentation read the formal express documentation
Response.prototype.send = function (arg1, arg2, arg3) {
    var shouldEnd = false;

    if (this.wasConnectionEnded) {
        return this;
    }

    if (typeof arg1 === "number") {
        this.status(arg1);
        if (typeof arg2 !== "boolean" && arguments.length > 1) {
            this.setBody(arg2);
        } else {
            this.setBody(MINI_HTTP.STATUS_CODES[this.statusCode]);
        }
    } else if (typeof arg1 !== "boolean" && arguments.length > 0) {
            this.setBody(arg1);
    }

    if (typeof arguments[arguments.length - 1] === "boolean") {
        shouldEnd = arguments[arguments.length - 1];
    }

    this.sendHeaders(shouldEnd);

    miniLog("sending body: " + this.httpBody);
    this.httpRes.end(this.httpBody, shouldEnd);

    return this;
};

//destroys the current stream if exists. turn on a flag so the next one will be destroyed.
Response.prototype.destroyStream = function () {
    miniLog("in destroyStream for session " + this.socketName);
    this.wasConnectionEnded = true;
    if (this.isStreamActive) {
        miniLog("destroying stream because of a socket termination");
        this.fileStream.destroy();
        this.isStreamActive = false;
    }
    return this;
};

//************************************************************************************************

//decodes a string that is encoded with percent encoding
function decodePercent(str) {
    var ret;
    var key;

    ret = str.replace(/\+/, " ");
    for (key in PERCENT_CODES) {
        if (PERCENT_CODES.hasOwnProperty(key)) {
            ret = ret.replace(new RegExp(key, "g"), PERCENT_CODES[key]);
        }
    }
    ret = ret.replace(new RegExp("%25", "g"), "%");

    return ret;
}

//parses a query string and return an object representation
function parseQuery(queryStr) {
    var querySplit;
    var j;
    var queryParams;
    var objName;
    var ret = {};

    querySplit = queryStr.split("&");
    for (j in querySplit) {
        if (querySplit.hasOwnProperty(j)){
            queryParams = querySplit[j].replace(/\+/, " ").split("=");
            if (queryParams.length < 2) {
                return null;
            }
            if (/^[^\]]+\[[^\]]+\]$/.test(queryParams[0])) {
                //an object
                objName = decodePercent(queryParams[0].split("[")[0]);
                if (ret[objName] === undefined) {
                    ret[objName] = {};
                }
                ret[objName][decodePercent(queryParams[0].split("[")[1].split("]")[0])] =
                    decodePercent(queryParams[1]);

            } else {
                ret[decodePercent(queryParams[0])] = decodePercent(queryParams[1]);
            }
        }
    }

    return ret;
}

//sets req.params, req.query, req.url and req.path.
function setReqUrl(req, curResource, handlerResource, res) {
    var i;
    var splittedCur = curResource.split("/");
    var splittedHandler = handlerResource.split("/");
    var urlStart;
    var urlQuerySplit;
    var queryStr;

    req.params = {};
    req.query = {};

    for (i in splittedCur) {
        if (splittedCur.hasOwnProperty(i) && splittedHandler.hasOwnProperty(i)) {
            if (splittedHandler[i].charAt(0) === ":") {
                req.params[splittedHandler[i].substring(1)] = splittedCur[i];
                miniLog("found param: " + splittedHandler[i].substring(1) + "=" + splittedCur[i]);
            }
        }
    }

    urlStart = (handlerResource !== "") ? splittedHandler.length : 0;
    req.url = splittedCur.slice(urlStart).join("/");
    urlQuerySplit = req.url.split("?");
    req.path = urlQuerySplit[0];
    if (urlQuerySplit.length >  1) {
        queryStr = urlQuerySplit[1];
        req.query = parseQuery(queryStr);
        if (req.query === null) {
            res.send(500, "bad query", true);
            return false;
        }
        miniLog("found query: ");
        miniLog(req.query);
    }

    miniLog("url: " + req.url + " path: " + req.path);
    return true;
}

//runs the next handler for the current request. starts the search in handlers from index startIndex
//tries static handling if a good handler is not found. sends 404 if no handler sends a response.
function callNextHandler(curResource, startIndex, req, res, handlers) {
    var index = startIndex;
    var goodIndex = -1;
    var pat;
    var execRet;
    var staticHandler;
    var method = req.method.toLowerCase();

    miniLog("in callNextHandler for start index " + startIndex + " for socket " + res.socketName);

    while ((index < handlers[method].length) && (goodIndex === -1)) {
        pat = new RegExp(
            handlers[method][index].resource.replace(/\/:[^\/]+/g, "/[^/]*").replace(/^:[^\/]+/g, "[^/]*"));
        execRet = pat.exec(curResource);
        if (execRet !== null) {
            startIndex = execRet["index"];
            if (startIndex === 0) {
                goodIndex = index;
            }
        }
        index++;
    }

    if (goodIndex !== -1) {
        if (!setReqUrl(req, curResource, handlers[method][goodIndex].resource, res)) {
            return;
        }
        handlers[method][goodIndex].handler(req, res, function () {
            try {
                callNextHandler(curResource, goodIndex + 1, req, res, handlers);
            } catch (e) {
                miniLog("error while handling data from socket " + res.socketName +
                    " error message: " + e.message, true);
//                throw e; //uncomment only for debugging
                try {
                    res.send(500, true);
                } catch (e2) {}
            }
        });
        return;
    }

    //handler wasn't found, try static handler
    if (!setReqUrl(req, curResource, "", res)) {
        return;
    }
    staticHandler = miniExpressConstructor.static("./");
    staticHandler(req, res, function() {
        res.send(404, "bad path", true);
    });
}

//converts an http request object to an miniExpress Request object.
function convertRequest(httpReq, req, callback) {
    req.originalUrl = httpReq.url;
    req.httpVersion = httpReq.httpVersion;
    req.method = httpReq.method;
    req.headers = httpReq.headers;
    req.host = httpReq.get("host");
    req.bodyStr = "";
    httpReq.on("data", function(data) {
        miniLog("data event for request body: " + data);
        req.bodyStr += data;
    });
    httpReq.on("end", callback);
}


//the constructor of the miniExpress object
function miniExpressConstructor() {
    var handlers = {get: [], post: [], put: [], delete: []};

    //the app request handler. called once for every request.
    var app = function(httpReq, httpRes) {
        var req = new Request();
        var res = new Response(httpRes);

        miniLog("in app()");

        convertRequest(httpReq, req, function () {
            var curResource = req.originalUrl;

            res.httpVersion = req.httpVersion;

            try {
                if (curResource.charAt(0) === "/") {
                    curResource = curResource.substring(1);
                }

                callNextHandler(curResource, 0, req, res, handlers);
            } catch (e) {
                miniLog("error while handling data from socket " + res.socketName +
                    " error message: " + e.message, true);
//                throw e; //uncomment only for debugging
                try {
                    res.send(500, true);
                } catch (e2) {}
            }
        });
    };

    //creates a new http server, starts listening for port and return the new server
    app.listen = function(port, callback) {
        var ret = MINI_HTTP.createServer(app);
        return ret.listen.apply(ret, arguments);
    };

    //handlers that were registered with .get(), .post(), .put() and .delete()
    app.route = {get: [], post: [], put: [], delete: []};

    //register a new handler for method. if no resource is given as arg1, it defaults to "/"
    function registerHandler(method, arg1, arg2) {
        var res;
        var handler;
        var key;

        if (typeof arg1 === "string") {
            res = arg1;
            handler = arg2;
        } else {
            res = "/";
            handler = arg1;
        }

        if (res.charAt(res.length - 1) === "/") {
            res  = res.substring(0, res.length - 1);
        }
        if (res.charAt(0) === "/") {
            res = res.substring(1);
        }

        if (method === "use") {
            for (key in handlers) {
                if (handlers.hasOwnProperty(key)) {
                    handlers[key].push({resource: res, handler: handler});
                }
            }
        } else {
            handlers[method].push({resource: res, handler: handler});
            app.route[method].push({path: res, method: method, callback: handler});
        }
    }

    //register a new handler for every method.  if no resource is given as arg1, it defaults to "/".
    app.use = function (arg1, arg2) {
        registerHandler("use", arg1, arg2);
    };

    //register a new handler for get.  if no resource is given as arg1, it defaults to "/".
    app.get = function (arg1, arg2) {
        registerHandler("get", arg1, arg2);
    };

    //register a new handler for post.  if no resource is given as arg1, it defaults to "/".
    app.post = function (arg1, arg2) {
        registerHandler("post", arg1, arg2);
    };

    //register a new handler for put.  if no resource is given as arg1, it defaults to "/".
    app.put = function (arg1, arg2) {
        registerHandler("put", arg1, arg2);
    };

    //register a new handler for delete.  if no resource is given as arg1, it defaults to "/".
    app.delete = function (arg1, arg2) {
        registerHandler("delete", arg1, arg2);
    };

    return app;
}

//************************************************************************************************
// middlewares
//************************************************************************************************

//returns whether the socket should be closed after the response to req
function shouldEndConnection(req) {
    var connectionHeader = req.get("Connection");

    return (
        ((req.httpVersion === "1.0") && (connectionHeader !== "keep-alive")) ||
        (connectionHeader === "close")
    );
}

//returns a static handler that searches for the resources in rootFolder.
miniExpressConstructor.static = function (rootFolder) {
    return function (req, res, next) {
        var shouldEnd;
        var fullPath = rootFolder + "/" + req.path;

        miniLog("in a static handler of " + rootFolder + " for " + req.path +
            " for session " + res.socketName);

        if (req.method !== "GET") {
            next();
            return;
        }

        shouldEnd = shouldEndConnection(req);

        FS.stat(fullPath, function (err, stats) {
            miniLog("in stat callback for file" + fullPath + " for " + res.socketName);
            if (!err) {
                // successful reading of the file
                if (stats.isDirectory()) {
                    miniLog(fullPath + " is a directory");
                    next();
                } else {
                    miniLog("file " + fullPath + " was found");
                    res.sendExistingFile(fullPath, stats.size, shouldEnd);
                }
            } else if (err.code === "ENOENT") {
                // File doesn't exist
                miniLog("file " + fullPath + " does not exist");
                next();
            } else {
                res.send(500, "An internal FS error in the server", true);
                miniLog("unexpected error while handling " + fullPath + ": " + err.message, true);
            }
        });
    };
};

//returns a handler that parses the cookies in the requests and saves it in req.cookies.
//it always calls next() after it finishes
miniExpressConstructor.cookieParser = function (){
    return function (req, res, next) {
        var splittedHeader;
        var equalIndex;
        var i;
        var name;
        var obj;
        var cookies = req.get("cookie");

        if (cookies === undefined || cookies === "") {
            next();
            return;
        }
        req.cookies = {};

        splittedHeader = cookies.split(";");
        for (i in splittedHeader) {
            if (splittedHeader.hasOwnProperty(i)) {
                if (!/^[^,]+=.+$/.test(splittedHeader[i])) {
                    res.send(500, "bad cookie format", true);
                    return;
                }
                equalIndex = splittedHeader[i].trim().indexOf("=");
                req.cookies[splittedHeader[i].trim().substring(0,equalIndex)] =
                    splittedHeader[i].trim().substring(equalIndex + 1);
            }
        }

        for (name in req.cookies) {
            if (req.cookies.hasOwnProperty(name)) {
                try {
                    obj = JSON.parse(req.cookies[name]);
                    req.cookies[name] = obj;
                } catch (e) {}
            }
        }

        miniLog("found request cookies: ");
        miniLog(req.cookies);

        next();
    };
};

//returns a handler that tries to parse the request body as JSON.
// if it succeeds it saves the result in req.body.
miniExpressConstructor.json = function (){
    return function(req, res, next) {
        var body;

        miniLog("in json middleware for session " + res.socketName);

        try {
            body = JSON.parse(req.bodyStr);
            req.body = body;
            miniLog("found json body: ");
            miniLog(req.body);
        } catch (e) {}

        next();
    };
};

//returns a handler that parses the request body as url encoded if the content-type is
//application/x-www-form-urlencoded. saves the result in req.body.
miniExpressConstructor.urlencoded = function (){
    return function(req, res, next) {
        var contentType = req.get("content-type");
        var body;

        miniLog("in urlencoded for session " + res.socketName);

        if (contentType !== undefined &&
            contentType.indexOf("application/x-www-form-urlencoded") !== -1) {
            body = parseQuery(req.bodyStr);
            if (body === null) {
                res.send(500, "bad body format", true);
                return;
            }
            req.body = body;
            miniLog("found urlencoded body: ");
            miniLog(req.body);
        }

        next();
    };
};

//returns a handler that runs the JSON handler and then the urlencoded handler.
miniExpressConstructor.bodyParser = function (){
    var urlencodedFunc = miniExpressConstructor.urlencoded();
    var jsonFunc = miniExpressConstructor.json();

    return function bodyParser(req, res, next) {
        miniLog("in bodyParser for session " + res.socketName);

        jsonFunc(req, res, function() {
            urlencodedFunc(req, res, next);
        });
    };
};

module.exports = miniExpressConstructor;
