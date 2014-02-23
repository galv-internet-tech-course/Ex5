/*global todomvc, angular */
'use strict';

/**
 * The main controller for the app. The controller:
 * - retrieves and persists the model via the todoStorage service
 * - exposes the model to the template and provides event handlers
 */
todomvc.controller('TodoCtrl', function TodoCtrl($scope, $routeParams, $location, todoStorage, filterFilter) {
    var todos = $scope.todos = [];

    function getTodos() {
        todoStorage.getItems(function(errorMsg, itemsFromServer) {
            if (errorMsg == "success") {
                todos = itemsFromServer;
                $scope.todos = todos;
            } else if (errorMsg === "login required") {
                alert("login is required");
                $location.path("/login");
            } else {
                alert(errorMsg);
            }
        });
    }

	getTodos();

    $scope.newTodo = '';
    $scope.editedTodo = null;

    $scope.$watch('todos', function () {
        $scope.remainingCount = filterFilter(todos, { completed: false }).length;
        $scope.completedCount = todos.length - $scope.remainingCount;
        $scope.allChecked = !$scope.remainingCount;
    }, true);

    // Monitor the current route for changes and adjust the filter accordingly.
    $scope.$on('$routeChangeSuccess', function () {
        var status = $scope.status = $routeParams.status || '';

        $scope.statusFilter = (status === 'active') ?
            { completed: false } : (status === 'completed') ?
            { completed: true } : null;
    });

    $scope.addTodo = function () {
        var id;
        var newTodo = $scope.newTodo.trim();

        if (!newTodo.length) {
            return;
        }

        id = Math.floor(Math.random() * 0xffffffffffff);
        todoStorage.addItem(id, newTodo, function(success, msg) {
            if (!success) {
                alert("error while adding an item: " + msg);
            }

            getTodos();
        });

        $scope.newTodo = '';
    };

    $scope.editTodo = function (todo) {
        $scope.editedTodo = todo;
        // Clone the original to restore it on demand.
        $scope.originalTodo = angular.extend({}, todo);
    };

    $scope.doneEditing = function (todo) {
        $scope.editedTodo = null;
        todo.title = todo.title.trim();

        if (!todo.title) {
            $scope.removeTodo(todo);
        } else {
            todoStorage.updateItem(todo.id, todo.title, todo.completed, function(success, msg) {
                if (!success) {
                    alert("error while updating an item: " + msg);
                }
                getTodos();
            });
        }
    };

    $scope.revertEditing = function (todo) {
        todos[todos.indexOf(todo)] = $scope.originalTodo;
        $scope.editedTodo = null;
    };

    $scope.removeTodo = function (todo) {
        var index = todos.indexOf(todo);

        if (index === -1) {
            return;
        }
        todos.splice(index, 1);

        todoStorage.deleteItem(todo.id, function(success, msg) {
            if (!success) {
                alert("error while deleting item: " + msg);
            }

            getTodos();
        });
    };

    $scope.clearCompletedTodos = function () {
        todoStorage.deleteItem(-1, function(success, msg) {
            if (!success) {
                alert("error while deleting completed items: " + msg);
            }

            getTodos();
        });
    };

    $scope.markAll = function (completed) {
        var responseCounter = todos.length;

        todos.forEach(function (todo) {
            todoStorage.updateItem(todo.id, todo.title, !completed, function(success, msg) {
                if (!success) {
                    alert("put error: " + msg);
                }
                responseCounter--;
                if (responseCounter === 0) {
                    getTodos();
                }
            });
        });
    };

    $scope.markOne = function (todo) {
        todoStorage.updateItem(todo.id, todo.title, !todo.completed, function(success, msg) {
            if (!success) {
                alert("put error: " + msg);
            }
            getTodos();
        });
    };
});
