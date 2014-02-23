/*global todomvc */
'use strict';

/**
 * Services that persists and retrieves TODOs from the server
 */
todomvc.factory('todoStorage', function ($http) {

    function httpToServer(method, body, callback) {
        $http({
            method: method, url:"/item", data: body, headers: {"Content-Type": "application/json;charset=UTF-8"}
        }).success(function() {
                callback(false, "unexpected response status from server: 200");
            }).error(function(data, status) {
                if (status !== 500) {
                    callback(false, "unexpected response status from server: " + status);
                } else {
                    callback((data.status === 0), data.msg);
                }
            });
    }

	return {
		getItems: function (callback) {
			$http.get("/item").success(function(data) {
                callback("success", data);
            }).error(function(data, status) {
                if (status === 400) {
                    callback("login required");
                } else {
                    callback("error while getting items");
                }
            });
		},

        addItem: function (id, value, callback) {
            httpToServer("POST", {id: id, value: value}, callback);
        },

        updateItem: function (id, value, completed, callback) {
            var completedStatus = completed ? 1 : 0;

            httpToServer("PUT", {id: id, value: value, status: completedStatus}, callback);
        },

        deleteItem: function (id, callback) {
            httpToServer("DELETE", {id: id}, callback);
        }

	};
});
