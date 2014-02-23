What was hard in this ex?
-------------------------
It includes many new features, and a lot of code. Therefore it takes a lot of time to prepare.
Testing the code was also not a small task.
In addition, the Node API (of Node's http and express modules) is not very well documented in the internet.

What was fun in this ex?
------------------------
Building such a full dynamic and modular web server is a very good way to learn Node.

2 bad handlers that cause DOS:
------------------------------

app.use("/hello/hacker", function (req, res, next) {
    console.log("I am evil!");
    while (true) {}
});

app.use("/hello/hacker", function (req, res, next) {
    console.log("I am evil!");
    process.exit(1);
});

How to get them executed?
-------------------------
Just browse for the URL: http://server-hostname:server-port/hello/hacker