var data = require("./data");
var miniExpress = require("./miniExpress");
var app = miniExpress();

function startServer(port) {

    app.use(miniExpress.json());
    app.use(miniExpress.cookieParser());

    app.post("/login", function(req, res) {
        if (req.body.username === undefined || req.body.password === undefined) {
            res.send(500, "missing username or password");
            return;
        }

        if (data.checkUser(req.body.username, req.body.password)) {
            data.login(req.body.username, function(success, sessionId) {
                if (!success) {
                    res.send(500, "unexpected error");
                } else {
                    res.cookie("key", sessionId, {expires: new Date(Date.now() + data.maxAge)});
                    res.send(200);
                }
            });
        } else {
            res.send(500, "bad username or password");
        }
    });

    app.post("/register", function(req, res) {
        if (req.body.username === undefined || req.body.fullName === undefined ||
            req.body.password === undefined) {
            res.send(500, "missing input params");
            return;
        }

        if (data.checkUser(req.body.username)) {
            res.send(500, "user already exists");
        } else {
            data.addUser(req.body.username, req.body.fullName, req.body.password);
            res.send(200);
        }
    });

    app.get("/item", function (req, res) {
        var items = data.getItems(req.cookies.key);

        if (items !== undefined) {
            res.send(200, items);
        } else {
            res.send(400, "bad session ID");
        }
    });

    function sendItem500Res(res, errorMsg) {
        var status = 0;

        if (errorMsg !== "success") {
            status = 1;
        }

        res.send(500, {status: status, msg: errorMsg});
    }

    app.post("/item", function (req, res) {
        var errorMsg;

        if (typeof req.body.value !== "string" ||
            (typeof req.body.id !== "number" && typeof req.body.id !== "string")
            ) {
            errorMsg = "invalid params";
        } else {
            errorMsg = data.addItem(req.cookies.key, req.body.id, req.body.value);
        }

        sendItem500Res(res, errorMsg);
    });

    app.put("/item", function (req, res) {
        var errorMsg;

        if (typeof req.body.value !== "string" ||
            (typeof req.body.id !== "number" && typeof req.body.id !== "string") ||
            (req.body.status !== 0 && req.body.status !== 1)
            ) {
            errorMsg = "invalid params";
        } else {
            errorMsg = data.updateItem(req.cookies.key, req.body.id, req.body.value, (req.body.status === 1));
    }

        sendItem500Res(res, errorMsg);
    });

    app.delete("/item", function (req, res) {
        var errorMsg;

        if (typeof req.body.id !== "number" && typeof req.body.id !== "string") {
            errorMsg = "id must be a number or a string";
        } else {
            errorMsg = data.deleteItem(req.cookies.key, req.body.id);
        }

        sendItem500Res(res, errorMsg);
    });

    app.use(miniExpress.static(__dirname + "/www"));

    return app.listen(port);
}

exports.start = startServer;
