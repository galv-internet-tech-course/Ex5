/*global todomvc, angular */
'use strict';

/**
 * The controller for the login (and register) view
 */
todomvc.controller('LoginCtrl', function LoginCtrl($scope, $http, $location) {
    $scope.regPassword = $scope.regPassword2 = $scope.loginPassword = "";

    $scope.sendLoginInfo = function () {
        $http.post(
            "/login",
            {username: $scope.loginUsername, password: $scope.loginPassword}
        ).success(function() {
            $location.path("/");
        }).error(function(data, status) {
            alert("login failed with status " + status + ": " + data);
        });
    };

    $scope.sendRegisterInfo = function () {
        if ($scope.regPassword !== $scope.regPassword2) {
            alert("the two passwords are not identical");
            return;
        }
        $http.post(
            "/register",
            {username: $scope.regUsername, fullName: $scope.regFullName, password: $scope.regPassword}
        ).success(function() {
            alert("registration succeeded");
        }).error(function(data, status) {
            alert("registration failed with status " + status + ": " + data);
        });
    };

});
