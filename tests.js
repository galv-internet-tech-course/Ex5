/**
 * Created by gal on 12/14/13.
 */

var HTTP = require("http");
var NET = require("net");
var MINI_EXPRESS = require("./miniExpress");

var EX5_PORT = 8000;
var PORT = 8080; //the server's port
var FREE_PORT = 8081; //a free port that can be used in the next call to listen
var HOST = "127.0.0.1"; //the server's host
var APP; //miniExpress application object
var MY_HTTP; //myHttp object

var LAST_COOKIE; //the last cookie that was received

//http module options
var OPTIONS = {
    host: HOST,
    port: PORT,
    path: "/www/Hello.txt",
    method: "GET",
    headers: {"Connection": "keep-alive"}
};

HTTP.globalAgent.maxSockets = 2000;

//returns a callback that prints http response
//if shouldReadRes is false there is no callback to the data event so the socket
//      won't be closed by the client
function getResponsePrintCB(reqId, shouldReadRes, shouldPrintBody) {
    if (shouldPrintBody === undefined) {
        shouldPrintBody = true;
    }

    return function responsePrintCB(res) {
        var header;

        console.log("Got response for " + reqId);

        console.log("status: " + res.statusCode);
        console.log("version: " + res.httpVersion);
        for (header in res.headers) {
            if (res.headers.hasOwnProperty(header)) {
                console.log(header + ": " + res.headers[header]);
            }
        }

        if (shouldReadRes) {
            res.on("data", function(chunk){
                console.log("chunk of body for response of " + reqId);
                if (shouldPrintBody !== false) {
                    console.log(chunk.toString());
                }
            });
        }
    };
}

//returns a callback that validates the http response.
//if shouldReadRes is false there is no callback to the data event so the socket
//      won't be closed by the client
function getValidateResCB(reqId, shouldReadRes, expectedRes, successCounter) {
    return function validateResCB(res) {
        var key;

        if (typeof shouldReadRes !== "boolean" && typeof shouldReadRes !== "string") {
            shouldReadRes = JSON.stringify(shouldReadRes);
        }


        if (res.statusCode !== expectedRes.status) {
            console.log(reqId + " FAILED: bad status: " + res.statusCode + " received");
            return;
        }
        if (res.httpVersion !== expectedRes.version) {
            console.log(reqId + " FAILED: bad version");
            return;
        }

        for (key in expectedRes.extraHeaders) {
            if (expectedRes.extraHeaders.hasOwnProperty(key)) {
                if (JSON.stringify(res.headers[key]) !== JSON.stringify(expectedRes.extraHeaders[key])) {
                    console.log(reqId + " FAILED: bad header: " + key);
                    console.log("received " + res.headers[key]);
                    return;
                }
            }
        }

        if (res.headers["set-cookie"] !== undefined) {
            LAST_COOKIE = res.headers["set-cookie"].toString().split(";")[0];
        }

        if (typeof shouldReadRes === "string") {
            if (res.headers["content-length"] !== shouldReadRes.length.toString()) {
                console.log(reqId + " FAILED: bad content-length. ");
                console.log("received: " + res.headers["content-length"] + " expected: " +
                    shouldReadRes.length);
                return;
            }
        }

        if (successCounter !== undefined) {
            successCounter.counter++;
        }

        console.log(reqId + " PASSED");

        if ((typeof shouldReadRes !== "boolean") || (shouldReadRes !== false)) {
            res.on("data", function(chunk){
                var body = chunk.toString();
                if (typeof shouldReadRes === "string") {
                    if (body !== shouldReadRes) {
                        console.log(reqId + " FAILED in validating chunk. read " + body +
                            " instead of " + shouldReadRes);
                    }
                }
            });
        }
    }
}

//generates a request using the http module and registers responseCB to be called when the
// response is received
function generateRequest(responseCB, body) {
    var req = HTTP.request(OPTIONS, responseCB).on("error", function () {});
    if (body !== undefined) {
        req.write(body);
    }
    req.end();
}

//generates many requests and verifies the answer for each one.
//is shouldClose the socket is closed with Connection:close.
//if not shouldReadRes there is no callback to the data event so the socket won't be
// closed by the client
function testManyRequests(shouldClose, shouldReadRes, n, timeout) {
    var i;
    var origConnection = OPTIONS.headers["Connection"];
    var successCounter = {counter: 0};
    var extraHeaders = {"content-length": "14"};
    var expectedRes = {
        status: 200,
        version: "1.1",
        extraHeaders: extraHeaders
    };

    if (shouldClose) {
        OPTIONS.headers["Connection"] = "close";
    }

    for (i = 0; i < n; i++) {
        generateRequest(getValidateResCB(
            "shouldClose=" + shouldClose + " shouldReadRes=" + shouldReadRes +
                ". iteration " + i, shouldReadRes, expectedRes, successCounter));
    }

    setTimeout(function() {
        console.log(
            "result for test many requests: shouldClose=" + shouldClose +
                " shouldReadRes=" + shouldReadRes + " n=" + n);
        if (successCounter.counter === n) {
            console.log("PASSED");
        } else {
            console.log("FAILED. num of successes: " + successCounter.counter);
        }
    }, timeout);

    OPTIONS.headers["Connection"] = origConnection;
}

//send a request and prints the response
function testPrintResponse(path, shouldPrintBody) {
    var origPath = OPTIONS.path;

    OPTIONS.path = path;
    generateRequest(getResponsePrintCB(OPTIONS.method + " " + path, true, shouldPrintBody));

    OPTIONS.path = origPath;
}

//sends request for path and verifies the response
function testRequest(path, status, extraHeaders, expectedBody) {
    var origPath = OPTIONS.path;
    var expectedRes = {
        status: status,
        version: "1.1",
        extraHeaders: extraHeaders
    };
    var shouldReadRes = (expectedBody !== undefined) ? expectedBody : true;

    OPTIONS.path = path;

    generateRequest(getValidateResCB("testRequest for path " + path,
        shouldReadRes, expectedRes));
    OPTIONS.path = origPath;
}

//sends HEAD request and verifies that the error response is as expected
function testHead() {
    var origPath = OPTIONS.path;

    OPTIONS.method = "HEAD";
    OPTIONS.path = "/www/Hello.txt";

    var expectedRes = {
        status: 405,
        version: "1.1",
        extraHeaders: {allow: "GET,POST,PUT,DELETE", connection: "close"}
    };
    var shouldReadRes = "method is not supported";

    generateRequest(getValidateResCB("testHead", shouldReadRes, expectedRes));

    OPTIONS.method = "GET";
    OPTIONS.path = origPath;

}

//sends request with body and verifies the response
function testReqWithBody() {
    var origPath = OPTIONS.path;
    var expectedRes = {
        status: 200,
        version: "1.1"
    };

    OPTIONS.path = "/www/Hello.txt";

    generateRequest(
        getValidateResCB("test request with body", "Hello World!!!", expectedRes),
        "some body to be ignored");

    OPTIONS.path = origPath;
}

//sends a request with the net module and verifies that both expectedRes1 and expectedRes2
// are in the response
function sendRawReq(reqId, reqStr, expectedRes1, expectedRes2, cbAfterWrite, cbAfterEnd) {
    var socket;
    var data = "";
    var passed = false;
    var connectOpts = {
        host: HOST,
        port: PORT
    };
    var endCB = cbAfterEnd;

    socket = NET.connect(connectOpts, function() {
        socket.write(reqStr);
        if (cbAfterWrite !== undefined) {
            cbAfterWrite(socket);
        }
    });

    socket.on("data", function(chunk) {
        data += chunk.toString();
        if (passed) {
            return;
        }
        if ((data.indexOf(expectedRes1) !== -1) && (data.indexOf(expectedRes2) !== -1)) {
            console.log(reqId + " PASSED");
            passed = true;
        }
    });

    if (endCB === undefined) {
        endCB = function () {
            if (!passed) {
                console.log(reqId + " FAILED");
                console.log("data that was received: " + data);
            }
        };
    }

    socket.on("end", endCB);

    socket.on("error", function(err) {
       console.log("some socket error occurred: " + err.message)
    });
}

//tests the response for an http 1.0 request
function testHttp10() {
    var expectedRes1 = "HTTP/1.0 200 OK\r\nContent-Length: 14\r\nContent-Type: " +
        "text/plain\r\nConnection: close\r\nDate: ";
    var expectedRes2 = "\r\n\r\nHello World!!!";

    sendRawReq("test HTTP 1.0", "GET /www/Hello.txt HTTP/1.0\r\n\r\n", expectedRes1, expectedRes2);
}

//tests the response for an http 1.0 request with keep alive
function testHttp10WithKeepAlive() {
    var expectedRes1 = "HTTP/1.0 200 OK\r\nContent-Length: 14\r\nContent-Type: text/plain\r\nDate: ";
    var expectedRes2 = "\r\n\r\nHello World!!!";

    sendRawReq(
        "test HTTP 1.0 with keep-alive", "GET /www/Hello.txt HTTP/1.0\r\nConnection: keep-alive\r\n\r\n",
        expectedRes1, expectedRes2);
}

//tests the response for an http 1.0 request with bad url
function testHttp10BadPath() {
    var expectedRes1 = "HTTP/1.0 404 Not Found\r\nContent-Length: 8\r\nContent-Type: text/html\r\n" +
        "Connection: close\r\nDate: ";
    var expectedRes2 = "\r\n\r\nbad path";

    sendRawReq("test HTTP 1.0 with bad path", "GET /www/bad.txt HTTP/1.0\r\n\r\n",
        expectedRes1, expectedRes2);

}

//destroys the socket immediately after the request is sent
function testDestroyAfterWrite() {
    //we want to check the an error does not occur in the server. we so so by verifying the no
    // error message is printed and the next tests pass
    sendRawReq("test RST after write", "GET /www/Hello.txt HTTP/1.1\r\n\r\n", "bad", "str",
        function (socket) {
            socket.destroy();
        }, function () {});
}

//ends the socket immediately after the request is sent
function testEndAfterWrite() {
    //we want to check the an error does not occur in the server. we so so by verifying the no
    // error message is printed and the next tests pass
    sendRawReq("test FIN after write", "GET /www/Hello.txt HTTP/1.1\r\n\r\n", "bad", "str",
        function (socket) {
            socket.end();
        }, function () {});
}

//sends malformed packets and verifies the responses
function testMalformedPackets() {
    var startTime;

    sendRawReq("test non HTTP, with empty line",
        "some random string\r\n\r\nwith an empty line line\r\n",
        "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 46\r\nConnection: close\r\nDate: ",
        "\r\n\r\nillegal protocol. must be HTTP/1.0 or HTTP/1.1");

    //packet without empty line. won't be parsed by the server. will be closed by the server on timeout
    startTime = new Date().getTime();
    sendRawReq(
        "", "GET /www/profile.html HTTP/1.1\r\nsome random string\r\n", "bad", "str",
        undefined, function () {
            var endTime = new Date().getTime();
            if (endTime < startTime + 1999) {
                console.log("test packet without empty line FAILED");
            } else {
                console.log("test packet without empty line PASSED")
            }
        });

    sendRawReq(
        "test short packet", "short\r\n\r\n",
        "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 46\r\nConnection: close\r\nDate: ",
        "\r\n\r\nillegal protocol. must be HTTP/1.0 or HTTP/1.1");

    sendRawReq(
        "test illegal protocol", "GET /www/profile.html HTTP/1.2\r\n\r\n",
        "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 46\r\nConnection: close\r\nDate: ",
        "\r\n\r\nillegal protocol. must be HTTP/1.0 or HTTP/1.1");

    sendRawReq(
        "test illegal header",
        "GET /www/profile.html HTTP/1.1\r\nConnection keep-alive\r\n\r\n",
        "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 14\r\nConnection: close\r\nDate: ",
        "\r\n\r\nillegal header");

    sendRawReq(
        "test illegal Content-Length",
        "GET /www/profile.html HTTP/1.1\r\nContent-Length: -1\r\n\r\n",
        "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 22\r\nConnection: close\r\nDate: ",
        "\r\n\r\ninvalid Content-Length");

    sendRawReq(
        "test illegal Content-Length2",
        "GET /www/profile.html HTTP/1.1\r\nConnection keep-alive:\r\nContent-Length: x\r\n\r\n",
        "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 22\r\nConnection: close\r\nDate: ",
        "\r\n\r\ninvalid Content-Length");
}

//sends two requests in the same chunk and verifies the responses
function testTwoRequestsInOneChunk(){
    var reqStr =
        "GET /www/Hello.txt HTTP/1.1\r\n\r\n" +
        "GET /www/profile.html HTTP/1.1\r\n\r\n";
    var expectedRes1 =
        "HTTP/1.1 200 OK\r\nContent-Length: 14\r\nContent-Type: text/plain\r\nDate: ";
    var expectedRes2 = "\r\n\r\nHello World!!!HTTP/1.1 200 OK\r\nContent-Length: 2342\r\n" +
        "Content-Type: text/html\r\nDate: ";

    sendRawReq("test two requests in one chunk", reqStr, expectedRes1, expectedRes2);
}

//sends one requests in a few chunks and verifies the response
function testOneRequestInAFewChunks(){
    var expectedRes1 =
        "HTTP/1.1 200 OK\r\nContent-Length: 14\r\nContent-Type: text/plain\r\nDate: ";
    var expectedRes2 = "\r\n\r\nHello World!!!";

    sendRawReq("test one request in a few chunks", "GE", expectedRes1, expectedRes2,
        function (socket) {
            socket.write("T /www/Hello.tx");
            setTimeout(function () {
                socket.write("t HTTP/1.1\r\n\r\n");
            }, 100);
        }
    );
}

//sends two requests in the two separate chunks and verifies the responses
function testTwoRequestsInTwoChunks2() {
    var expectedRes1 =
        "HTTP/1.1 200 OK\r\nContent-Length: 14\r\nContent-Type: text/plain\r\nDate: ";
    var expectedRes2 = "\r\n\r\nHello World!!!HTTP/1.1 200 OK\r\nContent-Length: 2342\r\n" +
        "Content-Type: text/html\r\nDate: ";

    sendRawReq(
        "test two request in two chunks2", "GET /www/Hello.txt HTTP/1.1\r\n\r\n",
        expectedRes1, expectedRes2, function (socket) {
            socket.write("GET /www/profile.html HTTP/1.1\r\n\r\n");
        }
    );
}

//sends two requests in the two separate chunks and verifies the responses
function testTwoRequestsInTwoChunks1(waitTime) {
    var expectedRes1 =
        "HTTP/1.1 200 OK\r\nContent-Length: 14\r\nContent-Type: text/plain\r\nDate: ";
    var expectedRes2 = "\r\n\r\nHello World!!!HTTP/1.1 200 OK\r\nContent-Length: 2342\r\n" +
        "Content-Type: text/html\r\nDate: ";

    sendRawReq(
        "test two request in two chunks with wait time " + waitTime, "GET /www/Hello.txt HTTP/1.1\r\n\r\n",
        expectedRes1, expectedRes2, function (socket) {
            setTimeout(function () {
                socket.write("GET /www/profile.html HTTP/1.1\r\n\r\n");
            }, waitTime);
        }
    );
}

//verifies that the headers parsing in the server is not case sensitive
function testCaseInsensitiveHeaders() {
    var reqStr;
    var content;

    console.log();
    sendRawReq(
        "test case sensitive: coNnecTIon", "GET /www/Hello.txt HTTP/1.1\r\ncoNnecTIon: close\r\n\r\n",
        "HTTP/1.1 200 OK\r\nContent-Length: 14\r\nContent-Type: text/plain\r\nConnection: close\r\nDate: ",
        "\r\n\r\nHello World!!!");

    content = "some random string";
    reqStr =
        "GET /www/Hello.txt HTTP/1.1\r\ncoNtEnt-lEngTh: " + content.length + "\r\n\r\n" + content +
        "GET /www/profile.html HTTP/1.1\r\n\r\n";
    sendRawReq("test case sensitive: coNtEnt-lEngTh", reqStr,
        "HTTP/1.1 200 OK\r\nContent-Length: 14\r\nContent-Type: text/plain\r\nDate: ",
        "\r\n\r\nHello World!!!HTTP/1.1 200 OK\r\nContent-Length: 2342\r\nContent-Type: text/html\r\nDate: ");
}

//verifies that the request parsing in the server is indifferent for extra white spaces in the first line
function testSpacesInFirstLine() {
    var content = "some random string";
    var reqStr =
        "GET  \t\t     /www/Hello.txt  \t HTTP/1.1\r\nContent-Length: " + content.length + "\r\n\r\n" + content +
            "GET\t/www/profile.html\tHTTP/1.1  \r\n\r\n";
    sendRawReq("test spaces in first line", reqStr,
        "HTTP/1.1 200 OK\r\nContent-Length: 14\r\nContent-Type: text/plain\r\nDate: ",
        "\r\n\r\nHello World!!!HTTP/1.1 200 OK\r\nContent-Length: 2342\r\nContent-Type: text/html\r\nDate: ");
}

//verifies that the request parsing works also when \n is used instead of \r\n
function testLFTermination() {
    var content;
    var reqStr;
    var expectedRes1 = "HTTP/1.1 200 OK\r\nContent-Length: 14\r\nContent-Type: text/plain\r\nDate: ";
    var expectedRes2 = "\r\n\r\nHello World!!!HTTP/1.1 200 OK\r\nContent-Length: 2673\r\n" +
        "Content-Type: text/plain\r\nConnection: close\r\nDate: ";

    content = "some random string\n\n\r\n\r\n with CRs\r\n\r\n and LFs\n\n\n";
    reqStr =
        "GET  /www/Hello.txt HTTP/1.1\nContent-Length: " + content.length + "\r\n\n" + content +
        "GET\t/www/features.txt\tHTTP/1.1\nconnection:close\n\r\n";
    sendRawReq("test LF termination", reqStr, expectedRes1, expectedRes2);
}

//uses an handler that throws an exception in order to verify that the server doesn't crush
function testBadHandler() {
    APP.use("/some_dir", function (req, res, next) {
        throw new Error("bad handler was called - as expected");
    });

    var origPath = OPTIONS.path;

    OPTIONS.path = "/some_dir/some_file";
    generateRequest(function () {});

    OPTIONS.path = origPath;
}

//starts our web server
function startServer() {
    APP = MINI_EXPRESS();

    // check the next() mechanism
    APP.use("www", function (req, res, next) {
        next();
    });

    APP.use("www", MINI_EXPRESS.static(__dirname +"/www"));

    MY_HTTP = APP.listen(PORT);
}

//stops our web server
function stopServer() {
    return MY_HTTP.close();
}

//tests the close method of the server
function testCloseServer() {
    var ret;
    var wasCallbackCalled = false;

    MY_HTTP.on("close", function() {
        wasCallbackCalled = true;
    });
    ret = stopServer();
    if (!ret) {
        console.log("server close FAILED")
    }
    ret = stopServer(); //do nothing
    ret = stopServer(); //do nothing
    if (ret) {
        console.log("server close FAILED")
    }

    setTimeout(function () {
        if (wasCallbackCalled) {
            console.log("test myHttp.on('close') PASSED");
        } else {
            console.log("test myHttp.on('close') FAILED");
        }
        MY_HTTP = APP.listen(PORT);
        console.log("test close server and then restart it: PASSED ");
        testRequest("/www/Hello.txt", 200, {"content-type": "text/plain"}, "Hello World!!!");
        setTimeout(function () {
            stopServer();
        }, 1000 * 2);
    }, 1000 * 5);
}

//sends request with cookies and check the cookie parsing of the cookieParser handler
function testCookiesParsing() {
    var app = MINI_EXPRESS();
    var cookies = {
        "cookie1": "cookie1 value",
        "cookie2": "cookie2 value",
        "cookie3": {a: "a", b: "b", obj: {c: "c", d: "c"}}
    };
    var server;

    app.get(MINI_EXPRESS.cookieParser());

    app.get(function(req, res, next) {
        if (JSON.stringify(req.cookies) ===  JSON.stringify(cookies)) {
            console.log("test cookies parsing: PASSED");
        } else {
            console.log("test cookies parsing: FAILED");
            console.log("req.cookies:");
            console.log(req.cookies);
        }
        next();
    });

    server = app.listen(FREE_PORT);
    OPTIONS.port = FREE_PORT;
    FREE_PORT++;
    OPTIONS.headers["cookie"] =
        "cookie1=cookie1 value; cookie2=cookie2 value;cookie3=" + JSON.stringify(cookies["cookie3"]);
    testRequest("www/Hello.txt", 200, {"content-type": "text/plain"}, "Hello World!!!");
    delete(OPTIONS.headers["cookie"]);
    OPTIONS.port = PORT;

    setTimeout(server.close, 1000);
}

//sends illegal cokies and checks the the cookieParser responds well.
function testBadCookies() {
    var app = MINI_EXPRESS();
    var server;
    var expectedRes = {
        status: 500,
        version: "1.1"
    };

    app.use(MINI_EXPRESS.cookieParser());

    server = app.listen(FREE_PORT);
    OPTIONS.port = FREE_PORT;
    FREE_PORT++;
    OPTIONS.headers["cookie"] = "=val";
    generateRequest(getValidateResCB("test bad cookies: =val", "bad cookie format", expectedRes));
    OPTIONS.headers["cookie"] = "a,b=val";
    generateRequest(getValidateResCB("test bad cookies: a,b=val", "bad cookie format", expectedRes));
    delete(OPTIONS.headers["cookie"]);
    OPTIONS.port = PORT;

    setTimeout(server.close, 1000);
}

//checks that the res.cookie method adds the wanted set-cookie headers to the response
function testSetCookies() {
    var app = MINI_EXPRESS();
    var expectedRes = {
        status: 200,
        version: "1.1",
        extraHeaders: {"set-cookie":
            ["cookie1=cookie1 value; domain=.example2.com; Path=/some_url2; Secure",
             "cookie2=cookie2 value; Path=/www/Hello.txt; HttpOnly",
             "cookie3=cookie3 value; HttpOnly; Path=/",
             'cookie4={"a":"some","b":"object","c":{"a":"a","b":"b"}}; Path=/'
            ]}
    };
    var server;

    app.get(function (req, res, next) {
        res.cookie("cookie1", "cookie1 value", {domain: ".example2.com", path: "/some_url2", secure: true});
        res.cookie("cookie2", "cookie2 value", {path: "/www/Hello.txt", httpOnly: true});
        res.cookie("cookie3", "cookie3 value", {secure: false, httpOnly: true});
        res.cookie("cookie4", {a: "some", b: "object", c: {a: "a", b: "b"}});

        next();
    });

    server = app.listen(FREE_PORT);
    OPTIONS.port = FREE_PORT;
    FREE_PORT++;

    generateRequest(getValidateResCB("test request with cookies", "Hello World!!!", expectedRes));

    OPTIONS.port = PORT;

    setTimeout(server.close, 1000);
}

//starts to http servers that listen to different ports and use the same app
function testOneAppTwoServers() {
    var app = MINI_EXPRESS();
    var server1;
    var server2;
    var message = "response from the handler";
    var expectedRes = {
        status: 400,
        version: "1.1"
    };

    app.get(OPTIONS.path, function(req, res, next) {
        res.send(400, message);
    });

    server1 = app.listen(FREE_PORT);
    OPTIONS.port = FREE_PORT;
    FREE_PORT++;
    generateRequest(getValidateResCB("test one app two servers - server1", message, expectedRes));

    server2 = app.listen(FREE_PORT);
    OPTIONS.port = FREE_PORT;
    FREE_PORT++;
    generateRequest(getValidateResCB("test one app two servers - server2", message, expectedRes));

    OPTIONS.port = PORT;

    setTimeout(server1.close, 1000);
    setTimeout(server2.close, 1000);
}

//tests the second way to start the server as stated in the ex requirements
function testWayToStartServer() {
    var express = require("./miniExpress");
    var http = require("./miniHttp");
    var app = express();
    var server;
    var message = "response from the handler";
    var expectedRes = {
        status: 400,
        version: "1.1"
    };

    app.use(function(req, res, next) {
        res.send(400, message);
    });

    server = http.createServer(app).listen(FREE_PORT);
    OPTIONS.port = FREE_PORT;
    FREE_PORT++;
    generateRequest(getValidateResCB("test another way to start the server", message, expectedRes));
    OPTIONS.port = PORT;

    setTimeout(server.close, 1000);
}

//checks the http implicit header sending and relevant methods in the http response.
function testHttpImplicitHeader() {
    var http = require("./miniHttp");
    var server;
    var msg = "some message";
    var expectedRes = {
        status: 400,
        version: "1.1",
        extraHeaders: {"content-type": "text/plain"}
    };

    function handler(req, res) {
        res.setHeader("Content-Type", "text/plain").setHeader("Content-Length", msg.length);
        if (res.getHeader("content-type") === "text/plain") {
            console.log("http response getHeader(): PASSED");
        } else {
            console.log("http response getHeader(): FAILED");
        }
        res.removeHeader("content-type");
        if (res.getHeader("content-type") === undefined) {
            console.log("http response removeHeader(): PASSED");
        } else {
            console.log("http response removeHeader(): FAILED");
        }
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/plain").end(msg);
    }


    server = http.createServer(handler).listen(FREE_PORT);
    OPTIONS.port = FREE_PORT;
    FREE_PORT++;

    generateRequest(getValidateResCB("test http implicit header", msg, expectedRes));
    OPTIONS.port = PORT;

    setTimeout(server.close, 1000);
}

//tests the urlencoded handler
function testUrlencodedHandler() {
    var express = require("./miniExpress");
    var app = express();
    var server;
    var body = "a=b&c=d&obj[key]=val&obj2[key2]=val2&obj[other_key]=other_val&test=%28%2Agood+val%2A%29";
    var goodObj = {
        a: "b",
        c: "d",
        obj: {key: "val", other_key: "other_val"},
        obj2: {key2: "val2"},
        test: "(*good val*)"
    };
    var expectedRes = {
        status: 400,
        version: "1.1"
    };

    app.put(express.urlencoded());

    app.use(function(req, res, next) {

        if (req.method === "PUT") {
            if (JSON.stringify(req.body) === JSON.stringify(goodObj)) {
                console.log("test urlencoded handler with method PUT: PASSED");
            } else {
                console.log("test urlencoded handler with method PUT: FAILED");
                console.log("body is: ");
                console.log(req.body);
            }
        } else {
            if (JSON.stringify(req.body) === JSON.stringify({})) {
                console.log("test urlencoded handler with method " + req.method + ": PASSED");
            } else {
                console.log("test urlencoded handler with method " + req.method + ": FAILED");
                console.log("body is: ");
                console.log(req.body);
            }
        }

        next();
    });

    app.use("/www", function(req, res, next) {
        res.send(400);
    });

    server = app.listen(FREE_PORT);
    OPTIONS.port = FREE_PORT;
    FREE_PORT++;

    OPTIONS.headers["Content-Length"] = body.length;
    OPTIONS.headers["Content-Type"] = "application/x-www-form-urlencoded";
    OPTIONS.method = "PUT";
    generateRequest(getValidateResCB("test urlencoded handler with PUT - validate response", true, expectedRes), body);
    OPTIONS.method = "GET";
    generateRequest(getValidateResCB("test urlencoded handler with PUT - validate response", true, expectedRes), body);
    delete (OPTIONS.headers["Content-Length"]);
    delete (OPTIONS.headers["Content-Type"]);

    OPTIONS.port = PORT;

    setTimeout(server.close, 1000);
}

//tests a query parsing of url in the format "/path/?query"
function testQuery() {
    var express = require("./miniExpress");
    var app = express();
    var server;
    var oldPath = OPTIONS.path;
    var query =
        "?a=b&c=d&obj[key]=val&obj2[key2]=val2&obj[%3Cother+key%3E]=%28%2Aval%2A%29&test%3F%23=%28%2Agood+val%2A%29";
    var goodObj = {
        a: "b",
        c: "d",
        obj: {key: "val", "<other key>": "(*val*)"},
        obj2: {key2: "val2"},
        "test?#": "(*good val*)"
    };
    var expectedRes = {
        status: 200,
        version: "1.1"
    };

    app.use(function(req, res, next) {
        if (JSON.stringify(req.query) === JSON.stringify(goodObj)) {
            console.log("test query: PASSED");
        } else {
            console.log("test query: FAILED");
            console.log("query is:");
            console.log(req.query);
        }

        if (req.param("test?#") === "(*good val*)" && JSON.stringify(req.param("obj")) === JSON.stringify(goodObj.obj)) {
            console.log("test param() with query: PASSED");
        } else {
            console.log("test param() with query: FAILED");
        }

        next();
    });

    server = app.listen(FREE_PORT);
    OPTIONS.port = FREE_PORT;
    FREE_PORT++;
    OPTIONS.path += query;
    generateRequest(getValidateResCB("test query - validate response", true, expectedRes));
    OPTIONS.port = PORT;
    OPTIONS.path = oldPath;

    setTimeout(server.close, 1000);
}

//uses the app.listen function with a callback argument and check that the callback runs
function testListenWithCallback() {
    var express = require("./miniExpress");
    var app = express();
    var server;
    var expectedRes = {
        status: 400,
        version: "1.1"
    };

    server = app.listen(FREE_PORT, function () {
        app.use(function(req, res, next) {
            res.send(400);
        });
    });
    OPTIONS.port = FREE_PORT;
    FREE_PORT++;
    generateRequest(getValidateResCB("test listen with callback", true, expectedRes));
    OPTIONS.port = PORT;

    setTimeout(server.close, 1000);
}

//tests the setTimeout method of the http server
function testHttpServerTimeout() {
    var express = require("./miniExpress");
    var app = express();
    var server;
    var expectedRes = {
        status: 200,
        version: "1.1"
    };
    var callbackCalled = false;


    server = app.listen(FREE_PORT);
    server.setTimeout(100, function (socket) {
        callbackCalled = true;
        socket.end();
    });

    OPTIONS.port = FREE_PORT;
    FREE_PORT++;
    generateRequest(getValidateResCB("test setTimeout with callback", false, expectedRes));
    OPTIONS.port = PORT;

    setTimeout(function () {
        if (callbackCalled) {
            console.log("test http server timeout PASSED");
        } else {
            console.log("test http server timeout FAILED");
        }
    }, 1000);

    setTimeout(server.close, 2000);
}

//checks that params are set correctly for resource with ":"
function testParams(useResource, url, expectedParams, key, value) {
    var express = require("./miniExpress");
    var app = express();
    var server;
    var oldPath = OPTIONS.path;
    var expectedRes = {
        status: 400,
        version: "1.1"
    };

    app.get(useResource, function(req, res, next) {
        if (JSON.stringify(req.params) === JSON.stringify(expectedParams)) {
            console.log("test params: " + useResource + ", " + url + ": PASSED");
        } else {
            console.log("test params: " + useResource + ", " + url + ": FAILED");
            console.log("req.params is:");
            console.log(req.params);
            console.log("expected params:");
            console.log(expectedParams);
        }

        if (key !== undefined) {
            if (req.param(key) === value) {
                console.log("test param() for params: PASSED");
            } else {
                console.log("test param() for params: FAILED");
            }
        }

        res.send(400);
    });

    server = app.listen(FREE_PORT);
    OPTIONS.port = FREE_PORT;
    FREE_PORT++;
    OPTIONS.path = url;
    generateRequest(
        getValidateResCB("test params: " + useResource + ", " + url + "- validate response", true, expectedRes));
    OPTIONS.port = PORT;
    OPTIONS.path = oldPath;
    setTimeout(server.close, 1000);
}

//checks that params are set correctly for resources with ":" for many cases.
function testManyParams() {
    testParams("/a/b/c", "/a/b/c", {}, "param", undefined);

    testParams("/res1/:param/res2", "/res1/par/res2", {param: "par"}, "param", "par");

    testParams("/:param1/:param2/:param3", "/a/b/c", {param1: "a", param2: "b", param3: "c"});
    testParams(":param1/:param2/:param3", "/a/b/c", {param1: "a", param2: "b", param3: "c"});
    testParams("/:param1/:param2/:param3", "a/b/c", {param1: "a", param2: "b", param3: "c"});
    testParams(":param1/:param2/:param3", "a/b/c", {param1: "a", param2: "b", param3: "c"});
    testParams("/:param1/:param2/:param3/", "/a/b/c", {param1: "a", param2: "b", param3: "c"});
    testParams("/:param1/:param2/:param3", "/a/b/c/", {param1: "a", param2: "b", param3: "c"});
    testParams("/:param1/:param2/:param3/", "/a/b/c/", {param1: "a", param2: "b", param3: "c"}, "param3", "c");

    testParams("/x/:y", "/x/y", {y: "y"});
    testParams("/x/:y", "/x/y/z", {y: "y"});
    testParams("/x/:y/z/:w", "/x/y/z/w/a/b/c", {y: "y", w: "w"});
    testParams("/:x/y", "/x/y", {x: "x"}, "x", "x");
    testParams(":x/y", "/x/y", {x: "x"});
    testParams("x/:y", "/x/y", {y: "y"});
    testParams("/x/:y/", "/x/y", {y: "y"});
    testParams(":x/y/", "/x/y", {x: "x"});
}

//tests the bodyParser handler
function testBodyParser() {
    var express = require("./miniExpress");
    var app = express();
    var server;
    var bodyJson = '{"a":"b","c":"d","obj":{"key":"val","other_key":"other_val"},"obj2":{"key2":"val2"},"test":"good"}';
    var bodyUrlencoded = "a=b&c=d&obj[key]=val&obj2[key2]=val2&obj[other_key]=other_val&test=good";
    var goodObj = {
        a: "b",
        c: "d",
        obj: {key: "val", other_key: "other_val"},
        obj2: {key2: "val2"},
        test: "good"
    };
    var expectedRes = {
        status: 400,
        version: "1.1"
    };

    app.use(express.bodyParser());

    app.use(function(req, res, next) {

        if (req.method === "PUT") {
            if (JSON.stringify(req.body) === JSON.stringify(goodObj)) {
                console.log("test bodyParser with method JSON: PASSED");
            } else {
                console.log("test bodyParser with method JSON: FAILED");
                console.log("body is: ");
                console.log(req.body);
            }
            if (req.is("application/*") && req.is("json") && req.is("application/json") && !req.is("not")) {
                console.log("test req.is() in json: PASSED");
            } else {
                cosnole.log("test req.is() in json: FAILED");
            }
        }
        if (req.method === "POST") {
            if (JSON.stringify(req.body) === JSON.stringify(goodObj)) {
                console.log("test bodyParser with method urlencoded: PASSED");
            } else {
                console.log("test bodyParser with method urlencoded: FAILED");
                console.log("body is: ");
                console.log(req.body);
            }
            if (req.is("application/*") && req.is("x-www-form-urlencoded") &&
                req.is("application/x-www-form-urlencoded") && !req.is("not")) {
                console.log("test req.is() in urlencoded: PASSED");
            } else {
                cosnole.log("test req.is() in urlencoded: FAILED");
            }
        }

        if (req.param("test") === "good" && JSON.stringify(req.param("obj")) === JSON.stringify(goodObj.obj)) {
            console.log("test param() with body: PASSED");
        } else {
            console.log("test param() with body: FAILED");
        }

        next();
    });

    app.use("/www", function(req, res, next) {
        res.send(400);
    });

    server = app.listen(FREE_PORT);
    OPTIONS.port = FREE_PORT;
    FREE_PORT++;

    OPTIONS.headers["Content-Length"] = bodyJson.length;
    OPTIONS.headers["Content-Type"] = "application/json";
    OPTIONS.method = "PUT";
    generateRequest(
        getValidateResCB("test bodyParser with method JSON - validate response", true, expectedRes),
        bodyJson);
    OPTIONS.method = "POST";
    OPTIONS.headers["Content-Type"] = "application/x-www-form-urlencoded";
    OPTIONS.headers["Content-Length"] = bodyUrlencoded.length;
    generateRequest(
        getValidateResCB("test bodyParser with method urlencoded - validate response", true, expectedRes),
        bodyUrlencoded);
    delete (OPTIONS.headers["Content-Length"]);
    delete (OPTIONS.headers["Content-Type"]);
    OPTIONS.method = "GET";
    OPTIONS.port = PORT;

    setTimeout(server.close, 1000);
}

//tests the bodyParser handler with bad body: both bad urlencoded and bad JSON
function testBadBody() {
    var express = require("./miniExpress");
    var app = express();
    var server;
    var bodyJson = 'this is not a valid JSON!';
    var bodyUrlencoded = "bad";

    var expectedRes1 = {
        status: 200,
        version: "1.1"
    };

    var expectedRes2 = {
        status: 500,
        version: "1.1"
    };

    app.use(express.bodyParser());

    server = app.listen(FREE_PORT);
    OPTIONS.port = FREE_PORT;
    FREE_PORT++;

    OPTIONS.headers["Content-Length"] = bodyJson.length;
    OPTIONS.headers["Content-Type"] = "application/json";
    generateRequest(
        getValidateResCB("test bad body with JSON", true, expectedRes1),
        bodyJson);

    OPTIONS.headers["Content-Type"] = "application/x-www-form-urlencoded";

    OPTIONS.headers["Content-Length"] = bodyUrlencoded.length;
    generateRequest(
        getValidateResCB("test bad body: " + bodyUrlencoded, "bad body format", expectedRes2),
        bodyUrlencoded);

    delete (OPTIONS.headers["Content-Length"]);
    delete (OPTIONS.headers["Content-Type"]);
    OPTIONS.port = PORT;

    setTimeout(server.close, 1000);
}

//tests the json handler
function testJsonHandler() {
    var express = require("./miniExpress");
    var app = express();
    var server;
    var body = '{"a":"b","c":"d","obj":{"key":"val","other_key":"other_val"},"obj2":{"key2":"val2"},"test":"good"}';
    var goodObj = {
        a: "b",
        c: "d",
        obj: {key: "val", other_key: "other_val"},
        obj2: {key2: "val2"},
        test: "good"
    };
    var expectedRes = {
        status: 400,
        version: "1.1"
    };

    app.put(express.json());

    app.use(function(req, res, next) {

        if (req.method === "PUT") {
            if (JSON.stringify(req.body) === JSON.stringify(goodObj)) {
                console.log("test json handler with method PUT: PASSED");
            } else {
                console.log("test json handler with method PUT: FAILED");
                console.log("body is: ");
                console.log(req.body);
            }
        } else {
            if (JSON.stringify(req.body) === JSON.stringify({})) {
                console.log("test json handler with method " + req.method + ": PASSED");
            } else {
                console.log("test json handler with method " + req.method + ": FAILED");
                console.log("body is: ");
                console.log(req.body);
            }
        }

        next();
    });

    app.use("/www", function(req, res, next) {
        res.send(400);
    });

    server = app.listen(FREE_PORT);
    OPTIONS.port = FREE_PORT;
    FREE_PORT++;

    OPTIONS.headers["Content-Length"] = body.length;
    OPTIONS.headers["Content-Type"] = "application/json";
    OPTIONS.method = "PUT";
    generateRequest(getValidateResCB("test json handler with PUT - validate response", true, expectedRes), body);
    OPTIONS.method = "GET";
    generateRequest(getValidateResCB("test json handler with PUT - validate response", true, expectedRes), body);
    delete (OPTIONS.headers["Content-Length"]);
    delete (OPTIONS.headers["Content-Type"]);

    OPTIONS.port = PORT;

    setTimeout(server.close, 1000);
}

//tests app.put, app.get, app.delete and app.post methods
function testAllMethods() {
    var express = require("./miniExpress");
    var http = require("./miniHttp");
    var app = express();
    var server;
    var putMessage = "put handler";
    var getMessage = "get handler";
    var deleteMessage = "delete handler";
    var postMessage = "post handler";
    var useMessage = "use handler";
    var badMessage = "bad handler";
    var expectedRes = {
        status: 400,
        version: "1.1"
    };
    var headerBeforeSet;

    app.put("/www", function(req, res, next) {
        res.send(400, putMessage);
    });
    app.put("", function(req, res, next) {
        res.send(400, badMessage);
    });
    app.delete(function(req, res, next) {
        res.send(400, deleteMessage);
    });
    app.get(function(req, res, next) {
        res.send(400, getMessage);
    });
    app.post(function(req, res, next) {
        if (/^127\.0\.0\.1:.+/.test(req.host)) {
            console.log("test req.host PASSED");
        } else {
            console.log("test req.host FAILED");
            console.log("req.host is: " + req.host);
        }
        if (!req.is("")) {
            console.log("test req.is() without content-type defined: PASSED");
        } else {
            console.log("test req.is() without content-type defined: FAILED");
        }
        headerBeforeSet = res.get("connection");
        res.set("Connection", "keep-alive");
        res.set({"host": "test.com:80", "via": "proxy:80"})
        if (headerBeforeSet === undefined &&
            res.get("connection") === "keep-alive" &&
            res.get("host") === "test.com:80" &&
            res.get("via") === "proxy:80") {
            console.log("test res.set(): PASSED");
        } else {
            console.log("test res.set(): FAILED");
        }

        res.send(400, postMessage);
    });
    app.use(function(req, res, next) {
        res.send(400, useMessage);
    });

    OPTIONS.headers["Content-Length"] = "0";

    server = http.createServer(app).listen(FREE_PORT);
    OPTIONS.port = FREE_PORT;
    FREE_PORT++;
    OPTIONS.method = "PUT";
    generateRequest(getValidateResCB("test all methods - put", putMessage, expectedRes));
    OPTIONS.method = "DELETE";
    generateRequest(getValidateResCB("test all methods - delete", deleteMessage, expectedRes));
    OPTIONS.method = "POST";
    generateRequest(getValidateResCB("test all methods - post", postMessage, expectedRes));
    OPTIONS.method = "GET";
    generateRequest(getValidateResCB("test all methods - get", getMessage, expectedRes));

    OPTIONS.port = PORT;
    delete(OPTIONS.headers["Content-Length"]);

    if (app.route["put"].length === 2 && app.route["get"].length === 1 &&
        app.route["post"].length === 1 && app.route["delete"].length === 1) {
        console.log("test app.route: PASSED");
    } else {
        console.log("test app.route: FAILED");
    }

    setTimeout(server.close, 1000);
}

function testRest(testId, method, reqBody, reqPath, resBody, resStatus, cookie) {
    var expectedRes = {
        status: resStatus,
        version: "1.1"
    };

    if (cookie !== undefined) {
        OPTIONS.headers["cookie"] = cookie;
    }

    OPTIONS.headers["Content-Length"] = reqBody.length.toString();
    OPTIONS.path = reqPath;
    OPTIONS.method = method;
    generateRequest(getValidateResCB(testId, resBody, expectedRes), reqBody);

    delete(OPTIONS.headers["Content-Length"]);
    delete(OPTIONS.headers["cookie"]);
}

function testItem() {
    testRest("get empty items array", "GET", "", "/item", [], 200, LAST_COOKIE);
    testRest("get items with bad cookie", "GET", "", "/item", "bad session ID", 400, "key=ABCDEFG");
    testRest("get items with no cookie", "GET", "", "/item", "bad session ID", 400);

    setTimeout(function() {
        testRest("add a new item", "POST", JSON.stringify({id: 123, value:"item1"}), "/item", {status:0, msg: "success"},
            500, LAST_COOKIE);
        testRest("add a new item", "POST", JSON.stringify({id: "someID", value:"item2"}), "/item",
            {status: 0, msg: "success"}, 500, LAST_COOKIE);
    }, 500);

    setTimeout(function () {
        testRest("verify the addition", "GET", "", "/item",
            [{id: "123", title: "item1", completed: false}, {id: "someID", title: "item2", completed: false}],
            200, LAST_COOKIE);
        testRest("add items with bad cookie", "POST", JSON.stringify({id: 300, value:"item3"}), "/item",
            {status: 1, msg: "bad session id"}, 500, "key=very bad cookie");
        testRest("add items with no cookie", "POST", JSON.stringify({id: 124, value:"item1"}), "/item",
            {status: 1, msg: "bad session id"}, 500);
        testRest("add with a missing value", "POST", JSON.stringify({id: 123}), "/item",
            {status: 1, msg: "invalid params"}, 500, LAST_COOKIE);
        testRest("add with a missing id", "POST", JSON.stringify({value:"item3"}), "/item",
            {status: 1, msg: "invalid params"}, 500, LAST_COOKIE);
        testRest("add with a undefined value", "POST", JSON.stringify({id: 300, value: undefined}), "/item",
            {status: 1, msg: "invalid params"}, 500, LAST_COOKIE);
        testRest("add with a bad value type", "POST", JSON.stringify({id: 300, value: 333}), "/item",
            {status: 1, msg: "invalid params"}, 500, LAST_COOKIE);
        testRest("add with a bad id type", "POST", JSON.stringify({id: {key: "val"}, value: "abc"}), "/item",
            {status: 1, msg: "invalid params"}, 500, LAST_COOKIE);
        testRest("add with id already in use", "POST", JSON.stringify({id: "someID", value:"item4"}), "/item",
            {status: 1, msg: "id already in use"}, 500, LAST_COOKIE);

        testRest("update with bad cookie", "put", JSON.stringify({id: "someID", value:"updated", status: 1}), "/item",
            {status: 1, msg: "bad session id"}, 500, "key=very bad cookie");
        testRest("update with bad id", "PUT", JSON.stringify({id: "bad", value:"updated", status: 1}), "/item",
            {status: 1, msg: "bad id"}, 500, LAST_COOKIE);
        testRest("update with missing params", "PUT", JSON.stringify({id: 123}), "/item",
            {status: 1, msg: "invalid params"},500, LAST_COOKIE);
        testRest("update with a missing params2", "PUT", JSON.stringify({id: 123, value:"item1"}), "/item",
            {status: 1, msg: "invalid params"}, 500, LAST_COOKIE);
        testRest("update with an undefined value", "PUT", JSON.stringify({id: 123, value: undefined, status: 0}),
            "/item", {status: 1, msg: "invalid params"}, 500, LAST_COOKIE);
        testRest("update with a bad value type", "PUT", JSON.stringify({id: 300, value: 333, status: 0}), "/item",
            {status: 1, msg: "invalid params"}, 500, LAST_COOKIE);
        testRest("update with a bad id type", "PUT", JSON.stringify({id: {key: "val"}, value: "abc", status: 0}),
            "/item", {status: 1, msg: "invalid params"}, 500, LAST_COOKIE);
        testRest("update with a bad status value", "PUT", JSON.stringify({id: 123, value: "abc", status: 2}), "/item",
            {status: 1, msg: "invalid params"}, 500, LAST_COOKIE);
        testRest("update with a bad status type", "PUT", JSON.stringify({id: 123, value: "abc", status: "0"}), "/item",
            {status: 1, msg: "invalid params"}, 500, LAST_COOKIE);
    }, 1000);

    setTimeout(function () {
    testRest("update an item", "PUT", JSON.stringify({id: 123, value: "updated", status: 1}), "/item",
        {status: 0, msg: "success"}, 500, LAST_COOKIE);
    }, 1500);

    setTimeout(function () {
        testRest("verify the update", "GET", "", "/item",
            [{id: "123", title: "updated", completed: true}, {id: "someID", title: "item2", completed: false}], 200,
            LAST_COOKIE);
        testRest("delete with missing param", "DELETE", JSON.stringify({}), "/item",
            {status: 1, msg: "id must be a number or a string"}, 500, LAST_COOKIE);
        testRest("delete with bad id type", "DELETE", JSON.stringify({id: {a: "b"}}), "/item",
            {status: 1, msg: "id must be a number or a string"}, 500, LAST_COOKIE);
        testRest("delete with bad cookie", "DELETE", JSON.stringify({id: "someID"}), "/item",
            {status: 1, msg: "bad session id"}, 500, "key=very bad cookie");
        testRest("delete with bad id", "DELETE", JSON.stringify({id: "bad"}), "/item",
            {status: 1, msg: "bad id"}, 500, LAST_COOKIE);
    }, 2000);

    setTimeout(function () {
        testRest("delete an item", "DELETE", JSON.stringify({id: "someID"}), "/item",
            {status: 0, msg: "success"}, 500, LAST_COOKIE);
    }, 2500);

    setTimeout(function () {
    testRest("verify the delete", "GET", "", "/item", [{id: "123", title: "updated", completed: true}], 200,
        LAST_COOKIE);
    }, 3000);

    setTimeout(function () {
        testRest("add a new item", "POST", JSON.stringify({id: "someID", value:"new item"}), "/item",
            {status: 0, msg: "success"}, 500, LAST_COOKIE);
    }, 3500);

    setTimeout(function () {
        testRest("verify the addition", "GET", "", "/item",
            [{id: "123", title: "updated", completed: true}, {id: "someID", title: "new item", completed: false}], 200,
            LAST_COOKIE);
    }, 4000);

    setTimeout(function () {
        testRest("delete all completed items", "DELETE", JSON.stringify({id: -1}), "/item", {status: 0, msg: "success"},
            500, LAST_COOKIE);
    }, 4500);

    setTimeout(function () {
        testRest("verify the delete", "GET", "", "/item", [{id: "someID", title:"new item", completed: false}], 200,
            LAST_COOKIE);
    }, 5000);
}


//runs the tests for ex5
//note: the webserver must run on port EX5_PORT in order for the tests to pass
function runTestsEx5() {
    var server = require("./todoServer").start(EX5_PORT);
    OPTIONS.port = EX5_PORT;

    //register tests
    testRest("register with no input params", "POST", JSON.stringify({}), "/register", "missing input params", 500);
    testRest("register with missing params", "POST", JSON.stringify({username: "gal", fullName: "gal vardi"}),
        "/register", "missing input params", 500);
    testRest("register without body", "POST", "", "/register", "missing input params", 500);
    testRest("good register", "POST", JSON.stringify({username: "gal", fullName: "gal vardi", password: "pass"}),
        "/register", true, 200);
    testRest("register other user", "POST", JSON.stringify({username: "user", fullName: "user", password: "p"}),
        "/register", true, 200);


    //login tests
    testRest("login with no input params", "POST", JSON.stringify({}), "/login", "missing username or password", 500);
    testRest("login with missing params", "POST", JSON.stringify({username: "gal"}), "/login",
        "missing username or password", 500);
    testRest("login without body", "POST", "", "/login", "missing username or password", 500);
    testRest("login with bad user", "POST", JSON.stringify({username: "notgal", password: "pass"}), "/login",
        "bad username or password", 500);
    testRest("login with bad password", "POST", JSON.stringify({username: "gal", password: "bad"}), "/login",
        "bad username or password", 500);
    setTimeout(function () {
        testRest("register existing user", "POST", JSON.stringify({username: "gal", fullName: "gal vardi", password: ""}),
            "/register", "user already exists", 500);
        testRest("good login", "POST", JSON.stringify({username: "gal", password: "pass"}), "/login", true, 200);
        testRest("good login again", "POST", JSON.stringify({username: "gal", password: "pass"}), "/login", true, 200);
    }, 1000);
    setTimeout(function() {
        testRest("other user login", "POST", JSON.stringify({username: "user", password: "p"}), "/login", true, 200);
    }, 2000);

    //item tests
    setTimeout(testItem, 3000);

    //expired cookie test
    setTimeout(function () {
        //in order to commit this test change the MAX_AGE var in the data model and uncomment this line:

//        testRest("get after session expired", "GET", "", "/item", "bad session ID", 400, LAST_COOKIE);
    }, 15000);

    setTimeout(server.close, 16000);
}

//runs the tests for ex4 except the stress tests
function runTestsEx4() {
    testCookiesParsing();
    testBadCookies();
    testSetCookies();
    testOneAppTwoServers();
    testWayToStartServer();
    testAllMethods();
    testUrlencodedHandler();
    testJsonHandler();
    testBodyParser();
    testQuery();
    testManyParams();
    testListenWithCallback();
    testBadBody();
    testHttpServerTimeout();
    testHttpImplicitHeader()
}


//runs all the tests for ex3 except the stress tests
function runTestsEx3() {
    startServer();

    //testPrintResponse("www/Hello.txt");
    testRequest("/www/Hello.txt", 200, {"content-type": "text/plain"}, "Hello World!!!");
    testRequest("/bad/dir/index.html", 404, {}, "bad path"); //bad directory: no handler
    testBadHandler();

    //without '/' in the beginning:
    testRequest("www/Hello.txt", 200, {"content-type": "text/plain"}, "Hello World!!!");
    testRequest("NoPartner.txt", 200, {"content-type": "text/plain"}, "");
    testRequest("/www/profile.html", 200, {"content-type": "text/html"});
    testRequest("/www/features.txt", 200, {"content-type": "text/plain"});
    testRequest("/www/profile.js", 200, {"content-type": "application/javascript"});
    testRequest("/www/style.css", 200, {"content-type": "text/css"});
    testRequest("/www/me.jpg", 200, {"content-type": "image/jpeg"});
    testRequest("/www/earth.gif", 200, {"content-type": "image/gif"});
    testRequest("/www/features.txt?name=gal&age=old", 200, {"content-type": "text/plain"});

    testRequest("/www/", 404, {}, "bad path"); //directory which is the root resource
    testRequest("/www", 404, {}, "bad path"); //directory which is the root resource
    testRequest("/www/some_dir", 404, {}, "bad path"); //directory
    testRequest("/www/../www/Hello.txt", 404, {connection: "close"}, "bad URL: contains .."); //contains ..
    testRequest("/www/bad.txt", 404, {}, "bad path"); //file does not exist
    testRequest("/www/ex3.pdf", 500, {}, "File type not supported by this server"); //bad file type

    //for this test create first a file cant_read.txt in www and remove reading permissions for it
    //testRequest("/www/cant_read.txt", 500, {socket: "close"}, "An internal FS error in the server");

    testHead();
    testReqWithBody();

    testHttp10();
    testHttp10WithKeepAlive();
    testHttp10BadPath();
    testDestroyAfterWrite();
    testEndAfterWrite();
    testMalformedPackets();
    testLFTermination();
    testTwoRequestsInOneChunk();
    testOneRequestInAFewChunks();
    testTwoRequestsInTwoChunks1(0);
    testTwoRequestsInTwoChunks1(10);
    testTwoRequestsInTwoChunks1(100);
    testTwoRequestsInTwoChunks1(1000);
    testTwoRequestsInTwoChunks2();
    testCaseInsensitiveHeaders();
    testSpacesInFirstLine();

    testManyRequests(true, true, 1, 1000); // server should close the socket immediately
    testManyRequests(true, false, 1, 1000); // server should close the socket immediately
    testManyRequests(false, true, 1, 1000); // client should close the socket after the response
    testManyRequests(false, false, 1, 1000); // server should close the socket after timeout

    setTimeout(testCloseServer, 1000 * 5);
}

//runs all the tests except the stress tests
function runTests() {
//    runTestsEx3();
//    runTestsEx4();
    runTestsEx5();
}

//runs stress tests
function runLoad() {
    startServer();

    testManyRequests(true, true, 150, 1000 * 7); // server should close the socket immediately
    testManyRequests(true, false, 150, 1000 * 7); // server should close the socket immediately
    testManyRequests(false, true, 150, 1000 * 7); // client should close the socket after the response
    testManyRequests(false, false, 150, 1000 * 7); // server should close the socket after timeout

    // run these tests to verify that the server isn't sensitive to DOS attacks:
    //      it won't crush, and it will be able to serve new clients after the DOS attack is done
    //      in addition, after running these tests make sure there is no fd leak (with handle.exe)
    //      these tests work better with a server in another process - run the webServer in another process
    //          and comment the first line in this function
//    testManyRequests(true, true, 100000, 1000 * 3600);//server should close the socket immediately
//    testManyRequests(true, false, 100000, 1000 * 3600);//server should close the socket immediately
//    testManyRequests(false, true, 100000, 1000 * 3600);//client should close the socket after the response
//    testManyRequests(false, false, 100000, 1000 * 3600);//server should close the socket after timeout

    setTimeout(function () {
        stopServer();
    }, 1000 * 10);
}

exports.test = runTests;
exports.load = runLoad;

//uncomment to start the tester:
//runTests();

//uncomment to start the stress test:
//runLoad();