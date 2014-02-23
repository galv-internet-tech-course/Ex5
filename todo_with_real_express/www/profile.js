var goodUsername = "admin";
var goodPassword = "admin";

var defaultVal = 0;

$(document).ready(function() {
	$("form").submit(handleLogin);
	$("#input_box").keypress(verifyNumber);
	$("#settings_button").click(handleSettings);

	var calc = new Calculator();
	$("#add_button").click(calc.handleAdd);
	$("#mul_button").click(calc.handleMul);
	$("#clear_button").click(calc.handleClear);
});

/* the login form callback */
function handleLogin(event) {
	var user = $("#uname").val();
	var pass = $("#password").val();
 
	if ((user === goodUsername ) && (pass === goodPassword)) {
		$("#profile_pic").hide();
		$("#main_content").hide();
		$("#funny_part").hide();
		$("#calculator_part").show();
	} else {
		alert("wrong username or password");
	}

	event.preventDefault();
}

/* callback that verifies that the pressed char is the input box a number 
	after each keypress */
function verifyNumber(event) {
	if ((event.which < 48) || (event.which > 57)) {
		alert("only positive numbers are allowed");
		event.preventDefault();
	}
}

/* the settings button handler callback */
function handleSettings(event) {
	var newDefault = parseInt(
		prompt("please enter a number as a new default value"));
	if (isNaN(newDefault)) {
		alert("you entered an illegal new default");
	} else {
		defaultVal = newDefault;
	}
}

/* the calculator constructor */
function Calculator() {
	var curVal = defaultVal;

	/* the add button handler callback */
	this.handleAdd = function(event) {
		var inputVal = parseInt($("#input_box").val());
		if (isNaN(inputVal)) {
			inputVal = 0;
		}
		curVal = curVal + inputVal;
		$("#screen").text(curVal.toString());
	}

	/* the multiply button handler callback */
	this.handleMul = function(event) {
		var inputVal = parseInt($("#input_box").val());
		if (isNaN(inputVal)) {
			inputVal = 0;
		}
		curVal = curVal * inputVal;
		$("#screen").text(curVal.toString());	
	}

	/* the clear button handler callback */
	this.handleClear = function(event) {
		curVal = defaultVal;
		$("#screen").text(curVal.toString());
		$("#input_box").val("");
	}
}
